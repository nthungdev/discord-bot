import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ValorantFeaturesConfig } from "../../../config/types";
import { DEFAULT_GUILD_CONFIG } from "../../../domain/models/guild-config";
import { DEFAULT_ROAST_PRESET } from "../../../domain/models/roast-preset";
import { BufferedDirectusRoastLogRepository } from "../buffered-roast-log.repo";
import { directusClient } from "../client";
import {
  DirectusGuildConfigRepository,
  extractValorantFeaturesFromRaw,
  flattenValorantFeaturesToRaw,
} from "../directus-guild-config.repo";
import { DirectusRoastPresetRepository } from "../directus-roast-preset.repo";
import { DirectusUserProfileRepository } from "../directus-user-profile.repo";
import type { DirectusGuildConfigRaw } from "../types";

describe("Directus Repositories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Valorant flattened column mappers", () => {
    it("should round-trip a full ValorantFeaturesConfig across flattenValorantFeaturesToRaw and extractValorantFeaturesFromRaw", () => {
      const fullFeatures: ValorantFeaturesConfig = {
        compare: { enabled: true },
        statsSummary: { enabled: false, defaultPeriod: "current_act" },
        autoRecap: {
          enabled: true,
          channelId: "ch-recap-1",
          minTierAlert: 18,
          sportscasterBanter: false,
        },
        liveScouting: {
          enabled: true,
          channelId: "ch-scout-1",
          alertOnGameStart: true,
        },
        rankRoleSync: {
          enabled: true,
          roleMappings: { Radiant: "role-rad", Immortal: "role-imm" },
        },
        tiltProtection: {
          enabled: false,
          consecutiveLossesThreshold: 4,
          nightOwlHourStart: 0,
          nightOwlHourEnd: 5,
          dmAlert: true,
        },
      };

      const flattened = flattenValorantFeaturesToRaw(fullFeatures);

      expect(flattened).toEqual({
        valorant_compare_enabled: true,
        valorant_stats_enabled: false,
        valorant_stats_default_period: "current_act",
        valorant_auto_recap_enabled: true,
        valorant_auto_recap_channel_id: "ch-recap-1",
        valorant_auto_recap_min_tier_alert: 18,
        valorant_auto_recap_sportscaster_banter: false,
        valorant_live_scouting_enabled: true,
        valorant_live_scouting_channel_id: "ch-scout-1",
        valorant_live_scouting_alert_on_game_start: true,
        valorant_rank_role_sync_enabled: true,
        valorant_rank_role_mappings: {
          Radiant: "role-rad",
          Immortal: "role-imm",
        },
        valorant_tilt_enabled: false,
        valorant_tilt_consecutive_losses_threshold: 4,
        valorant_tilt_night_owl_hour_start: 0,
        valorant_tilt_night_owl_hour_end: 5,
        valorant_tilt_dm_alert: true,
      });

      const reconstructed = extractValorantFeaturesFromRaw({
        id: "cfg-1",
        guild_id: "g-1",
        ...flattened,
      });

      expect(reconstructed).toEqual(fullFeatures);
    });

    it("should return undefined when extracting from empty or all-null raw valorant fields", () => {
      expect(
        extractValorantFeaturesFromRaw({ id: "cfg-1", guild_id: "g-1" }),
      ).toBeUndefined();

      expect(
        extractValorantFeaturesFromRaw({
          id: "cfg-1",
          guild_id: "g-1",
          valorant_compare_enabled: null,
          valorant_stats_enabled: null,
          valorant_stats_default_period: null,
          valorant_auto_recap_enabled: null,
          valorant_auto_recap_channel_id: null,
          valorant_auto_recap_min_tier_alert: null,
          valorant_auto_recap_sportscaster_banter: null,
          valorant_live_scouting_enabled: null,
          valorant_live_scouting_channel_id: null,
          valorant_live_scouting_alert_on_game_start: null,
          valorant_rank_role_sync_enabled: null,
          valorant_rank_role_mappings: null,
          valorant_tilt_enabled: null,
          valorant_tilt_consecutive_losses_threshold: null,
          valorant_tilt_night_owl_hour_start: null,
          valorant_tilt_night_owl_hour_end: null,
          valorant_tilt_dm_alert: null,
        }),
      ).toBeUndefined();
    });

    it("should handle undefined and partial ValorantFeaturesConfig when flattening", () => {
      expect(flattenValorantFeaturesToRaw(undefined)).toEqual({});
      expect(flattenValorantFeaturesToRaw({})).toEqual({});

      const partialFlattened = flattenValorantFeaturesToRaw({
        compare: { enabled: false },
        autoRecap: { minTierAlert: 0 },
      });
      expect(partialFlattened).toEqual({
        valorant_compare_enabled: false,
        valorant_auto_recap_min_tier_alert: 0,
      });
      expect(
        extractValorantFeaturesFromRaw({
          id: "cfg-partial",
          guild_id: "g-partial",
          ...partialFlattened,
        } as DirectusGuildConfigRaw),
      ).toEqual({
        compare: { enabled: false },
        autoRecap: { minTierAlert: 0 },
      });
    });
  });

  describe("DirectusGuildConfigRepository", () => {
    it("should map flattened columns, cache config, and evict upon invalidation", async () => {
      const mockRequest = vi
        .spyOn(directusClient, "request")
        .mockResolvedValueOnce([
          {
            id: "rec-1",
            bot_id: "chatBot",
            guild_id: "guild-123",
            guild_name: "Test Guild",
            roast_enabled: true,
            roast_default_locale: "en-US",
            roast_max_per_day: 15,
            roast_allowed_channel_ids: ["c1", "c2"],
            voice_bouncer_enabled: true,
            matchmaking_lobby_channel_id: "lobby-1",
            valorant_enabled: true,
            valorant_compare_enabled: false,
            valorant_stats_default_period: "all_time",
          },
        ]);

      const repo = new DirectusGuildConfigRepository();
      const first = await repo.getConfig("guild-123");
      expect(first.guildId).toBe("guild-123");
      expect(first.guildName).toBe("Test Guild");
      expect(first.enableAiRoast).toBe(true);
      expect(first.enableBouncergon).toBe(true);
      expect(first.defaultLocale).toBe("en");
      expect(first.maxRoastsPerDay).toBe(15);
      expect(first.allowedChannelIds.has("c1")).toBe(true);
      expect(first.matchmakingLobbyChannelId).toBe("lobby-1");
      expect(first.valorantEnabled).toBe(true);
      expect(first.valorantFeatures).toEqual({
        compare: { enabled: false },
        statsSummary: { defaultPeriod: "all_time" },
      });
      expect(mockRequest).toHaveBeenCalledTimes(1);

      // Second call hits in-memory cache
      const second = await repo.getConfig("guild-123");
      expect(second).toEqual(first);
      expect(mockRequest).toHaveBeenCalledTimes(1);

      // Invalidation by record ID clears guild cache
      repo.invalidate("rec-1");
      mockRequest.mockResolvedValueOnce([
        {
          id: "rec-1",
          guild_id: "guild-123",
          roast_enabled: false,
          roast_default_locale: "vi",
          voice_bouncer_enabled: false,
        },
      ]);
      const third = await repo.getConfig("guild-123");
      expect(third.enableAiRoast).toBe(false);
      expect(third.defaultLocale).toBe("vi");
      expect(third.enableBouncergon).toBe(false);
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

    it("should update existing guild config with flattened valorant_* columns and invalidate cache", async () => {
      const mockRequest = vi
        .spyOn(directusClient, "request")
        .mockResolvedValueOnce([
          {
            id: "cfg-1",
            guild_id: "guild-val",
            valorant_enabled: false,
          },
        ])
        .mockResolvedValueOnce([{ id: "cfg-1", guild_id: "guild-val" }])
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce([
          {
            id: "cfg-1",
            guild_id: "guild-val",
            valorant_enabled: true,
            valorant_compare_enabled: true,
          },
        ]);

      const repo = new DirectusGuildConfigRepository();
      const initial = await repo.getConfig("guild-val");
      expect(initial.valorantEnabled).toBe(false);

      await repo.updateValorantConfig("guild-val", true, {
        compare: { enabled: true },
        tiltProtection: { enabled: true, consecutiveLossesThreshold: 3 },
      });

      expect(mockRequest).toHaveBeenCalledTimes(3);
      const updateCommand = mockRequest.mock.calls[2][0] as unknown as () => {
        path: string;
        method: string;
        body: string;
      };
      const executed = updateCommand();
      expect(executed.method).toBe("PATCH");
      expect(executed.path).toBe("/items/bot_guild_configs/cfg-1");
      expect(JSON.parse(executed.body)).toEqual({
        valorant_enabled: true,
        valorant_compare_enabled: true,
        valorant_tilt_enabled: true,
        valorant_tilt_consecutive_losses_threshold: 3,
      });

      // Cache was invalidated so subsequent getConfig re-queries Directus
      const refreshed = await repo.getConfig("guild-val");
      expect(refreshed.valorantEnabled).toBe(true);
      expect(mockRequest).toHaveBeenCalledTimes(4);
    });

    it("should create a new guild config row with bot_id 'chatBot' and flattened valorant_* columns when none exists", async () => {
      const mockRequest = vi
        .spyOn(directusClient, "request")
        .mockResolvedValueOnce([]) // read existing returns empty
        .mockResolvedValueOnce({}); // createItem

      const repo = new DirectusGuildConfigRepository();
      await repo.updateValorantConfig("guild-new", false, {
        statsSummary: { enabled: true, defaultPeriod: "recent_20" },
        autoRecap: { enabled: false, channelId: "ch-auto" },
      });

      expect(mockRequest).toHaveBeenCalledTimes(2);
      const createCommand = mockRequest.mock.calls[1][0] as unknown as () => {
        path: string;
        method: string;
        body: string;
      };
      const executed = createCommand();
      expect(executed.method).toBe("POST");
      expect(executed.path).toBe("/items/bot_guild_configs");
      expect(JSON.parse(executed.body)).toEqual({
        bot_id: "chatBot",
        guild_id: "guild-new",
        roast_enabled: true,
        voice_bouncer_enabled: false,
        roast_default_locale: "vi",
        roast_max_per_day: 10,
        valorant_enabled: false,
        valorant_stats_enabled: true,
        valorant_stats_default_period: "recent_20",
        valorant_auto_recap_enabled: false,
        valorant_auto_recap_channel_id: "ch-auto",
      });
    });

    it("should rethrow when updateValorantConfig fails", async () => {
      vi.spyOn(directusClient, "request").mockRejectedValueOnce(
        new Error("Directus write failure"),
      );

      const repo = new DirectusGuildConfigRepository();
      await expect(
        repo.updateValorantConfig("guild-fail", true, {
          compare: { enabled: true },
        }),
      ).rejects.toThrow("Directus write failure");
    });

    it("should safely handle non-array roast_allowed_channel_ids without throwing or iterating string characters", async () => {
      vi.spyOn(directusClient, "request")
        .mockResolvedValueOnce([
          {
            id: "rec-str",
            guild_id: "guild-str",
            roast_allowed_channel_ids: "123456" as unknown as string[],
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "rec-obj",
            guild_id: "guild-obj",
            roast_allowed_channel_ids: {
              "0": "c1",
            } as unknown as string[],
          },
        ]);

      const repo = new DirectusGuildConfigRepository();
      const stringConfig = await repo.getConfig("guild-str");
      expect(stringConfig.allowedChannelIds).toBeInstanceOf(Set);
      expect(stringConfig.allowedChannelIds.size).toBe(0);

      const objectConfig = await repo.getConfig("guild-obj");
      expect(objectConfig.allowedChannelIds).toBeInstanceOf(Set);
      expect(objectConfig.allowedChannelIds.size).toBe(0);
    });

    it("should return isolated fallback configs that do not share mutable Set instances", async () => {
      vi.spyOn(directusClient, "request")
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error("Directus unreachable"));

      const repo = new DirectusGuildConfigRepository();
      const emptyFallback = await repo.getConfig("guild-empty");
      const errorFallback = await repo.getConfig("guild-err");

      expect(emptyFallback.allowedChannelIds).not.toBe(
        DEFAULT_GUILD_CONFIG.allowedChannelIds,
      );
      expect(errorFallback.allowedChannelIds).not.toBe(
        DEFAULT_GUILD_CONFIG.allowedChannelIds,
      );
      expect(emptyFallback.allowedChannelIds).not.toBe(
        errorFallback.allowedChannelIds,
      );

      emptyFallback.allowedChannelIds.add("mutated-ch");
      expect(errorFallback.allowedChannelIds.has("mutated-ch")).toBe(false);
      expect(DEFAULT_GUILD_CONFIG.allowedChannelIds.has("mutated-ch")).toBe(
        false,
      );
    });

    it("should prevent stale cache write-back when invalidate() is called during an in-flight getConfig()", async () => {
      let resolveInFlight!: (value: unknown) => void;
      const inFlightPromise = new Promise((resolve) => {
        resolveInFlight = resolve;
      });

      const mockRequest = vi
        .spyOn(directusClient, "request")
        .mockReturnValueOnce(inFlightPromise as Promise<unknown>)
        .mockResolvedValueOnce([
          {
            id: "rec-race",
            guild_id: "guild-race",
            roast_enabled: false,
            roast_max_per_day: 99,
          },
        ]);

      const repo = new DirectusGuildConfigRepository();
      const pendingGet = repo.getConfig("guild-race");

      // Invalidate while the first Directus request is still in-flight
      repo.invalidate("guild-race");

      resolveInFlight([
        {
          id: "rec-race",
          guild_id: "guild-race",
          roast_enabled: true,
          roast_max_per_day: 10,
        },
      ]);

      const staleResult = await pendingGet;
      expect(staleResult.enableAiRoast).toBe(true);
      expect(staleResult.maxRoastsPerDay).toBe(10);

      // Because cacheGeneration advanced, stale data was not cached
      const freshResult = await repo.getConfig("guild-race");
      expect(freshResult.enableAiRoast).toBe(false);
      expect(freshResult.maxRoastsPerDay).toBe(99);
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
