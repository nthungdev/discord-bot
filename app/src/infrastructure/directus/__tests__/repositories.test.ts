import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GUILD_CONFIG } from "../../../domain/models/guild-config";
import { DEFAULT_ROAST_PRESET } from "../../../domain/models/roast-preset";
import { BufferedDirectusRoastLogRepository } from "../buffered-roast-log.repo";
import { directusClient } from "../client";
import { DirectusGuildConfigRepository } from "../directus-guild-config.repo";
import { DirectusRoastPresetRepository } from "../directus-roast-preset.repo";
import { DirectusUserProfileRepository } from "../directus-user-profile.repo";

describe("Directus Repositories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("DirectusGuildConfigRepository", () => {
    it("should return cached config on subsequent calls and evict upon invalidation", async () => {
      const mockRequest = vi
        .spyOn(directusClient, "request")
        .mockResolvedValueOnce([
          {
            id: "1",
            guild_id: "guild-123",
            enable_ai_roast: true,
            default_locale: "en",
            max_roasts_per_day: 15,
            allowed_channel_ids: ["c1", "c2"],
          },
        ]);

      const repo = new DirectusGuildConfigRepository();
      const first = await repo.getConfig("guild-123");
      expect(first.guildId).toBe("guild-123");
      expect(first.defaultLocale).toBe("en");
      expect(first.maxRoastsPerDay).toBe(15);
      expect(first.allowedChannelIds.has("c1")).toBe(true);
      expect(mockRequest).toHaveBeenCalledTimes(1);

      // Second call hits in-memory cache
      const second = await repo.getConfig("guild-123");
      expect(second).toEqual(first);
      expect(mockRequest).toHaveBeenCalledTimes(1);

      // Invalidation clears cache
      repo.invalidate("guild-123");
      mockRequest.mockResolvedValueOnce([
        {
          id: "1",
          guild_id: "guild-123",
          enable_ai_roast: false,
          default_locale: "vi",
        },
      ]);
      const third = await repo.getConfig("guild-123");
      expect(third.enableAiRoast).toBe(false);
      expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it("should return fallback default configuration when Directus fails", async () => {
      vi.spyOn(directusClient, "request").mockRejectedValueOnce(
        new Error("Connection refused"),
      );

      const repo = new DirectusGuildConfigRepository();
      const config = await repo.getConfig("guild-error");

      expect(config.guildId).toBe("guild-error");
      expect(config.enableAiRoast).toBe(DEFAULT_GUILD_CONFIG.enableAiRoast);
      expect(config.defaultLocale).toBe(DEFAULT_GUILD_CONFIG.defaultLocale);
    });

    it("should update valorant config in Directus and invalidate cache", async () => {
      const mockRequest = vi
        .spyOn(directusClient, "request")
        .mockResolvedValueOnce([{ id: "cfg-1", guild_id: "guild-val" }]) // read existing
        .mockResolvedValueOnce({}); // update

      const repo = new DirectusGuildConfigRepository();
      await repo.updateValorantConfig("guild-val", true, {
        compare: { enabled: true },
      });

      expect(mockRequest).toHaveBeenCalledTimes(2);
    });
  });

  describe("DirectusRoastPresetRepository", () => {
    it("should return cached preset and evict on invalidation", async () => {
      const mockRequest = vi
        .spyOn(directusClient, "request")
        .mockResolvedValueOnce([
          {
            id: "1",
            preset_name: "savage",
            system_prompt: "Roast intensely.",
            temperature: 0.9,
            is_active: true,
            banned_terms: ["slur"],
          },
        ]);

      const repo = new DirectusRoastPresetRepository();
      const preset = await repo.getPreset("savage");
      expect(preset.name).toBe("savage");
      expect(preset.systemPrompt).toBe("Roast intensely.");
      expect(mockRequest).toHaveBeenCalledTimes(1);

      // Second call hits cache
      const cached = await repo.getPreset("savage");
      expect(cached.name).toBe("savage");
      expect(mockRequest).toHaveBeenCalledTimes(1);

      // Invalidation evicts cache
      repo.invalidate("savage");
      mockRequest.mockResolvedValueOnce([
        {
          id: "1",
          preset_name: "savage",
          system_prompt: "Updated prompt.",
        },
      ]);
      const refreshed = await repo.getPreset("savage");
      expect(refreshed.systemPrompt).toBe("Updated prompt.");
      expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it("should return fallback DEFAULT_ROAST_PRESET on Directus failure", async () => {
      vi.spyOn(directusClient, "request").mockRejectedValueOnce(
        new Error("Network timeout"),
      );

      const repo = new DirectusRoastPresetRepository();
      const preset = await repo.getPreset("non-existent");
      expect(preset).toEqual(DEFAULT_ROAST_PRESET);
    });
  });

  describe("DirectusUserProfileRepository", () => {
    it("should perform per-interaction check for user opt-out status with guild scoping", async () => {
      const mockRequest = vi
        .spyOn(directusClient, "request")
        .mockResolvedValueOnce([{ opt_out_roast: true }])
        .mockResolvedValueOnce([
          { opt_out_roast: false, opted_out_guild_ids: ["g-target"] },
        ])
        .mockResolvedValueOnce([
          { opt_out_roast: false, opted_out_guild_ids: ["g-other"] },
        ])
        .mockResolvedValueOnce([]);

      const repo = new DirectusUserProfileRepository();

      const res1 = await repo.isOptedOut("user-opted-out", "g-any");
      expect(res1).toBe(true);

      const res2 = await repo.isOptedOut("user-guild-opted-out", "g-target");
      expect(res2).toBe(true);

      const res3 = await repo.isOptedOut("user-guild-opted-out", "g-not-opted");
      expect(res3).toBe(false);

      const res4 = await repo.isOptedOut("user-unknown", "g-any");
      expect(res4).toBe(false);

      expect(mockRequest).toHaveBeenCalledTimes(4);
    });

    it("should rethrow if Directus throws an error to prevent fail-open bypass", async () => {
      vi.spyOn(directusClient, "request").mockRejectedValueOnce(
        new Error("Service unavailable"),
      );

      const repo = new DirectusUserProfileRepository();
      await expect(repo.isOptedOut("user-error")).rejects.toThrow(
        "Service unavailable",
      );
    });

    it("should persist linkRiotAccount to Directus and rethrow on error", async () => {
      const mockRequest = vi
        .spyOn(directusClient, "request")
        .mockResolvedValueOnce([{ id: "prof-1", user_id: "user-riot" }]) // getProfile
        .mockResolvedValueOnce([{ id: "prof-1", user_id: "user-riot" }]) // link query
        .mockResolvedValueOnce({}); // link update

      const repo = new DirectusUserProfileRepository();
      await repo.linkRiotAccount("user-riot", "TenZ#NA1", "na", "puuid-123");
      expect(mockRequest).toHaveBeenCalledTimes(3);

      // Verify failure rethrow
      mockRequest.mockRejectedValue(new Error("Directus write failed"));
      await expect(
        repo.linkRiotAccount("user-fail", "Fail#NA1", "na", "puuid-fail"),
      ).rejects.toThrow("Directus write failed");
    });
  });

  describe("BufferedDirectusRoastLogRepository", () => {
    it("should buffer entries and flush batch to Directus", async () => {
      const mockRequest = vi
        .spyOn(directusClient, "request")
        .mockResolvedValue({});
      const repo = new BufferedDirectusRoastLogRepository(25, 60000);

      repo.record({
        guildId: "g1",
        channelId: "c1",
        callerId: "u1",
        targetId: "u2",
        topic: "gaming",
        generatedText: "You game poorly.",
        latencyMs: 120,
      });

      // Initially not flushed because batch size is 25
      expect(mockRequest).toHaveBeenCalledTimes(0);

      // Trigger explicit flush
      await repo.flush();
      expect(mockRequest).toHaveBeenCalledTimes(1);

      await repo.destroy();
    });

    it("should trigger automatic flush when queue reaches batch size", async () => {
      const mockRequest = vi
        .spyOn(directusClient, "request")
        .mockResolvedValue({});
      const repo = new BufferedDirectusRoastLogRepository(5, 60000);

      for (let i = 0; i < 5; i++) {
        repo.record({
          guildId: "g1",
          channelId: "c1",
          callerId: "u1",
          targetId: `u${i}`,
          generatedText: `Roast ${i}`,
          latencyMs: 100,
        });
      }

      // Reached batchSize 5, should trigger flush
      expect(mockRequest).toHaveBeenCalledTimes(1);
      await repo.destroy();
    });
  });
});
