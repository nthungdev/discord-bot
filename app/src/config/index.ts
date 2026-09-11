import {
  getRemoteConfig,
  type ServerTemplate,
} from "firebase-admin/remote-config";
import fs from "fs";
import path from "path";
import type {
  AiApiEndpointConfig,
  AiLocationIdConfig,
  AiMaxConversationHistoryConfig,
  AiMaxOutputTokens,
  AiModelIdConfig,
  AiProjectIdConfig,
  AiProviderConfig,
  AiSafetySettingsConfig,
  BotsConfig,
  CheckInLeaderboardConfig,
  GuildEmojisConfig,
  GuildMembersConfig,
  MemoryStoreTypeConfig,
} from "./types";

export enum ConfigParameter {
  guildEmojis = "guildEmojis",
  guildMembers = "guildMembers",
  bots = "bots",
  checkInLeaderboard = "checkInLeaderboard",
  aiApiEndpoint = "aiApiEndpoint",
  aiProjectId = "aiProjectId",
  aiModelId = "aiModelId",
  aiLocationId = "aiLocationId",
  aiProvider = "aiProvider",
  aiMaxOutputTokens = "aiMaxOutputTokens",
  aiSafetySettings = "aiSafetySettings",
  aiMaxConversationHistory = "aiMaxConversationHistory",
  memoryStoreType = "memoryStoreType",
}

export interface AppConfigData {
  guildEmojis: GuildEmojisConfig;
  guildMembers: GuildMembersConfig;
  bots: BotsConfig;
  checkInLeaderboard: CheckInLeaderboardConfig;
  aiSafetySettings: AiSafetySettingsConfig;
  aiProjectId: AiProjectIdConfig;
  aiModelId: AiModelIdConfig;
  aiMaxOutputTokens: AiMaxOutputTokens;
  aiLocationId: AiLocationIdConfig;
  aiProvider: AiProviderConfig;
  aiApiEndpoint: AiApiEndpointConfig;
  aiMaxConversationHistory: AiMaxConversationHistoryConfig;
  memoryStoreType: MemoryStoreTypeConfig;
}

/**
 * Searches for a custom config.json file in standard locations.
 */
