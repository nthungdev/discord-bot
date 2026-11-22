import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guildConfigRepository } from "../../infrastructure/repositories";
import {
  Config,
  ConfigParameter,
  loadLocalConfig,
  resolveConfigPath,
  resolveConfigSource,
} from ".././index";

describe("Config", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return the singleton instance", () => {
    const instance1 = Config.getInstance();
    const instance2 = Config.getInstance();
    expect(instance1).toBe(instance2);
  });

  it("should fetch config values correctly", () => {
    const config = Config.getInstance();
    const botsConfig = config.getConfigValue(ConfigParameter.bots);
    expect(botsConfig).toBeDefined();
  });

  describe("resolveConfigPath", () => {
    it("should resolve custom path when provided and exists", () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      const resolved = resolveConfigPath("/custom/config.json");
      expect(resolved).toBe("/custom/config.json");
    });

    it("should resolve CONFIG_PATH when set and exists", () => {
      const originalEnv = process.env.CONFIG_PATH;
      process.env.CONFIG_PATH = "/env/config.json";
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      const resolved = resolveConfigPath();
      expect(resolved).toBe("/env/config.json");
      process.env.CONFIG_PATH = originalEnv;
    });

    it("should resolve config.json when exists", () => {
      vi.spyOn(fs, "existsSync").mockImplementation((p) => {
        return String(p).endsWith("config.json");
      });
      const resolved = resolveConfigPath();
      expect(resolved).toContain("config.json");
    });

    it("should return null if no candidate file exists", () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      const resolved = resolveConfigPath();
      expect(resolved).toBeNull();
    });
  });

  describe("local-only mode", () => {
    const originalEnv = process.env;

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it("should initialize in local-only mode when useLocalConfigOnly option is true", async () => {
      const config = Config.getInstance();
      await config.init({ useLocalConfigOnly: true });
      expect(config.isLocalOnly()).toBe(true);
      const bots = config.getConfigValue(ConfigParameter.bots);
      expect(bots).toBeDefined();
    });

    it("should initialize in local-only mode when USE_CONFIG_FILE env var is set", async () => {
      process.env.USE_CONFIG_FILE = "true";
      const config = Config.getInstance();
      await config.init();
      expect(config.isLocalOnly()).toBe(true);
    });
  });

  describe("loadLocalConfig", () => {
    it("should load and parse custom config when available", () => {
      const mockCustomConfig = {
        aiProjectId: "custom-project-id",
        bots: {
          chatBot: {
            guilds: {
              "test-guild": {
                replyChannelIds: ["chan-1"],
                ignoredChannelIds: [],
                respondToMentions: true,
              },
            },
          },
          policeBot: {
            guilds: {},
          },
        },
      };

      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(
        JSON.stringify(mockCustomConfig),
      );

      const loaded = loadLocalConfig("/some/config.json");
      expect(loaded.aiProjectId).toBe("custom-project-id");
      expect(loaded.bots.chatBot.guilds["test-guild"]).toBeDefined();
    });

    it("should throw error when config.json is not found", () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      expect(() => loadLocalConfig()).toThrowError(
        /Configuration file 'config.json' not found/,
      );
    });

    it("should throw error when config.json contains malformed JSON", () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("{ invalid json");
      expect(() => loadLocalConfig("/invalid/config.json")).toThrowError(
        /Failed to parse configuration file/,
      );
    });
  });

  describe("resolveConfigSource", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.USE_CONFIG_FILE;
      delete process.env.CONFIG_SOURCE;
      delete process.env.DIRECTUS_URL;
      delete process.env.DIRECTUS_BOT_TOKEN;
    });

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it("should prioritize local when useLocalConfigOnly or USE_CONFIG_FILE is set", () => {
      process.env.CONFIG_SOURCE = "directus";
      process.env.DIRECTUS_URL = "http://localhost:8055";
      process.env.DIRECTUS_BOT_TOKEN = "token-123";
      expect(
        resolveConfigSource({
          useLocalConfigOnly: true,
          configSource: "directus",
        }),
      ).toBe("local");

      process.env.USE_CONFIG_FILE = "true";
      expect(resolveConfigSource({ configSource: "directus" })).toBe("local");

      process.env.USE_CONFIG_FILE = "1";
      expect(resolveConfigSource({ configSource: "remote-config" })).toBe(
        "local",
      );

      // Non-truthy USE_CONFIG_FILE values should not force local mode
      process.env.USE_CONFIG_FILE = "false";
      expect(resolveConfigSource()).toBe("directus");

      process.env.USE_CONFIG_FILE = "0";
      expect(resolveConfigSource()).toBe("directus");
    });

    it("should respect explicit options.configSource and CONFIG_SOURCE env var while ignoring invalid values", () => {
      process.env.CONFIG_SOURCE = "remote-config";
      expect(resolveConfigSource({ configSource: "directus" })).toBe(
        "directus",
      );
      expect(resolveConfigSource({ configSource: "remote-config" })).toBe(
        "remote-config",
      );

      // Invalid options.configSource falls back to CONFIG_SOURCE env var
      expect(
        resolveConfigSource({
          configSource: "bogus" as unknown as "directus",
        }),
      ).toBe("remote-config");

      process.env.CONFIG_SOURCE = "directus";
      expect(resolveConfigSource()).toBe("directus");

      // Invalid CONFIG_SOURCE env var falls through to Directus env vars or remote-config
      process.env.CONFIG_SOURCE = "invalid-source";
      expect(resolveConfigSource()).toBe("remote-config");

      process.env.DIRECTUS_URL = "http://localhost:8055";
      process.env.DIRECTUS_BOT_TOKEN = "token-123";
      expect(resolveConfigSource()).toBe("directus");
    });

    it("should default to directus only when both DIRECTUS_URL and DIRECTUS_BOT_TOKEN are set", () => {
      process.env.DIRECTUS_URL = "http://localhost:8055";
      expect(resolveConfigSource()).toBe("remote-config");

      delete process.env.DIRECTUS_URL;
      process.env.DIRECTUS_BOT_TOKEN = "token-123";
      expect(resolveConfigSource()).toBe("remote-config");

      process.env.DIRECTUS_URL = "http://localhost:8055";
      expect(resolveConfigSource()).toBe("directus");
    });

    it("should fallback to remote-config when no directus or local indicators exist", () => {
      expect(resolveConfigSource()).toBe("remote-config");
    });
  });

  describe("directus primary mode", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.restoreAllMocks();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      vi.useRealTimers();
      Config.getInstance().stopAutoRefresh();
      process.env = { ...originalEnv };
    });

    it("should hydrate from Directus on init, serve values synchronously, and refresh on loadConfig", async () => {
      const fetchSpy = vi
        .spyOn(guildConfigRepository, "fetchAllConfigs")
        .mockResolvedValueOnce({
          systemConfig: {
            id: "sys-1",
            ai_provider: "vertex",
            ai_model_id: "gemini-3.8-flash",
            memory_store_type: "directus",
            check_in_leaderboard: "directus-lb",
            ai_safety_settings: [
              {
                category: "HARM_CATEGORY_HATE_SPEECH",
                threshold: "BLOCK_NONE",
              },
            ],
          },
          guildConfigs: [
            {
              id: "row-1",
              bot_id: "chatBot",
              guild_id: "guild-d1",
              respond_to_mentions: true,
              roast_enabled: true,
              roast_max_per_day: 20,
              guild_emojis: { "🎉": ["party_d"] },
              guild_members: [
                { username: "u1", name: "User One", gender: "other" },
              ],
            },
            {
              id: "row-2",
              bot_id: "policeBot",
              guild_id: "guild-d1",
              moderation_enabled: true,
            },
            {
              id: "row-3",
              bot_id: "customBot",
              guild_id: "guild-d1",
              reply_channel_ids: ["ch-custom"],
              respond_to_mentions: false,
            },
          ],
        })
        .mockResolvedValueOnce({
          systemConfig: {
            id: "sys-1",
            ai_model_id: "claude-sonnet-5-5-high",
            memory_store_type: "directus",
          },
          guildConfigs: [
            {
              id: "row-1",
              bot_id: "chatBot",
              guild_id: "guild-d1",
              respond_to_mentions: false,
              roast_enabled: false,
            },
          ],
        });

      const config = Config.getInstance();
      await config.init({ configSource: "directus", refreshIntervalMs: 0 });

      expect(config.getConfigSource()).toBe("directus");
      expect(config.isLocalOnly()).toBe(false);
      expect(config.getLastFetchedAt()).toBeGreaterThan(0);
      expect(config.getConfigValue(ConfigParameter.aiProvider)).toBe("vertex");
      expect(config.getConfigValue(ConfigParameter.aiModelId)).toBe(
        "gemini-3.8-flash",
      );
      expect(config.getConfigValue(ConfigParameter.memoryStoreType)).toBe(
        "directus",
      );
      expect(config.getConfigValue(ConfigParameter.checkInLeaderboard)).toBe(
        "directus-lb",
      );
      expect(config.getConfigValue(ConfigParameter.aiSafetySettings)).toEqual({
        safetySettings: [
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        ],
      });
      expect(
        config.getConfigValue(ConfigParameter.guildEmojis)["guild-d1"],
      ).toEqual({
        "🎉": ["party_d"],
      });
      expect(
        config.getConfigValue(ConfigParameter.guildMembers)["guild-d1"],
      ).toEqual([{ username: "u1", name: "User One", gender: "other" }]);
      expect(
        config.getBotGuildConfig("chatBot", "guild-d1")?.roast?.maxPerDay,
      ).toBe(20);
      expect(
        config.getBotGuildConfig("policeBot", "guild-d1")?.moderation?.enabled,
      ).toBe(true);
      expect(
        config.getBotGuildConfig("customBot", "guild-d1")?.replyChannelIds,
      ).toEqual(["ch-custom"]);

      // In-memory override updates snapshot & getBotGuildConfig immediately
      config.updateBotGuildConfig("guild-d1", {
        replyChannelIds: ["ch-override"],
        ignoredChannelIds: [],
        respondToMentions: true,
      });
      expect(
        config.getBotGuildConfig("chatBot", "guild-d1")?.replyChannelIds,
      ).toEqual(["ch-override"]);

      // Reload clears stale in-memory overrides and reflects fresh Directus data
      await config.loadConfig();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(config.getConfigValue(ConfigParameter.aiModelId)).toBe(
        "claude-sonnet-5-5-high",
      );
      expect(
        config.getBotGuildConfig("chatBot", "guild-d1")?.roast?.enabled,
      ).toBe(false);
      expect(
        config.getBotGuildConfig("chatBot", "guild-d1")?.replyChannelIds,
      ).toEqual([]);
    });

    it("should fall back to localConfig on cold-start Directus outage and recover on subsequent loadConfig", async () => {
      const fetchSpy = vi
        .spyOn(guildConfigRepository, "fetchAllConfigs")
        .mockRejectedValueOnce(new Error("Directus down at boot"))
        .mockResolvedValueOnce({
          systemConfig: {
            id: "sys-1",
            ai_model_id: "gemini-recovered",
            memory_store_type: "directus",
          },
          guildConfigs: [
            {
              id: "row-rec",
              bot_id: "chatBot",
              guild_id: "guild-rec",
              reply_channel_ids: ["ch-authoritative"],
              respond_to_mentions: true,
            },
          ],
        });

      const config = Config.getInstance();
      const localBaseline = loadLocalConfig();

      await expect(
        config.init({ configSource: "directus", refreshIntervalMs: 0 }),
      ).resolves.toBeUndefined();

      expect(config.getConfigSource()).toBe("directus");
      expect(config.getConfigValue(ConfigParameter.aiModelId)).toBe(
        localBaseline.aiModelId,
      );
      expect(config.getConfigValue(ConfigParameter.bots)).toEqual(
        localBaseline.bots,
      );

      // Simulate in-memory override during outage
      config.updateBotGuildConfig("guild-rec", {
        replyChannelIds: ["ch-stale-override"],
        ignoredChannelIds: [],
        respondToMentions: false,
      });
      expect(
        config.getBotGuildConfig("chatBot", "guild-rec")?.replyChannelIds,
      ).toEqual(["ch-stale-override"]);

      // Recovery refreshes snapshot and clears stale inMemoryGuildOverrides
      await config.loadConfig();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(config.getConfigValue(ConfigParameter.aiModelId)).toBe(
        "gemini-recovered",
      );
      expect(
        config.getBotGuildConfig("chatBot", "guild-rec")?.replyChannelIds,
      ).toEqual(["ch-authoritative"]);
      expect(
        config.getBotGuildConfig("chatBot", "guild-rec")?.respondToMentions,
      ).toBe(true);
    });

    it("should retain last-known-good snapshot and in-memory overrides on subsequent Directus outage, then refresh on recovery", async () => {
      const fetchSpy = vi
        .spyOn(guildConfigRepository, "fetchAllConfigs")
        .mockResolvedValueOnce({
          systemConfig: {
            id: "sys-1",
            ai_model_id: "gemini-good",
          },
          guildConfigs: [
            {
              id: "row-1",
              bot_id: "chatBot",
              guild_id: "guild-lkg",
              reply_channel_ids: ["ch-initial"],
              respond_to_mentions: true,
            },
          ],
        })
        .mockRejectedValueOnce(new Error("Directus unreachable"))
        .mockResolvedValueOnce({
          systemConfig: {
            id: "sys-1",
            ai_model_id: "gemini-after-recovery",
          },
          guildConfigs: [
            {
              id: "row-1",
              bot_id: "chatBot",
              guild_id: "guild-lkg",
              reply_channel_ids: ["ch-recovered"],
              respond_to_mentions: false,
            },
          ],
        });

      const config = Config.getInstance();
      await config.init({ configSource: "directus", refreshIntervalMs: 0 });
      expect(config.getConfigValue(ConfigParameter.aiModelId)).toBe(
        "gemini-good",
      );

      config.updateBotGuildConfig("guild-lkg", {
        replyChannelIds: ["ch-override-during-outage"],
        ignoredChannelIds: [],
        respondToMentions: true,
      });

      // Outage retains last-known-good snapshot and does not clear in-memory overrides
      await expect(config.loadConfig()).resolves.toBeUndefined();
      expect(config.getConfigValue(ConfigParameter.aiModelId)).toBe(
        "gemini-good",
      );
      expect(
        config.getBotGuildConfig("chatBot", "guild-lkg")?.replyChannelIds,
      ).toEqual(["ch-override-during-outage"]);

      // Recovery applies fresh Directus snapshot and clears stale override
      await config.loadConfig();
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(config.getConfigValue(ConfigParameter.aiModelId)).toBe(
        "gemini-after-recovery",
      );
      expect(
        config.getBotGuildConfig("chatBot", "guild-lkg")?.replyChannelIds,
      ).toEqual(["ch-recovered"]);
    });

    it("should skip Directus fetch in local mode and auto-refresh periodically when refreshIntervalMs > 0", async () => {
      vi.useFakeTimers();
      const fetchSpy = vi
        .spyOn(guildConfigRepository, "fetchAllConfigs")
        .mockResolvedValue({
          systemConfig: { id: "sys-1", ai_model_id: "gemini-tick" },
          guildConfigs: [],
        });

      const config = Config.getInstance();

      await config.init({ useLocalConfigOnly: true });
      await config.loadConfig();
      expect(fetchSpy).not.toHaveBeenCalled();

      await config.init({ configSource: "directus", refreshIntervalMs: 1000 });
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      config.stopAutoRefresh();
      await vi.advanceTimersByTimeAsync(2000);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("should reject prototype lookups in getBotGuildConfig and forbidden keys in updateBotGuildConfig without mutating localConfig", async () => {
      vi.spyOn(guildConfigRepository, "fetchAllConfigs").mockResolvedValue({
        systemConfig: { id: "sys-1" },
        guildConfigs: [],
      });

      const config = Config.getInstance();
      await config.init({ configSource: "directus", refreshIntervalMs: 0 });

      expect(
        config.getBotGuildConfig("constructor", "toString"),
      ).toBeUndefined();
      expect(config.getBotGuildConfig("chatBot", "__proto__")).toBeUndefined();
      expect(
        config.getBotGuildConfig("chatBot", "constructor"),
      ).toBeUndefined();

      expect(() =>
        config.updateBotGuildConfig("__proto__", {
          replyChannelIds: [],
          ignoredChannelIds: [],
          respondToMentions: false,
        }),
      ).toThrow(/Invalid guildId/);

      const localBefore = structuredClone(config.getLocalConfig());
      config.updateBotGuildConfig("guild-in-mem-only", {
        replyChannelIds: ["ch-mem"],
        ignoredChannelIds: [],
        respondToMentions: true,
      });
      expect(config.getLocalConfig()).toEqual(localBefore);
      expect(
        config.getBotGuildConfig("chatBot", "guild-in-mem-only")
          ?.replyChannelIds,
      ).toEqual(["ch-mem"]);
    });

    it("should deduplicate concurrent loadConfig calls and preserve overrides made during an in-flight load", async () => {
      let resolveSecondFetch!: (val: {
        systemConfig: null;
        guildConfigs: {
          id: string;
          bot_id: string;
          guild_id: string;
          reply_channel_ids: string[];
          respond_to_mentions: boolean;
        }[];
      }) => void;

      const secondFetchPromise = new Promise<{
        systemConfig: null;
        guildConfigs: {
          id: string;
          bot_id: string;
          guild_id: string;
          reply_channel_ids: string[];
          respond_to_mentions: boolean;
        }[];
      }>((resolve) => {
        resolveSecondFetch = resolve;
      });

      const fetchSpy = vi
        .spyOn(guildConfigRepository, "fetchAllConfigs")
        .mockResolvedValueOnce({
          systemConfig: null,
          guildConfigs: [
            {
              id: "r1",
              bot_id: "chatBot",
              guild_id: "guild-a",
              reply_channel_ids: ["ch-a1"],
              respond_to_mentions: false,
            },
            {
              id: "r2",
              bot_id: "chatBot",
              guild_id: "guild-b",
              reply_channel_ids: ["ch-b1"],
              respond_to_mentions: false,
            },
          ],
        })
        .mockReturnValueOnce(secondFetchPromise);

      const config = Config.getInstance();
      await config.init({ configSource: "directus", refreshIntervalMs: 0 });

      // Stale override on guild-a before load starts
      config.updateBotGuildConfig("guild-a", {
        replyChannelIds: ["ch-a-stale"],
        ignoredChannelIds: [],
        respondToMentions: true,
      });

      // Start two concurrent loadConfig calls (should deduplicate to 1 fetch)
      const p1 = config.loadConfig();
      const p2 = config.loadConfig();
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      // Update guild-b while loadConfig is in flight
      config.updateBotGuildConfig("guild-b", {
        replyChannelIds: ["ch-b-concurrent"],
        ignoredChannelIds: [],
        respondToMentions: true,
      });

      resolveSecondFetch({
        systemConfig: null,
        guildConfigs: [
          {
            id: "r1",
            bot_id: "chatBot",
            guild_id: "guild-a",
            reply_channel_ids: ["ch-a-fresh"],
            respond_to_mentions: false,
          },
          {
            id: "r2",
            bot_id: "chatBot",
            guild_id: "guild-b",
            reply_channel_ids: ["ch-b-fresh"],
            respond_to_mentions: false,
          },
        ],
      });

      await Promise.all([p1, p2]);

      // Untouched override on guild-a was cleared; concurrent override on guild-b survived
      expect(
        config.getBotGuildConfig("chatBot", "guild-a")?.replyChannelIds,
      ).toEqual(["ch-a-fresh"]);
      expect(
        config.getBotGuildConfig("chatBot", "guild-b")?.replyChannelIds,
      ).toEqual(["ch-b-concurrent"]);
    });
  });

  describe("multi-bot guild config isolation and validation", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      Config.getInstance().stopAutoRefresh();
    });

    it("isolates chatBot and policeBot updates for the same guild in directus mode", async () => {
      vi.spyOn(guildConfigRepository, "fetchAllConfigs").mockResolvedValue({
        systemConfig: { id: "sys-1" },
        guildConfigs: [
          {
            id: "row-chat",
            bot_id: "chatBot",
            guild_id: "guild-shared",
            reply_channel_ids: ["ch-chat-initial"],
            respond_to_mentions: true,
          },
          {
            id: "row-police",
            bot_id: "policeBot",
            guild_id: "guild-shared",
            moderation_enabled: true,
          },
        ],
      });

      const config = Config.getInstance();
      await config.init({ configSource: "directus", refreshIntervalMs: 0 });

      config.updateBotGuildConfig(
        "guild-shared",
        {
          replyChannelIds: ["ch-police-updated"],
          ignoredChannelIds: ["ch-ignored"],
          respondToMentions: false,
          moderation: { enabled: false },
        },
        "policeBot",
      );

      // policeBot updated while chatBot remained completely isolated
      expect(config.getBotGuildConfig("policeBot", "guild-shared")).toEqual({
        replyChannelIds: ["ch-police-updated"],
        ignoredChannelIds: ["ch-ignored"],
        respondToMentions: false,
        moderation: { enabled: false },
      });
      expect(
        config.getBotGuildConfig("chatBot", "guild-shared")?.replyChannelIds,
      ).toEqual(["ch-chat-initial"]);
      expect(
        config.getBotGuildConfig("chatBot", "guild-shared")?.respondToMentions,
      ).toBe(true);

      // Default botId parameter targets chatBot without disturbing policeBot
      config.updateBotGuildConfig("guild-shared", {
        replyChannelIds: ["ch-chat-default-updated"],
        ignoredChannelIds: [],
        respondToMentions: false,
      });

      const allBots = config.getConfigValue(ConfigParameter.bots);
      expect(allBots.chatBot.guilds["guild-shared"]?.replyChannelIds).toEqual([
        "ch-chat-default-updated",
      ]);
      expect(allBots.policeBot.guilds["guild-shared"]?.moderation).toEqual({
        enabled: false,
      });
    });

    it("isolates chatBot and policeBot overrides in local mode without mutating localConfig", async () => {
      const config = Config.getInstance();
      await config.init({ useLocalConfigOnly: true });
      const localBaseline = structuredClone(config.getLocalConfig());

      config.updateBotGuildConfig(
        "guild-local-iso",
        {
          replyChannelIds: ["ch-chat-local"],
          ignoredChannelIds: [],
          respondToMentions: true,
        },
        "chatBot",
      );
      config.updateBotGuildConfig(
        "guild-local-iso",
        {
          replyChannelIds: [],
          ignoredChannelIds: ["ch-police-ignored"],
          respondToMentions: false,
          moderation: { enabled: true },
        },
        "policeBot",
      );

      expect(
        config.getBotGuildConfig("chatBot", "guild-local-iso")?.replyChannelIds,
      ).toEqual(["ch-chat-local"]);
      expect(
        config.getBotGuildConfig("policeBot", "guild-local-iso")?.moderation,
      ).toEqual({ enabled: true });

      const bots = config.getConfigValue(ConfigParameter.bots);
      expect(bots.chatBot.guilds["guild-local-iso"]?.replyChannelIds).toEqual([
        "ch-chat-local",
      ]);
      expect(
        bots.policeBot.guilds["guild-local-iso"]?.ignoredChannelIds,
      ).toEqual(["ch-police-ignored"]);
      expect(config.getLocalConfig()).toEqual(localBaseline);
    });

    it("clears stale overrides per (botId, guildId) on reload while preserving unrelated bot overrides", async () => {
      let resolveReload!: (val: {
        systemConfig: null;
        guildConfigs: {
          id: string;
          bot_id: string;
          guild_id: string;
          reply_channel_ids?: string[];
          respond_to_mentions?: boolean;
          moderation_enabled?: boolean;
        }[];
      }) => void;

      const reloadPromise = new Promise<{
        systemConfig: null;
        guildConfigs: {
          id: string;
          bot_id: string;
          guild_id: string;
          reply_channel_ids?: string[];
          respond_to_mentions?: boolean;
          moderation_enabled?: boolean;
        }[];
      }>((resolve) => {
        resolveReload = resolve;
      });

      vi.spyOn(guildConfigRepository, "fetchAllConfigs")
        .mockResolvedValueOnce({
          systemConfig: null,
          guildConfigs: [
            {
              id: "r-chat",
              bot_id: "chatBot",
              guild_id: "guild-reload-iso",
              reply_channel_ids: ["ch-chat-1"],
              respond_to_mentions: true,
            },
            {
              id: "r-police",
              bot_id: "policeBot",
              guild_id: "guild-reload-iso",
              moderation_enabled: false,
            },
          ],
        })
        .mockReturnValueOnce(reloadPromise);

      const config = Config.getInstance();
      await config.init({ configSource: "directus", refreshIntervalMs: 0 });

      // Stale override on chatBot before reload starts
      config.updateBotGuildConfig(
        "guild-reload-iso",
        {
          replyChannelIds: ["ch-chat-stale"],
          ignoredChannelIds: [],
          respondToMentions: false,
        },
        "chatBot",
      );

      const pendingLoad = config.loadConfig();

      // Concurrent override on policeBot for the SAME guildId while reload is in flight
      config.updateBotGuildConfig(
        "guild-reload-iso",
        {
          replyChannelIds: [],
          ignoredChannelIds: [],
          respondToMentions: false,
          moderation: { enabled: true },
        },
        "policeBot",
      );

      resolveReload({
        systemConfig: null,
        guildConfigs: [
          {
            id: "r-chat",
            bot_id: "chatBot",
            guild_id: "guild-reload-iso",
            reply_channel_ids: ["ch-chat-fresh"],
            respond_to_mentions: true,
          },
          {
            id: "r-police",
            bot_id: "policeBot",
            guild_id: "guild-reload-iso",
            moderation_enabled: false,
          },
        ],
      });

      await pendingLoad;

      // chatBot stale override was cleared; policeBot concurrent override survived
      expect(
        config.getBotGuildConfig("chatBot", "guild-reload-iso")
          ?.replyChannelIds,
      ).toEqual(["ch-chat-fresh"]);
      expect(
        config.getBotGuildConfig("policeBot", "guild-reload-iso")?.moderation
          ?.enabled,
      ).toBe(true);
    });

    it.each(["__proto__", "constructor", "prototype", ""])(
      "rejects unsafe botId and guildId (%j) in updateBotGuildConfig and getBotGuildConfig",
      async (unsafeKey) => {
        const config = Config.getInstance();
        await config.init({ useLocalConfigOnly: true });

        const dummyConfig = {
          replyChannelIds: [],
          ignoredChannelIds: [],
          respondToMentions: false,
        };

        expect(() =>
          config.updateBotGuildConfig("guild-safe", dummyConfig, unsafeKey),
        ).toThrow(/Invalid botId/);
        expect(() =>
          config.updateBotGuildConfig(unsafeKey, dummyConfig, "policeBot"),
        ).toThrow(/Invalid guildId/);

        expect(
          config.getBotGuildConfig(unsafeKey, "guild-safe"),
        ).toBeUndefined();
        expect(
          config.getBotGuildConfig("policeBot", unsafeKey),
        ).toBeUndefined();
      },
    );
  });
});
