import fs from "fs";
import path from "path";
import { RemoteConfigTemplate, getRemoteConfig } from "firebase-admin/remote-config";
import {
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

/**
 * Reads config.json from disk. Throws an error if config.json cannot be found.
 */
export const loadLocalConfig = (customPath?: string): AppConfigData => {
  const configPath = resolveConfigPath(customPath);
  if (!configPath) {
    throw new Error(
      "Configuration file 'config.json' not found. Please create 'app/config.json' (see app/config.example.json for reference)."
    );
  }

  try {
    const fileContent = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(fileContent) as Partial<AppConfigData>;

    return {
      guildEmojis: parsed.guildEmojis ?? {},
      guildMembers: parsed.guildMembers ?? {},
      bots: parsed.bots ?? { chatBot: { guilds: {} }, policeBot: { guilds: {} } },
      checkInLeaderboard: parsed.checkInLeaderboard ?? "",
      aiSafetySettings: parsed.aiSafetySettings ?? { safetySettings: [] },
      aiProjectId: parsed.aiProjectId ?? "",
      aiModelId: parsed.aiModelId ?? "gemini-3.6-flash",
      aiMaxOutputTokens: parsed.aiMaxOutputTokens ?? 8192,
      aiLocationId: parsed.aiLocationId ?? "us-central1",
      aiProvider: parsed.aiProvider ?? "google-genai",
      aiApiEndpoint: parsed.aiApiEndpoint ?? "us-central1-aiplatform.googleapis.com",
      aiMaxConversationHistory: parsed.aiMaxConversationHistory ?? 60,
      memoryStoreType: parsed.memoryStoreType ?? "firestore",
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse configuration file at ${configPath}: ${error.message}`);
    }
    throw error;
  }
};

export const DEFAULT_CONFIG_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export class Config {
  private static instance: Config;
  private template: RemoteConfigTemplate | null = null;
  private localConfig: AppConfigData | null = null;
  private lastFetchedAt: number = 0;
  private refreshIntervalTimer: NodeJS.Timeout | null = null;
  private ttlMs: number = DEFAULT_CONFIG_REFRESH_INTERVAL_MS;

  private constructor() {}

  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  async init(options?: { refreshIntervalMs?: number }) {
    this.localConfig = loadLocalConfig();
    if (options?.refreshIntervalMs !== undefined) {
      this.ttlMs = options.refreshIntervalMs;
    }
    await this.loadConfig();
    this.startAutoRefresh();
  }

  startAutoRefresh() {
    this.stopAutoRefresh();
    if (this.ttlMs > 0) {
      this.refreshIntervalTimer = setInterval(() => {
        this.loadConfig().catch((err) => {
          console.error("Auto-refreshing Remote Config failed:", err);
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
    try {
      const rc = getRemoteConfig();
      this.template = await rc.getTemplate();
      this.lastFetchedAt = Date.now();
    } catch (error) {
      console.warn("Failed to fetch/reload Remote Config template, using fallback:", error);
    }
  }

  getLocalConfig(): AppConfigData {
    if (!this.localConfig) {
      this.localConfig = loadLocalConfig();
    }
    return this.localConfig;
  }

  getConfigValue<T extends ConfigParameter>(
    key: T
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
    const rawVal = this.template?.parameters?.[key]?.defaultValue as { value?: string } | undefined;
    const value = rawVal?.value;

    if (value === undefined || value === null) {
      return this.getLocalConfig()[key] as never;
    }

    switch (key) {
      case ConfigParameter.guildEmojis:
      case ConfigParameter.guildMembers:
      case ConfigParameter.bots:
      case ConfigParameter.aiSafetySettings:
        try {
          return JSON.parse(value);
        } catch {
          return this.getLocalConfig()[key] as never;
        }
      case ConfigParameter.checkInLeaderboard:
      case ConfigParameter.aiApiEndpoint:
      case ConfigParameter.aiLocationId:
      case ConfigParameter.aiModelId:
      case ConfigParameter.aiProjectId:
      case ConfigParameter.aiProvider:
      case ConfigParameter.memoryStoreType:
        return value as never;
      case ConfigParameter.aiMaxOutputTokens:
      case ConfigParameter.aiMaxConversationHistory:
        return Number(value) as never;
      default:
        throw new Error("Invalid key");
    }
  }
}