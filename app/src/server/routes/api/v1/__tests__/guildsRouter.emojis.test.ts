import path from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Config, ConfigParameter } from "../../../../../config";
import { directusClient } from "../../../../../infrastructure/directus/client";
import { guildConfigRepository } from "../../../../../infrastructure/repositories";
import { getBotManager } from "../../../../../services/bot-manager";

const { suggestEmojiMappingsMock } = vi.hoisted(() => ({
  suggestEmojiMappingsMock: vi.fn(),
}));

vi.mock("../../../../../services/emoji-mapper", () => ({
  suggestEmojiMappings: suggestEmojiMappingsMock,
}));

import guildsRouter from "../guildsRouter";

const TEST_BEARER_TOKEN = "test-emoji-router-bearer-token";
const TEST_GUILD_ID = "guild-emoji-test-123";
const EXAMPLE_CONFIG_PATH = path.resolve(
  __dirname,
  "../../../../../../config.example.json",
);

const SAMPLE_LIVE_EMOJIS = [
  {
    id: "101",
    name: "pepe_laugh",
    animated: false,
    url: "https://cdn.discordapp.com/emojis/101.png",
  },
  {
    id: "102",
    name: "cat_jam",
    animated: true,
    url: "https://cdn.discordapp.com/emojis/102.gif",
  },
  {
    id: "103",
    name: "sadge",
    animated: false,
    url: "https://cdn.discordapp.com/emojis/103.png",
  },
];