export const resolveConfigPath = (customPath?: string): string | null => {
  const candidatePaths = [
    customPath,
    process.env.CONFIG_PATH,
    path.resolve(process.cwd(), "config.json"),
    path.resolve(process.cwd(), "app/config.json"),
    path.resolve(__dirname, "../../config.json"),
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
};

const DEFAULT_APP_CONFIG: AppConfigData = {
  guildEmojis: {},
  guildMembers: {},
  bots: {
    chatBot: { guilds: {} },
    policeBot: { guilds: {} },
  },
  checkInLeaderboard: "",
  aiSafetySettings: { safetySettings: [] },
  aiProjectId: "",
  aiModelId: "gemini-3.6-flash",
  aiMaxOutputTokens: 8192,
  aiLocationId: "us-central1",
  aiProvider: "google-genai",
  aiApiEndpoint: "us-central1-aiplatform.googleapis.com",
  aiMaxConversationHistory: 60,
  memoryStoreType: "firestore",
};

/**
 * Parses and returns configuration data from a valid json file path.
 */
function parseAppConfigFile(filePath: string): AppConfigData {
  const fileContent = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(fileContent) as Partial<AppConfigData>;
  return {
    ...DEFAULT_APP_CONFIG,
    ...parsed,
  };
}

/**
 * Reads config.json from disk. Throws an error if config.json cannot be found.
 */
export const loadLocalConfig = (customPath?: string): AppConfigData => {
  const configPath = resolveConfigPath(customPath);
  if (!configPath) {
    throw new Error(
      "Configuration file 'config.json' not found. Please create 'app/config.json' (see app/config.example.json for reference).",
    );
  }

  try {
    return parseAppConfigFile(configPath);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Failed to parse configuration file at ${configPath}: ${error.message}`,
      );
    }
    throw error;
  }
};

export const DEFAULT_CONFIG_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export class Config {
  private static instance: Config;
  private template: ServerTemplate | null = null;
  private localConfig: AppConfigData | null = null;
  private lastFetchedAt: number = 0;
  private refreshIntervalTimer: NodeJS.Timeout | null = null;
  private ttlMs: number = DEFAULT_CONFIG_REFRESH_INTERVAL_MS;
  private localOnly: boolean = false;

  private constructor() {}

  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  public isLocalOnly(): boolean {
    return this.localOnly;
  }

  public getLastFetchedAt(): number {
    return this.lastFetchedAt;
  }

  async init(options?: {
    refreshIntervalMs?: number;
    useLocalConfigOnly?: boolean;
  }) {
    this.localConfig = loadLocalConfig();
    if (options?.refreshIntervalMs !== undefined) {
      this.ttlMs = options.refreshIntervalMs;
    }

    this.localOnly =
      options?.useLocalConfigOnly ??
      (process.env.USE_CONFIG_FILE === "true" ||
        process.env.USE_CONFIG_FILE === "1");

    if (this.localOnly) {
      console.info(
        "[Config] Using local configuration file only (Remote Config omitted).",
      );
      return;
    }

    try {
      const rc = getRemoteConfig();
      this.template = await rc.getServerTemplate({
        defaultConfig: {
          guildEmojis: JSON.stringify(this.localConfig.guildEmojis),
          guildMembers: JSON.stringify(this.localConfig.guildMembers),
          bots: JSON.stringify(this.localConfig.bots),
          checkInLeaderboard: this.localConfig.checkInLeaderboard,
          aiApiEndpoint: this.localConfig.aiApiEndpoint,
          aiProjectId: this.localConfig.aiProjectId,
          aiModelId: this.localConfig.aiModelId,
          aiLocationId: this.localConfig.aiLocationId,
          aiProvider: this.localConfig.aiProvider,
          aiMaxOutputTokens: this.localConfig.aiMaxOutputTokens,
          aiSafetySettings: JSON.stringify(this.localConfig.aiSafetySettings),
          aiMaxConversationHistory: this.localConfig.aiMaxConversationHistory,
          memoryStoreType: this.localConfig.memoryStoreType,
        },
      });
      this.lastFetchedAt = Date.now();
    } catch (error) {
      console.warn(
        "Failed to initialize Server Remote Config template, using local config fallback:",
        error,
      );
    }
    this.startAutoRefresh();
  }

  startAutoRefresh() {
    this.stopAutoRefresh();
    if (this.ttlMs > 0) {
      this.refreshIntervalTimer = setInterval(() => {
        this.loadConfig().catch((err) => {
          console.error("Auto-refreshing Server Remote Config failed:", err);
        });
      }, this.ttlMs);
      if (this.refreshIntervalTimer.unref) {
        this.refreshIntervalTimer.unref();
      }
    }
  }

  stopAutoRefresh() {
    if (this.refreshIntervalTimer) {
      clearInterval(this.refreshIntervalTimer);
      this.refreshIntervalTimer = null;
    }
  }

  /** Fetch latest config version */
  async loadConfig() {
    if (this.localOnly) {
      return;
    }
    try {
      if (this.template) {
        await this.template.load();
      } else {
        const rc = getRemoteConfig();
        this.template = await rc.getServerTemplate();
      }
      this.lastFetchedAt = Date.now();
    } catch (error) {
      console.warn(
        "Failed to fetch/reload Server Remote Config template, using fallback:",
        error,
      );
    }
  }

  private getConfig() {
    if (!this.template) {
      return null;
    }
    return this.template.evaluate();
  }

  getLocalConfig(): AppConfigData {
    if (!this.localConfig) {
      this.localConfig = loadLocalConfig();
    }
    return this.localConfig;
  }

  getConfigValue<T extends ConfigParameter>(
    key: T,
  ): T extends ConfigParameter.guildEmojis
    ? GuildEmojisConfig
    : T extends ConfigParameter.bots
      ? BotsConfig
      : T extends ConfigParameter.checkInLeaderboard
        ? CheckInLeaderboardConfig
        : T extends ConfigParameter.guildMembers
          ? GuildMembersConfig
          : T extends ConfigParameter.aiSafetySettings
            ? AiSafetySettingsConfig
            : T extends ConfigParameter.aiApiEndpoint
              ? AiApiEndpointConfig
              : T extends ConfigParameter.aiLocationId
                ? AiLocationIdConfig
                : T extends ConfigParameter.aiProvider
                  ? AiProviderConfig
                  : T extends ConfigParameter.aiModelId
                    ? AiModelIdConfig
                    : T extends ConfigParameter.aiMaxOutputTokens
                      ? AiMaxOutputTokens
                      : T extends ConfigParameter.aiMaxConversationHistory
                        ? AiMaxConversationHistoryConfig
                        : T extends ConfigParameter.memoryStoreType
                          ? MemoryStoreTypeConfig
                          : AiProjectIdConfig {
    const config = this.getConfig();
    if (!config) {
      return this.getLocalConfig()[key] as never;
    }

    switch (key) {
      case ConfigParameter.guildEmojis:
      case ConfigParameter.guildMembers:
      case ConfigParameter.bots:
      case ConfigParameter.aiSafetySettings: {
        const strVal = config.getString(key);
        if (!strVal) return this.getLocalConfig()[key] as never;
        try {
          return JSON.parse(strVal);
        } catch {
          return this.getLocalConfig()[key] as never;
        }
      }
      case ConfigParameter.checkInLeaderboard:
      case ConfigParameter.aiApiEndpoint:
      case ConfigParameter.aiLocationId:
      case ConfigParameter.aiModelId:
      case ConfigParameter.aiProjectId:
      case ConfigParameter.aiProvider:
      case ConfigParameter.memoryStoreType: {
        const val = config.getString(key);
        return (val || this.getLocalConfig()[key]) as never;
      }
      case ConfigParameter.aiMaxOutputTokens:
      case ConfigParameter.aiMaxConversationHistory: {
        const numVal = config.getNumber(key);
        return (numVal || this.getLocalConfig()[key]) as never;
      }
      default:
        throw new Error("Invalid key");
    }
  }
}
