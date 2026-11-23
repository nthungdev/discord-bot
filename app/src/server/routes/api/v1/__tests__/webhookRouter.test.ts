import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Config, ConfigParameter } from "../../../../../config";
import { directusClient } from "../../../../../infrastructure/directus/client";
import {
  guildConfigRepository,
  roastPresetRepository,
} from "../../../../../infrastructure/repositories";
import webhookRouter from "../webhookRouter";

const TEST_SECRET = "test-webhook-secret-xyz";

describe("Webhook Router (/cache-invalidate)", () => {
  const app = express();
  app.use(express.json());
  app.use("/webhooks", webhookRouter);

  const originalSecret = process.env.INTERNAL_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.INTERNAL_WEBHOOK_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (originalSecret !== undefined) {
      process.env.INTERNAL_WEBHOOK_SECRET = originalSecret;
    } else {
      delete process.env.INTERNAL_WEBHOOK_SECRET;
    }
  });

  it("should reject requests with missing, mismatched-length, or invalid webhook secret with 401", async () => {
    const wrongRes = await request(app)
      .post("/webhooks/cache-invalidate")
      .set("x-webhook-secret", "wrong-secret")
      .send({ collection: "bot_guild_configs" });
    expect(wrongRes.status).toBe(401);

    const missingHeaderRes = await request(app)
      .post("/webhooks/cache-invalidate")
      .send({ collection: "bot_guild_configs" });
    expect(missingHeaderRes.status).toBe(401);

    const shortRes = await request(app)
      .post("/webhooks/cache-invalidate")
      .set("x-webhook-secret", "short")
      .send({ collection: "bot_guild_configs" });
    expect(shortRes.status).toBe(401);

    delete process.env.INTERNAL_WEBHOOK_SECRET;
    const unconfiguredRes = await request(app)
      .post("/webhooks/cache-invalidate")
      .set("x-webhook-secret", TEST_SECRET)
      .send({ collection: "bot_guild_configs" });
    expect(unconfiguredRes.status).toBe(401);
  });

  it("should accept valid webhook and call guildConfigRepository.invalidate", async () => {
    const invalidateSpy = vi.spyOn(guildConfigRepository, "invalidate");
    const loadConfigSpy = vi
      .spyOn(Config.getInstance(), "loadConfig")
      .mockResolvedValue(undefined);

    const res = await request(app)
      .post("/webhooks/cache-invalidate")
      .set("x-webhook-secret", TEST_SECRET)
      .send({
        collection: "bot_guild_configs",
        keys: ["guild-999"],
        event: "update",
      });

    expect(res.status).toBe(204);
    expect(invalidateSpy).toHaveBeenCalledWith("guild-999");
    expect(loadConfigSpy).toHaveBeenCalledTimes(1);
  });

  it("should accept valid webhook and call roastPresetRepository.invalidate without reloading runtime config", async () => {
    const invalidateSpy = vi.spyOn(roastPresetRepository, "invalidate");
    const loadConfigSpy = vi
      .spyOn(Config.getInstance(), "loadConfig")
      .mockResolvedValue(undefined);

    const res = await request(app)
      .post("/webhooks/cache-invalidate")
      .set("x-webhook-secret", TEST_SECRET)
      .send({
        collection: "bot_roast_presets",
        keys: ["savage"],
        event: "update",
      });

    expect(res.status).toBe(204);
    expect(invalidateSpy).toHaveBeenCalledWith("savage");
    expect(loadConfigSpy).not.toHaveBeenCalled();
  });

  it("should prioritize payload/item domain key and support string or omitted keys", async () => {
    const invalidateSpy = vi.spyOn(guildConfigRepository, "invalidate");
    vi.spyOn(Config.getInstance(), "loadConfig").mockResolvedValue(undefined);

    const payloadRes = await request(app)
      .post("/webhooks/cache-invalidate")
      .set("x-webhook-secret", TEST_SECRET)
      .send({
        collection: "bot_guild_configs",
        keys: ["uuid-12345"],
        payload: { guild_id: "guild-from-payload" },
        event: "update",
      });

    expect(payloadRes.status).toBe(204);
    expect(invalidateSpy).toHaveBeenCalledWith("guild-from-payload");

    const itemRes = await request(app)
      .post("/webhooks/cache-invalidate")
      .set("x-webhook-secret", TEST_SECRET)
      .send({
        collection: "bot_guild_configs",
        keys: ["uuid-67890"],
        item: { guild_id: "guild-from-item" },
        event: "update",
      });

    expect(itemRes.status).toBe(204);
    expect(invalidateSpy).toHaveBeenCalledWith("guild-from-item");

    const stringKeyRes = await request(app)
      .post("/webhooks/cache-invalidate")
      .set("x-webhook-secret", TEST_SECRET)
      .send({
        collection: "bot_guild_configs",
        keys: "guild-single-key",
        event: "update",
      });

    expect(stringKeyRes.status).toBe(204);
    expect(invalidateSpy).toHaveBeenCalledWith("guild-single-key");

    const wildcardRes = await request(app)
      .post("/webhooks/cache-invalidate")
      .set("x-webhook-secret", TEST_SECRET)
      .send({
        collection: "bot_guild_configs",
        event: "delete",
      });

    expect(wildcardRes.status).toBe(204);
    expect(invalidateSpy).toHaveBeenCalledWith();
  });

  it("should reload runtime config on bot_guild_configs and bot_system_config webhooks", async () => {
    const loadConfigSpy = vi
      .spyOn(Config.getInstance(), "loadConfig")
      .mockResolvedValue(undefined);
    const guildInvalidateSpy = vi.spyOn(guildConfigRepository, "invalidate");
    const presetInvalidateSpy = vi.spyOn(roastPresetRepository, "invalidate");

    const guildRes = await request(app)
      .post("/webhooks/cache-invalidate")
      .set("x-webhook-secret", TEST_SECRET)
      .send({
        collection: "bot_guild_configs",
        keys: ["guild-live"],
        event: "items.update",
      });

    expect(guildRes.status).toBe(204);
    expect(guildInvalidateSpy).toHaveBeenCalledWith("guild-live");
    expect(loadConfigSpy).toHaveBeenCalledTimes(1);

    guildInvalidateSpy.mockClear();

    const sysRes = await request(app)
      .post("/webhooks/cache-invalidate")
      .set("x-webhook-secret", TEST_SECRET)
      .send({
        collection: "bot_system_config",
        event: "items.update",
      });

    expect(sysRes.status).toBe(204);
    expect(loadConfigSpy).toHaveBeenCalledTimes(2);
    expect(guildInvalidateSpy).not.toHaveBeenCalled();
    expect(presetInvalidateSpy).not.toHaveBeenCalled();
  });

  it("should still return 204 if Config.loadConfig rejects during webhook processing", async () => {
    vi.spyOn(Config.getInstance(), "loadConfig").mockRejectedValueOnce(
      new Error("Reload failed"),
    );

    const res = await request(app)
      .post("/webhooks/cache-invalidate")
      .set("x-webhook-secret", TEST_SECRET)
      .send({
        collection: "bot_system_config",
        event: "items.update",
      });

    expect(res.status).toBe(204);
  });

  it("should trim INTERNAL_WEBHOOK_SECRET, reject different-length secrets via digest comparison, and sanitize log payloads", async () => {
    process.env.INTERNAL_WEBHOOK_SECRET = `  ${TEST_SECRET}  `;
    vi.spyOn(Config.getInstance(), "loadConfig").mockResolvedValue(undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const badLenRes = await request(app)
      .post("/webhooks/cache-invalidate")
      .set("x-webhook-secret", "short")
      .send({ collection: "bot_system_config" });
    expect(badLenRes.status).toBe(401);

    const okRes = await request(app)
      .post("/webhooks/cache-invalidate")
      .set("x-webhook-secret", TEST_SECRET)
      .send({
        collection: "bot_system_config\r\nFAKE_LOG",
        event: "update\nINJECTED",
      });
    expect(okRes.status).toBe(204);
    expect(logSpy).toHaveBeenCalledWith(expect.not.stringMatching(/[\r\n]/));
  });

  describe("End-to-End Live Reload Integration", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      process.env.INTERNAL_WEBHOOK_SECRET = TEST_SECRET;
      guildConfigRepository.invalidate();
    });

    afterEach(async () => {
      Config.getInstance().stopAutoRefresh();
      guildConfigRepository.invalidate();
      await Config.getInstance().init({ useLocalConfigOnly: true });
      vi.restoreAllMocks();
    });

    it("should update synchronous Config.getBotGuildConfig and Config.getConfigValue reads after Directus webhooks", async () => {
      const requestSpy = vi
        .spyOn(directusClient, "request")
        // 1. Initial Config.init() -> fetchAllConfigs (readSingleton, readItems)
        .mockResolvedValueOnce({
          id: "sys-e2e",
          ai_model_id: "gemini-v1",
          memory_store_type: "directus",
        })
        .mockResolvedValueOnce([
          {
            id: "row-e2e",
            bot_id: "chatBot",
            guild_id: "guild-e2e",
            reply_channel_ids: ["ch-v1"],
            respond_to_mentions: true,
            roast_enabled: true,
            roast_max_per_day: 10,
          },
        ])
        // 2. Warm guildConfigRepository.getConfig("guild-e2e")
        .mockResolvedValueOnce([
          {
            id: "row-e2e",
            bot_id: "chatBot",
            guild_id: "guild-e2e",
            roast_enabled: true,
            roast_max_per_day: 10,
          },
        ])
        // 3. bot_guild_configs webhook -> Config.loadConfig() -> fetchAllConfigs
        .mockResolvedValueOnce({
          id: "sys-e2e",
          ai_model_id: "gemini-v1",
          memory_store_type: "directus",
        })
        .mockResolvedValueOnce([
          {
            id: "row-e2e",
            bot_id: "chatBot",
            guild_id: "guild-e2e",
            reply_channel_ids: ["ch-v2"],
            respond_to_mentions: false,
            roast_enabled: true,
            roast_max_per_day: 42,
            smart_reply_enabled: true,
            smart_reply_strategy: "coalesced",
          },
        ])
        // 4. Subsequent guildConfigRepository.getConfig("guild-e2e") confirms cache was invalidated
        .mockResolvedValueOnce([
          {
            id: "row-e2e",
            bot_id: "chatBot",
            guild_id: "guild-e2e",
            roast_enabled: true,
            roast_max_per_day: 42,
          },
        ])
        // 5. bot_system_config webhook -> Config.loadConfig() -> fetchAllConfigs
        .mockResolvedValueOnce({
          id: "sys-e2e",
          ai_model_id: "gemini-v3",
          memory_store_type: "directus",
        })
        .mockResolvedValueOnce([
          {
            id: "row-e2e",
            bot_id: "chatBot",
            guild_id: "guild-e2e",
            reply_channel_ids: ["ch-v2"],
            respond_to_mentions: false,
            roast_enabled: true,
            roast_max_per_day: 42,
          },
        ]);

      const config = Config.getInstance();
      await config.init({ configSource: "directus", refreshIntervalMs: 0 });

      expect(config.getConfigValue(ConfigParameter.aiModelId)).toBe(
        "gemini-v1",
      );
      expect(
        config.getBotGuildConfig("chatBot", "guild-e2e")?.roast?.maxPerDay,
      ).toBe(10);
      expect(
        config.getBotGuildConfig("chatBot", "guild-e2e")?.replyChannelIds,
      ).toEqual(["ch-v1"]);

      const repoBefore = await guildConfigRepository.getConfig("guild-e2e");
      expect(repoBefore.maxRoastsPerDay).toBe(10);

      // Fire bot_guild_configs webhook
      const guildWebhookRes = await request(app)
        .post("/webhooks/cache-invalidate")
        .set("x-webhook-secret", TEST_SECRET)
        .send({
          collection: "bot_guild_configs",
          keys: ["row-e2e"],
          payload: { guild_id: "guild-e2e" },
          event: "items.update",
        });

      expect(guildWebhookRes.status).toBe(204);

      // Synchronous Config reads now reflect updated Directus guild config
      const updatedGuildCfg = config.getBotGuildConfig("chatBot", "guild-e2e");
      expect(updatedGuildCfg?.replyChannelIds).toEqual(["ch-v2"]);
      expect(updatedGuildCfg?.respondToMentions).toBe(false);
      expect(updatedGuildCfg?.roast?.maxPerDay).toBe(42);
      expect(updatedGuildCfg?.smartReply?.enabled).toBe(true);
      expect(updatedGuildCfg?.smartReply?.replyStrategy).toBe("coalesced");

      // Repository cache was also invalidated and fetches fresh state
      const repoAfter = await guildConfigRepository.getConfig("guild-e2e");
      expect(repoAfter.maxRoastsPerDay).toBe(42);

      // Fire bot_system_config webhook
      const systemWebhookRes = await request(app)
        .post("/webhooks/cache-invalidate")
        .set("x-webhook-secret", TEST_SECRET)
        .send({
          collection: "bot_system_config",
          event: "items.update",
        });

      expect(systemWebhookRes.status).toBe(204);
      expect(config.getConfigValue(ConfigParameter.aiModelId)).toBe(
        "gemini-v3",
      );
      expect(requestSpy).toHaveBeenCalledTimes(8);
    });
  });
});