describe("Guilds Router — Emoji Mapping Endpoints", () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/guilds", guildsRouter);

  const originalBearerToken = process.env.BEARER_TOKEN;
  const originalConfigPath = process.env.CONFIG_PATH;

  beforeEach(async () => {
    vi.restoreAllMocks();
    suggestEmojiMappingsMock.mockReset();
    process.env.BEARER_TOKEN = TEST_BEARER_TOKEN;
    process.env.CONFIG_PATH = EXAMPLE_CONFIG_PATH;
    await Config.getInstance().init({ useLocalConfigOnly: true });
    vi.spyOn(getBotManager(), "getGuildEmojis").mockResolvedValue(
      SAMPLE_LIVE_EMOJIS,
    );
  });

  afterEach(async () => {
    Config.getInstance().stopAutoRefresh();
    guildConfigRepository.invalidate();
    await Config.getInstance().init({ useLocalConfigOnly: true });
    if (originalBearerToken !== undefined) {
      process.env.BEARER_TOKEN = originalBearerToken;
    } else {
      delete process.env.BEARER_TOKEN;
    }
    if (originalConfigPath !== undefined) {
      process.env.CONFIG_PATH = originalConfigPath;
    } else {
      delete process.env.CONFIG_PATH;
    }
    vi.restoreAllMocks();
  });

  describe("GET /:guildId/emojis", () => {
    it("returns live emojis, current mapping, and computed orphanedEmojis", async () => {
      Config.getInstance().updateGuildEmojis(TEST_GUILD_ID, {
        "😂": ["pepe_laugh", "deleted_meme"],
        "😢": ["deleted_meme", "removed_cry"],
      });

      const res = await request(app)
        .get(`/api/v1/guilds/${TEST_GUILD_ID}/emojis`)
        .set("Authorization", `Bearer ${TEST_BEARER_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        guildId: TEST_GUILD_ID,
        emojis: SAMPLE_LIVE_EMOJIS,
        mapping: {
          "😂": ["pepe_laugh", "deleted_meme"],
          "😢": ["deleted_meme", "removed_cry"],
        },
        orphanedEmojis: ["deleted_meme", "removed_cry"],
      });
    });

    it("rejects unsafe prototype guildId with 400", async () => {
      const res = await request(app)
        .get("/api/v1/guilds/__proto__/emojis")
        .set("Authorization", `Bearer ${TEST_BEARER_TOKEN}`);

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });
  });

  describe("PUT /:guildId/emojis", () => {
    it("rejects invalid payloads with 400", async () => {
      const missingMappingRes = await request(app)
        .put(`/api/v1/guilds/${TEST_GUILD_ID}/emojis`)
        .set("Authorization", `Bearer ${TEST_BEARER_TOKEN}`)
        .send({});
      expect(missingMappingRes.status).toBe(400);

      const nonArrayValueRes = await request(app)
        .put(`/api/v1/guilds/${TEST_GUILD_ID}/emojis`)
        .set("Authorization", `Bearer ${TEST_BEARER_TOKEN}`)
        .send({ mapping: { "😂": "pepe_laugh" } });
      expect(nonArrayValueRes.status).toBe(400);

      const emptyItemRes = await request(app)
        .put(`/api/v1/guilds/${TEST_GUILD_ID}/emojis`)
        .set("Authorization", `Bearer ${TEST_BEARER_TOKEN}`)
        .send({ mapping: { "😂": ["   "] } });
      expect(emptyItemRes.status).toBe(400);

      const overlongKeyRes = await request(app)
        .put(`/api/v1/guilds/${TEST_GUILD_ID}/emojis`)
        .set("Authorization", `Bearer ${TEST_BEARER_TOKEN}`)
        .send({ mapping: { ["x".repeat(33)]: ["pepe_laugh"] } });
      expect(overlongKeyRes.status).toBe(400);

      const overlongNameRes = await request(app)
        .put(`/api/v1/guilds/${TEST_GUILD_ID}/emojis`)
        .set("Authorization", `Bearer ${TEST_BEARER_TOKEN}`)
        .send({ mapping: { "😂": ["e".repeat(101)] } });
      expect(overlongNameRes.status).toBe(400);
    });

    it("sanitizes prototype keys, trims and deduplicates names, drops empty arrays, and updates in-memory Config", async () => {
      const rawJsonPayload = JSON.stringify({
        mapping: {
          __proto__: ["evil_emoji"],
          constructor: ["bad_emoji"],
          "😂": ["  pepe_laugh  ", "pepe_laugh", "cat_jam"],
          "🔥": [],
        },
      });

      const res = await request(app)
        .put(`/api/v1/guilds/${TEST_GUILD_ID}/emojis`)
        .set("Authorization", `Bearer ${TEST_BEARER_TOKEN}`)
        .set("Content-Type", "application/json")
        .send(rawJsonPayload);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.persistedTo).toBe("local");
      expect(res.body.mapping).toEqual({
        "😂": ["pepe_laugh", "cat_jam"],
      });
      expect(Object.hasOwn(res.body.mapping, "constructor")).toBe(false);
      expect(Object.hasOwn(res.body.mapping, "__proto__")).toBe(false);
      expect(Object.hasOwn(res.body.mapping, "🔥")).toBe(false);

      const liveConfig = Config.getInstance().getConfigValue(
        ConfigParameter.guildEmojis,
      );
      expect(liveConfig[TEST_GUILD_ID]).toEqual({
        "😂": ["pepe_laugh", "cat_jam"],
      });
    });

    it("persists to Directus across all guild rows and live-reloads Config when in Directus mode", async () => {
      const directusRequestSpy = vi
        .spyOn(directusClient, "request")
        // Initial Config.init(directus) -> fetchAllConfigs (readSingleton, readItems)
        .mockResolvedValueOnce({ id: "sys-1" })
        .mockResolvedValueOnce([
          { id: "row-chat", bot_id: "chatBot", guild_id: TEST_GUILD_ID },
          { id: "row-police", bot_id: "policeBot", guild_id: TEST_GUILD_ID },
        ])
        // upsertGuildEmojis -> readItems for guild_id
        .mockResolvedValueOnce([
          { id: "row-chat", bot_id: "chatBot", guild_id: TEST_GUILD_ID },
          { id: "row-police", bot_id: "policeBot", guild_id: TEST_GUILD_ID },
        ])
        // updateItem for row-chat and row-police
        .mockResolvedValueOnce({ id: "row-chat" })
        .mockResolvedValueOnce({ id: "row-police" });

      await Config.getInstance().init({
        configSource: "directus",
        refreshIntervalMs: 0,
      });

      const res = await request(app)
        .put(`/api/v1/guilds/${TEST_GUILD_ID}/emojis`)
        .set("Authorization", `Bearer ${TEST_BEARER_TOKEN}`)
        .send({
          mapping: {
            "😢": ["sadge"],
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.persistedTo).toBe("directus");
      expect(res.body.mapping).toEqual({ "😢": ["sadge"] });
      // 2 calls from init + 1 readItems + 2 updateItem calls
      expect(directusRequestSpy).toHaveBeenCalledTimes(5);

      const liveConfig = Config.getInstance().getConfigValue(
        ConfigParameter.guildEmojis,
      );
      expect(liveConfig[TEST_GUILD_ID]).toEqual({ "😢": ["sadge"] });
    });
  });

  describe("POST /:guildId/emojis/ai-suggest", () => {
    it("filters unmapped emojis by default and calls suggestEmojiMappings", async () => {
      Config.getInstance().updateGuildEmojis(TEST_GUILD_ID, {
        "😂": ["pepe_laugh"],
      });

      const expectedSuggestions = [
        {
          customEmojiName: "cat_jam",
          standardEmojis: ["🎵", "🕺"],
          reason: "Dancing cat vibing to music",
        },
        {
          customEmojiName: "sadge",
          standardEmojis: ["😢"],
          reason: "Sad frog expression",
        },
      ];
      suggestEmojiMappingsMock.mockResolvedValueOnce(expectedSuggestions);

      const res = await request(app)
        .post(`/api/v1/guilds/${TEST_GUILD_ID}/emojis/ai-suggest`)
        .set("Authorization", `Bearer ${TEST_BEARER_TOKEN}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        guildId: TEST_GUILD_ID,
        suggestions: expectedSuggestions,
        analyzedCount: 2,
      });
      expect(suggestEmojiMappingsMock).toHaveBeenCalledWith({
        emojis: [SAMPLE_LIVE_EMOJIS[1], SAMPLE_LIVE_EMOJIS[2]],
        existingMapping: { "😂": ["pepe_laugh"] },
      });
    });

    it("filters selected emojis and validates missing customEmojiNames", async () => {
      const invalidRes = await request(app)
        .post(`/api/v1/guilds/${TEST_GUILD_ID}/emojis/ai-suggest`)
        .set("Authorization", `Bearer ${TEST_BEARER_TOKEN}`)
        .send({ scope: "selected" });
      expect(invalidRes.status).toBe(400);

      const expectedSuggestions = [
        {
          customEmojiName: "sadge",
          standardEmojis: ["😢"],
          reason: "Sad reaction",
        },
      ];
      suggestEmojiMappingsMock.mockResolvedValueOnce(expectedSuggestions);

      const res = await request(app)
        .post(`/api/v1/guilds/${TEST_GUILD_ID}/emojis/ai-suggest`)
        .set("Authorization", `Bearer ${TEST_BEARER_TOKEN}`)
        .send({ scope: "selected", customEmojiNames: ["sadge"] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        guildId: TEST_GUILD_ID,
        suggestions: expectedSuggestions,
        analyzedCount: 1,
      });
      expect(suggestEmojiMappingsMock).toHaveBeenCalledWith({
        emojis: [SAMPLE_LIVE_EMOJIS[2]],
        existingMapping: {},
      });
    });

    it("passes all live emojis when scope is 'all'", async () => {
      Config.getInstance().updateGuildEmojis(TEST_GUILD_ID, {
        "😂": ["pepe_laugh"],
      });

      const expectedSuggestions = [
        {
          customEmojiName: "pepe_laugh",
          standardEmojis: ["😂", "🤣"],
          reason: "Laughing frog",
        },
      ];
      suggestEmojiMappingsMock.mockResolvedValueOnce(expectedSuggestions);

      const res = await request(app)
        .post(`/api/v1/guilds/${TEST_GUILD_ID}/emojis/ai-suggest`)
        .set("Authorization", `Bearer ${TEST_BEARER_TOKEN}`)
        .send({ scope: "all" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        guildId: TEST_GUILD_ID,
        suggestions: expectedSuggestions,
        analyzedCount: 3,
      });
      expect(suggestEmojiMappingsMock).toHaveBeenCalledWith({
        emojis: SAMPLE_LIVE_EMOJIS,
        existingMapping: { "😂": ["pepe_laugh"] },
      });
    });

    it("returns empty suggestions without calling AI when no target emojis remain", async () => {
      Config.getInstance().updateGuildEmojis(TEST_GUILD_ID, {
        "😂": ["pepe_laugh"],
        "🎵": ["cat_jam"],
        "😢": ["sadge"],
      });

      const res = await request(app)
        .post(`/api/v1/guilds/${TEST_GUILD_ID}/emojis/ai-suggest`)
        .set("Authorization", `Bearer ${TEST_BEARER_TOKEN}`)
        .send({ scope: "unmapped" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        guildId: TEST_GUILD_ID,
        suggestions: [],
        analyzedCount: 0,
      });
      expect(suggestEmojiMappingsMock).not.toHaveBeenCalled();
    });
  });
});
