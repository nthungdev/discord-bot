import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Config } from "../../../../src/config";
import type { BotGuildConfig } from "../../../../src/config/types";
import { guildConfigRepository } from "../../../../src/infrastructure/repositories";
import app from "../../../../src/server";
import { signSessionToken } from "../../../../src/server/middlewares/auth";

describe("Config Write-Through & Control Plane API Integration", () => {
  const superAdminSession = signSessionToken({
    user: { id: "admin-1", username: "SuperAdmin", discriminator: "0001" },
    role: "SUPER_ADMIN",
    guilds: [],
  });

  const guildAdminSession = signSessionToken({
    user: { id: "gadmin-1", username: "GuildAdmin", discriminator: "0002" },
    role: "GUILD_ADMIN",
    guilds: [
      {
        id: "guild-allowed",
        name: "Allowed Guild",
        owner: true,
        permissions: "8",
        canManage: true,
      },
      {
        id: "guild-readonly",
        name: "Readonly Guild",
        owner: false,
        permissions: "0",
        canManage: false,
      },
    ],
  });

  const viewerSession = signSessionToken({
    user: { id: "viewer-1", username: "ViewerUser", discriminator: "0003" },
    role: "VIEWER",
    guilds: [
      {
        id: "guild-allowed",
        name: "Allowed Guild",
        owner: false,
        permissions: "0",
        canManage: false,
      },
    ],
  });

  const originalEnv = {
    DIRECTUS_PUBLIC_URL: process.env.DIRECTUS_PUBLIC_URL,
    DIRECTUS_URL: process.env.DIRECTUS_URL,
  };

  let activeSpies: Array<{ mockRestore: () => void }> = [];

  function trackSpy<T extends { mockRestore: () => void }>(spy: T): T {
    activeSpies.push(spy);
    return spy;
  }

  beforeEach(() => {
    activeSpies = [];
  });

  afterEach(() => {
    for (const spy of activeSpies.reverse()) {
      spy.mockRestore();
    }
    activeSpies = [];

    if (originalEnv.DIRECTUS_PUBLIC_URL !== undefined) {
      process.env.DIRECTUS_PUBLIC_URL = originalEnv.DIRECTUS_PUBLIC_URL;
    } else {
      delete process.env.DIRECTUS_PUBLIC_URL;
    }

    if (originalEnv.DIRECTUS_URL !== undefined) {
      process.env.DIRECTUS_URL = originalEnv.DIRECTUS_URL;
    } else {
      delete process.env.DIRECTUS_URL;
    }
  });

  describe("GET /api/v1/guilds/:guildId/config", () => {
    it("defaults botId to chatBot and returns { ok: true, botId: 'chatBot', guildId, config }", async () => {
      const guildId = "guild-get-default";
      const seededConfig: BotGuildConfig = {
        replyChannelIds: ["ch-default-1"],
        ignoredChannelIds: ["ch-ignored-1"],
        respondToMentions: true,
      };
      Config.getInstance().updateBotGuildConfig(guildId, seededConfig);

      const res = await request(app)
        .get(`/api/v1/guilds/${guildId}/config`)
        .set("Authorization", `Bearer ${superAdminSession}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        botId: "chatBot",
        guildId,
        config: seededConfig,
      });
    });

    it("supports explicit ?botId=policeBot query param independently of chatBot", async () => {
      const guildId = "guild-get-multibot";
      const chatConfig: BotGuildConfig = {
        replyChannelIds: ["ch-chat"],
        ignoredChannelIds: [],
        respondToMentions: true,
      };
      const policeConfig: BotGuildConfig = {
        replyChannelIds: ["ch-police"],
        ignoredChannelIds: [],
        respondToMentions: false,
        moderation: { enabled: true },
      };

      Config.getInstance().updateBotGuildConfig(guildId, chatConfig, "chatBot");
      Config.getInstance().updateBotGuildConfig(
        guildId,
        policeConfig,
        "policeBot",
      );

      const res = await request(app)
        .get(`/api/v1/guilds/${guildId}/config?botId=policeBot`)
        .set("Authorization", `Bearer ${superAdminSession}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        botId: "policeBot",
        guildId,
        config: policeConfig,
      });
    });

    it.each(["__proto__", "constructor", "prototype", ""])(
      "rejects unsafe botId %j with 400",
      async (unsafeBotId) => {
        const res = await request(app)
          .get("/api/v1/guilds/guild-safe/config")
          .query({ botId: unsafeBotId })
          .set("Authorization", `Bearer ${superAdminSession}`);

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ ok: false, message: "Invalid botId." });
      },
    );

    it.each(["__proto__", "constructor", "prototype"])(
      "rejects unsafe guildId %j with 400",
      async (unsafeGuildId) => {
        const res = await request(app)
          .get(`/api/v1/guilds/${unsafeGuildId}/config`)
          .set("Authorization", `Bearer ${superAdminSession}`);

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ ok: false, message: "Invalid guildId." });
      },
    );

    it("enforces RBAC and guild permissions on GET /:guildId/config", async () => {
      const viewerRes = await request(app)
        .get("/api/v1/guilds/guild-allowed/config")
        .set("Authorization", `Bearer ${viewerSession}`);
      expect(viewerRes.status).toBe(403);

      const forbiddenGuildRes = await request(app)
        .get("/api/v1/guilds/guild-other/config")
        .set("Authorization", `Bearer ${guildAdminSession}`);
      expect(forbiddenGuildRes.status).toBe(403);

      const allowedGuildRes = await request(app)
        .get("/api/v1/guilds/guild-allowed/config")
        .set("Authorization", `Bearer ${guildAdminSession}`);
      expect(allowedGuildRes.status).toBe(200);
      expect(allowedGuildRes.body.ok).toBe(true);
    });
  });

  describe("PUT /api/v1/guilds/:guildId/config", () => {
    it("persists to Directus BEFORE updating in-memory Config when source is 'directus'", async () => {
      const guildId = "guild-put-directus-ok";
      const configService = Config.getInstance();
      const callOrder: string[] = [];

      trackSpy(vi.spyOn(configService, "getConfigSource")).mockReturnValue(
        "directus",
      );
      const upsertSpy = trackSpy(
        vi.spyOn(guildConfigRepository, "upsertBotGuildConfig"),
      ).mockImplementation(async () => {
        callOrder.push("upsertBotGuildConfig");
      });
      const realUpdate = configService.updateBotGuildConfig.bind(configService);
      const updateSpy = trackSpy(
        vi.spyOn(configService, "updateBotGuildConfig"),
      ).mockImplementation((gId, cfg, bId) => {
        callOrder.push("updateBotGuildConfig");
        realUpdate(gId, cfg, bId);
      });

      const payload = {
        replyChannelIds: ["ch-101"],
        ignoredChannelIds: ["ch-102"],
        respondToMentions: false,
        systemInstruction: "Directus persisted prompt",
      };

      const res = await request(app)
        .put(`/api/v1/guilds/${guildId}/config`)
        .set("Authorization", `Bearer ${superAdminSession}`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.botId).toBe("chatBot");
      expect(res.body.guildId).toBe(guildId);
      expect(res.body.persistedTo).toBe("directus");
      expect(res.body.config).toEqual(payload);

      expect(callOrder).toEqual([
        "upsertBotGuildConfig",
        "updateBotGuildConfig",
      ]);
      expect(upsertSpy).toHaveBeenCalledWith("chatBot", guildId, payload);
      expect(updateSpy).toHaveBeenCalledWith(guildId, payload, "chatBot");
      expect(configService.getBotGuildConfig("chatBot", guildId)).toEqual(
        payload,
      );
    });

    it("returns 5xx and does NOT mutate in-memory Config when Directus upsert fails", async () => {
      const guildId = "guild-put-directus-fail";
      const configService = Config.getInstance();
      const initialConfig: BotGuildConfig = {
        replyChannelIds: ["ch-initial"],
        ignoredChannelIds: [],
        respondToMentions: true,
        systemInstruction: "Original prompt",
      };
      configService.updateBotGuildConfig(guildId, initialConfig, "chatBot");

      trackSpy(vi.spyOn(configService, "getConfigSource")).mockReturnValue(
        "directus",
      );
      trackSpy(
        vi.spyOn(guildConfigRepository, "upsertBotGuildConfig"),
      ).mockRejectedValue(new Error("Directus connection refused"));
      const updateSpy = trackSpy(
        vi.spyOn(configService, "updateBotGuildConfig"),
      );

      const res = await request(app)
        .put(`/api/v1/guilds/${guildId}/config`)
        .set("Authorization", `Bearer ${superAdminSession}`)
        .send({
          replyChannelIds: ["ch-mutated"],
          respondToMentions: false,
        });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        ok: false,
        message: "Directus connection refused",
      });
      expect(updateSpy).not.toHaveBeenCalled();
      expect(configService.getBotGuildConfig("chatBot", guildId)).toEqual(
        initialConfig,
      );
    });

    it.each(["local", "remote-config"] as const)(
      "skips Directus upsert and updates in-memory Config when source is %j",
      async (source) => {
        const guildId = `guild-put-${source}`;
        const configService = Config.getInstance();

        trackSpy(vi.spyOn(configService, "getConfigSource")).mockReturnValue(
          source,
        );
        const upsertSpy = trackSpy(
          vi.spyOn(guildConfigRepository, "upsertBotGuildConfig"),
        );

        const res = await request(app)
          .put(`/api/v1/guilds/${guildId}/config`)
          .set("Authorization", `Bearer ${superAdminSession}`)
          .send({
            replyChannelIds: ["ch-mem-only"],
            respondToMentions: false,
          });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.persistedTo).toBe(source);
        expect(res.body.config).toEqual({
          replyChannelIds: ["ch-mem-only"],
          ignoredChannelIds: [],
          respondToMentions: false,
        });
        expect(upsertSpy).not.toHaveBeenCalled();
        expect(configService.getBotGuildConfig("chatBot", guildId)).toEqual({
          replyChannelIds: ["ch-mem-only"],
          ignoredChannelIds: [],
          respondToMentions: false,
        });
      },
    );

    it("supports botId via query param and body, and strips botId from saved BotGuildConfig", async () => {
      const guildId = "guild-put-multibot";
      const configService = Config.getInstance();

      trackSpy(vi.spyOn(configService, "getConfigSource")).mockReturnValue(
        "directus",
      );
      const upsertSpy = trackSpy(
        vi.spyOn(guildConfigRepository, "upsertBotGuildConfig"),
      ).mockResolvedValue(undefined);

      // 1. botId via query param
      const queryRes = await request(app)
        .put(`/api/v1/guilds/${guildId}/config?botId=policeBot`)
        .set("Authorization", `Bearer ${superAdminSession}`)
        .send({
          moderation: { enabled: false },
          systemInstruction: "Police query config",
        });

      expect(queryRes.status).toBe(200);
      expect(queryRes.body.botId).toBe("policeBot");
      expect(queryRes.body.config.moderation).toEqual({ enabled: false });
      expect(upsertSpy).toHaveBeenCalledWith(
        "policeBot",
        guildId,
        expect.objectContaining({
          moderation: { enabled: false },
          systemInstruction: "Police query config",
        }),
      );

      // 2. botId via request body (must be stripped from saved BotGuildConfig)
      const bodyRes = await request(app)
        .put(`/api/v1/guilds/${guildId}/config`)
        .set("Authorization", `Bearer ${superAdminSession}`)
        .send({
          botId: "policeBot",
          moderation: { enabled: true },
        });

      expect(bodyRes.status).toBe(200);
      expect(bodyRes.body.botId).toBe("policeBot");
      expect(Object.hasOwn(bodyRes.body.config, "botId")).toBe(false);

      const savedPoliceConfig = configService.getBotGuildConfig(
        "policeBot",
        guildId,
      ) as unknown as Record<string, unknown>;
      expect(savedPoliceConfig).toBeDefined();
      expect(Object.hasOwn(savedPoliceConfig, "botId")).toBe(false);
      expect(savedPoliceConfig.moderation).toEqual({ enabled: true });

      const lastUpsertArg = upsertSpy.mock.calls[1][2] as unknown as Record<
        string,
        unknown
      >;
      expect(Object.hasOwn(lastUpsertArg, "botId")).toBe(false);

      // chatBot config for the same guild remains untouched
      expect(
        configService.getBotGuildConfig("chatBot", guildId),
      ).toBeUndefined();
    });

    it("rejects array payloads with 400 without calling upsert or updating Config", async () => {
      const upsertSpy = trackSpy(
        vi.spyOn(guildConfigRepository, "upsertBotGuildConfig"),
      );
      const updateSpy = trackSpy(
        vi.spyOn(Config.getInstance(), "updateBotGuildConfig"),
      );

      const emptyArrayRes = await request(app)
        .put("/api/v1/guilds/guild-invalid-body/config")
        .set("Authorization", `Bearer ${superAdminSession}`)
        .send([]);

      expect(emptyArrayRes.status).toBe(400);
      expect(emptyArrayRes.body).toEqual({
        ok: false,
        message: "Request body must be a JSON object.",
      });

      const objectArrayRes = await request(app)
        .put("/api/v1/guilds/guild-invalid-body/config")
        .set("Authorization", `Bearer ${superAdminSession}`)
        .send([{ respondToMentions: true }]);

      expect(objectArrayRes.status).toBe(400);
      expect(objectArrayRes.body).toEqual({
        ok: false,
        message: "Request body must be a JSON object.",
      });
      expect(upsertSpy).not.toHaveBeenCalled();
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it.each(["__proto__", "constructor", "prototype", ""])(
      "rejects unsafe botId %j in query or body with 400",
      async (unsafeBotId) => {
        const upsertSpy = trackSpy(
          vi.spyOn(guildConfigRepository, "upsertBotGuildConfig"),
        );

        const queryRes = await request(app)
          .put("/api/v1/guilds/guild-unsafe-bot/config")
          .query({ botId: unsafeBotId })
          .set("Authorization", `Bearer ${superAdminSession}`)
          .send({ respondToMentions: false });

        expect(queryRes.status).toBe(400);
        expect(queryRes.body).toEqual({ ok: false, message: "Invalid botId." });

        const bodyRes = await request(app)
          .put("/api/v1/guilds/guild-unsafe-bot/config")
          .set("Authorization", `Bearer ${superAdminSession}`)
          .send({ botId: unsafeBotId, respondToMentions: false });

        expect(bodyRes.status).toBe(400);
        expect(bodyRes.body).toEqual({ ok: false, message: "Invalid botId." });
        expect(upsertSpy).not.toHaveBeenCalled();
      },
    );

    it("strips prototype-polluting keys (__proto__, constructor, prototype) from top-level and nested payload", async () => {
      const guildId = "guild-put-sanitize";
      const configService = Config.getInstance();

      trackSpy(vi.spyOn(configService, "getConfigSource")).mockReturnValue(
        "directus",
      );
      const upsertSpy = trackSpy(
        vi.spyOn(guildConfigRepository, "upsertBotGuildConfig"),
      ).mockResolvedValue(undefined);

      const rawPollutedJson = JSON.stringify({
        respondToMentions: false,
        constructor: { polluted: true },
        prototype: { polluted: true },
        moderation: {
          enabled: true,
          constructor: { nestedPolluted: true },
          prototype: { nestedPolluted: true },
        },
      }).replace(
        '"respondToMentions":false',
        '"__proto__":{"polluted":true},"respondToMentions":false',
      );

      const res = await request(app)
        .put(`/api/v1/guilds/${guildId}/config`)
        .set("Authorization", `Bearer ${superAdminSession}`)
        .set("Content-Type", "application/json")
        .send(rawPollutedJson);

      expect(res.status).toBe(200);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(({} as Record<string, unknown>).nestedPolluted).toBeUndefined();

      const saved = configService.getBotGuildConfig(
        "chatBot",
        guildId,
      ) as unknown as Record<string, unknown>;
      expect(Object.hasOwn(saved, "__proto__")).toBe(false);
      expect(Object.hasOwn(saved, "constructor")).toBe(false);
      expect(Object.hasOwn(saved, "prototype")).toBe(false);

      const nestedMod = saved.moderation as Record<string, unknown>;
      expect(nestedMod.enabled).toBe(true);
      expect(Object.hasOwn(nestedMod, "constructor")).toBe(false);
      expect(Object.hasOwn(nestedMod, "prototype")).toBe(false);

      const persistedArg = upsertSpy.mock.calls[0][2] as unknown as Record<
        string,
        unknown
      >;
      expect(Object.hasOwn(persistedArg, "__proto__")).toBe(false);
      expect(Object.hasOwn(persistedArg, "constructor")).toBe(false);
      expect(Object.hasOwn(persistedArg, "prototype")).toBe(false);
    });

    it("rejects unknown/unsupported config fields with 400 without persisting", async () => {
      const upsertSpy = trackSpy(
        vi.spyOn(guildConfigRepository, "upsertBotGuildConfig"),
      );
      const updateSpy = trackSpy(
        vi.spyOn(Config.getInstance(), "updateBotGuildConfig"),
      );

      const res = await request(app)
        .put("/api/v1/guilds/guild-unknown-field/config")
        .set("Authorization", `Bearer ${superAdminSession}`)
        .send({
          respondToMentions: true,
          unexpectedField: "malicious-value",
        });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        ok: false,
        message: "Unknown guild configuration field: unexpectedField",
      });
      expect(upsertSpy).not.toHaveBeenCalled();
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it.each([
      {
        label: "replyChannelIds: null",
        payload: { replyChannelIds: null },
        expectedMessage:
          "Invalid field 'replyChannelIds': must be an array of strings.",
      },
      {
        label: 'respondToMentions: "yes"',
        payload: { respondToMentions: "yes" },
        expectedMessage:
          "Invalid field 'respondToMentions': must be a boolean.",
      },
      {
        label: "roast.allowedChannelIds: 123",
        payload: { roast: { allowedChannelIds: 123 } },
        expectedMessage:
          "Invalid field 'roast': roast.allowedChannelIds must be an array of strings.",
      },
    ])(
      "rejects invalid field type ($label) with 400",
      async ({ payload, expectedMessage }) => {
        const upsertSpy = trackSpy(
          vi.spyOn(guildConfigRepository, "upsertBotGuildConfig"),
        );
        const updateSpy = trackSpy(
          vi.spyOn(Config.getInstance(), "updateBotGuildConfig"),
        );

        const res = await request(app)
          .put("/api/v1/guilds/guild-invalid-types/config")
          .set("Authorization", `Bearer ${superAdminSession}`)
          .send(payload);

        expect(res.status).toBe(400);
        expect(res.body).toEqual({
          ok: false,
          message: expectedMessage,
        });
        expect(upsertSpy).not.toHaveBeenCalled();
        expect(updateSpy).not.toHaveBeenCalled();
      },
    );

    it("rejects conflicting query.botId vs body.botId with 400", async () => {
      const upsertSpy = trackSpy(
        vi.spyOn(guildConfigRepository, "upsertBotGuildConfig"),
      );
      const updateSpy = trackSpy(
        vi.spyOn(Config.getInstance(), "updateBotGuildConfig"),
      );

      const res = await request(app)
        .put("/api/v1/guilds/guild-conflict-bot/config?botId=chatBot")
        .set("Authorization", `Bearer ${superAdminSession}`)
        .send({
          botId: "policeBot",
          respondToMentions: false,
        });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        ok: false,
        message: "Conflicting botId in query and body.",
      });
      expect(upsertSpy).not.toHaveBeenCalled();
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it.each(["police bot", "bot@1", "../admin", "bot$id"])(
      "rejects invalid botId format (%j) on GET and PUT with 400",
      async (invalidBotId) => {
        const upsertSpy = trackSpy(
          vi.spyOn(guildConfigRepository, "upsertBotGuildConfig"),
        );

        const getRes = await request(app)
          .get("/api/v1/guilds/guild-bad-bot-format/config")
          .query({ botId: invalidBotId })
          .set("Authorization", `Bearer ${superAdminSession}`);

        expect(getRes.status).toBe(400);
        expect(getRes.body).toEqual({ ok: false, message: "Invalid botId." });

        const putQueryRes = await request(app)
          .put("/api/v1/guilds/guild-bad-bot-format/config")
          .query({ botId: invalidBotId })
          .set("Authorization", `Bearer ${superAdminSession}`)
          .send({ respondToMentions: false });

        expect(putQueryRes.status).toBe(400);
        expect(putQueryRes.body).toEqual({
          ok: false,
          message: "Invalid botId.",
        });

        const putBodyRes = await request(app)
          .put("/api/v1/guilds/guild-bad-bot-format/config")
          .set("Authorization", `Bearer ${superAdminSession}`)
          .send({ botId: invalidBotId, respondToMentions: false });

        expect(putBodyRes.status).toBe(400);
        expect(putBodyRes.body).toEqual({
          ok: false,
          message: "Invalid botId.",
        });
        expect(upsertSpy).not.toHaveBeenCalled();
      },
    );

    it("preserves sibling sub-fields when updating a partial nested sub-config", async () => {
      const guildId = "guild-put-deep-merge";
      const configService = Config.getInstance();

      configService.updateBotGuildConfig(
        guildId,
        {
          replyChannelIds: ["ch-1"],
          ignoredChannelIds: [],
          respondToMentions: true,
          roast: {
            enabled: true,
            maxIntensity: "savage",
            maxPerDay: 15,
          },
        },
        "chatBot",
      );

      trackSpy(vi.spyOn(configService, "getConfigSource")).mockReturnValue(
        "directus",
      );
      const upsertSpy = trackSpy(
        vi.spyOn(guildConfigRepository, "upsertBotGuildConfig"),
      ).mockResolvedValue(undefined);

      const res = await request(app)
        .put(`/api/v1/guilds/${guildId}/config`)
        .set("Authorization", `Bearer ${superAdminSession}`)
        .send({
          roast: { enabled: false },
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.config.roast).toEqual({
        enabled: false,
        maxIntensity: "savage",
        maxPerDay: 15,
      });
      expect(upsertSpy).toHaveBeenCalledWith(
        "chatBot",
        guildId,
        expect.objectContaining({
          roast: {
            enabled: false,
            maxIntensity: "savage",
            maxPerDay: 15,
          },
        }),
      );
      expect(
        configService.getBotGuildConfig("chatBot", guildId)?.roast,
      ).toEqual({
        enabled: false,
        maxIntensity: "savage",
        maxPerDay: 15,
      });
    });

    it("enforces RBAC (guild:manage_channels) and guild permission checks (403 for viewer or unauthorized guild)", async () => {
      const upsertSpy = trackSpy(
        vi.spyOn(guildConfigRepository, "upsertBotGuildConfig"),
      );

      const viewerRes = await request(app)
        .put("/api/v1/guilds/guild-allowed/config")
        .set("Authorization", `Bearer ${viewerSession}`)
        .send({ respondToMentions: false });
      expect(viewerRes.status).toBe(403);
      expect(viewerRes.body.ok).toBe(false);

      const unauthorizedGuildRes = await request(app)
        .put("/api/v1/guilds/guild-unauthorized/config")
        .set("Authorization", `Bearer ${guildAdminSession}`)
        .send({ respondToMentions: false });
      expect(unauthorizedGuildRes.status).toBe(403);
      expect(unauthorizedGuildRes.body.ok).toBe(false);

      const readonlyGuildRes = await request(app)
        .put("/api/v1/guilds/guild-readonly/config")
        .set("Authorization", `Bearer ${guildAdminSession}`)
        .send({ respondToMentions: false });
      expect(readonlyGuildRes.status).toBe(403);
      expect(readonlyGuildRes.body.ok).toBe(false);
      expect(upsertSpy).not.toHaveBeenCalled();

      // Authorized GUILD_ADMIN for guild-allowed succeeds
      trackSpy(
        vi.spyOn(Config.getInstance(), "getConfigSource"),
      ).mockReturnValue("local");
      const allowedRes = await request(app)
        .put("/api/v1/guilds/guild-allowed/config")
        .set("Authorization", `Bearer ${guildAdminSession}`)
        .send({ respondToMentions: false });
      expect(allowedRes.status).toBe(200);
      expect(allowedRes.body.ok).toBe(true);
    });
  });

  describe("GET /api/v1/config", () => {
    it("returns { ok: true, config, source, lastFetchedAt, directusUrl } with valid URLs and null when unset", async () => {
      const configService = Config.getInstance();
      trackSpy(vi.spyOn(configService, "getConfigSource")).mockReturnValue(
        "directus",
      );
      trackSpy(vi.spyOn(configService, "getLastFetchedAt")).mockReturnValue(
        1700000000000,
      );

      delete process.env.DIRECTUS_PUBLIC_URL;
      delete process.env.DIRECTUS_URL;

      const unsetRes = await request(app)
        .get("/api/v1/config")
        .set("Authorization", `Bearer ${viewerSession}`);

      expect(unsetRes.status).toBe(200);
      expect(unsetRes.body.ok).toBe(true);
      expect(unsetRes.body.config).toHaveProperty("bots");
      expect(unsetRes.body.source).toBe("directus");
      expect(unsetRes.body.lastFetchedAt).toBe(1700000000000);
      expect(unsetRes.body.directusUrl).toBeNull();

      process.env.DIRECTUS_URL = "http://directus-internal:8055";
      const internalRes = await request(app)
        .get("/api/v1/config")
        .set("Authorization", `Bearer ${viewerSession}`);
      expect(internalRes.status).toBe(200);
      expect(internalRes.body.directusUrl).toBe(
        "http://directus-internal:8055",
      );

      process.env.DIRECTUS_PUBLIC_URL = "https://cms.example.com";
      const publicRes = await request(app)
        .get("/api/v1/config")
        .set("Authorization", `Bearer ${viewerSession}`);
      expect(publicRes.status).toBe(200);
      expect(publicRes.body.directusUrl).toBe("https://cms.example.com");
    });

    it.each([
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "ftp://cms.example.com",
      "not-a-valid-url",
    ])(
      "returns directusUrl: null when DIRECTUS_PUBLIC_URL is invalid (%s)",
      async (badUrl) => {
        process.env.DIRECTUS_PUBLIC_URL = badUrl;
        process.env.DIRECTUS_URL = "http://fallback-should-not-leak:8055";

        const res = await request(app)
          .get("/api/v1/config")
          .set("Authorization", `Bearer ${viewerSession}`);

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.directusUrl).toBeNull();
      },
    );

    it("returns directusUrl: null when Directus URLs are whitespace-only or invalid", async () => {
      process.env.DIRECTUS_PUBLIC_URL = "   ";
      process.env.DIRECTUS_URL = "   ";

      const whitespaceRes = await request(app)
        .get("/api/v1/config")
        .set("Authorization", `Bearer ${viewerSession}`);

      expect(whitespaceRes.status).toBe(200);
      expect(whitespaceRes.body.directusUrl).toBeNull();

      delete process.env.DIRECTUS_PUBLIC_URL;
      process.env.DIRECTUS_URL = "javascript:alert(1)";

      const invalidFallbackRes = await request(app)
        .get("/api/v1/config")
        .set("Authorization", `Bearer ${viewerSession}`);

      expect(invalidFallbackRes.status).toBe(200);
      expect(invalidFallbackRes.body.directusUrl).toBeNull();
    });

    it.each([
      "https://user:pass@directus.example.com",
      "https://token-only@directus.example.com",
      "http://admin:secret@localhost:8055",
    ])(
      "returns directusUrl: null when Directus URL contains embedded credentials (%s)",
      async (credentialUrl) => {
        delete process.env.DIRECTUS_PUBLIC_URL;
        process.env.DIRECTUS_URL = credentialUrl;

        const res = await request(app)
          .get("/api/v1/config")
          .set("Authorization", `Bearer ${viewerSession}`);

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.directusUrl).toBeNull();
      },
    );
  });

  describe("POST /api/v1/config/reload", () => {
    it("triggers Config.getInstance().loadConfig() and returns { ok: true, message, source, lastFetchedAt }", async () => {
      const configService = Config.getInstance();
      const loadSpy = trackSpy(
        vi.spyOn(configService, "loadConfig"),
      ).mockResolvedValue(undefined);
      trackSpy(vi.spyOn(configService, "getConfigSource")).mockReturnValue(
        "directus",
      );
      trackSpy(vi.spyOn(configService, "getLastFetchedAt")).mockReturnValue(
        1700000123456,
      );

      const res = await request(app)
        .post("/api/v1/config/reload")
        .set("Authorization", `Bearer ${superAdminSession}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        message: "Configuration reloaded successfully",
        source: "directus",
        lastFetchedAt: 1700000123456,
      });
      expect(loadSpy).toHaveBeenCalledTimes(1);
    });

    it("forbids viewer and guild admin roles with 403 without calling loadConfig()", async () => {
      const loadSpy = trackSpy(vi.spyOn(Config.getInstance(), "loadConfig"));

      const viewerRes = await request(app)
        .post("/api/v1/config/reload")
        .set("Authorization", `Bearer ${viewerSession}`);
      expect(viewerRes.status).toBe(403);
      expect(viewerRes.body.ok).toBe(false);

      const guildAdminRes = await request(app)
        .post("/api/v1/config/reload")
        .set("Authorization", `Bearer ${guildAdminSession}`);
      expect(guildAdminRes.status).toBe(403);
      expect(guildAdminRes.body.ok).toBe(false);

      expect(loadSpy).not.toHaveBeenCalled();
    });
  });
});
