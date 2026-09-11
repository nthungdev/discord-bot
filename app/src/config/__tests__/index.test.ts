import fs from "fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Config,
  ConfigParameter,
  loadLocalConfig,
  resolveConfigPath,
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

    it("should prioritize config.local.json over config.json", () => {
      vi.spyOn(fs, "existsSync").mockImplementation((p) => {
        return String(p).endsWith("config.local.json");
      });
      const resolved = resolveConfigPath();
      expect(resolved).toContain("config.local.json");
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
});
