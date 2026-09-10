import fs from "fs";
import path from "path";
import { ServerTemplate, getRemoteConfig } from "firebase-admin/remote-config";
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
  aiSystemInstruction = "aiSystemInstruction",
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
  aiSystemInstruction: string;
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
    path.resolve(__dirname, "../../../config.json"),
    path.resolve(__dirname, "../../../../config.json"),
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
      "Configuration file 'config.json' not found. Please create 'config.json' at the project or repo root (see config.example.json for reference)."
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
      aiSystemInstruction: parsed.aiSystemInstruction ?? "You are a conversation chatbot.",
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

export class Config {
  private static instance: Config;
  private template: ServerTemplate | null = null;
  private localConfig: AppConfigData | null = null;

  private constructor() {}

  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  async init() {
    this.localConfig = loadLocalConfig();
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
        aiSystemInstruction: this.localConfig.aiSystemInstruction,
        aiMaxOutputTokens: this.localConfig.aiMaxOutputTokens,
        aiSafetySettings: JSON.stringify(this.localConfig.aiSafetySettings),
        aiMaxConversationHistory: this.localConfig.aiMaxConversationHistory,
        memoryStoreType: this.localConfig.memoryStoreType,
      },
    });
  }

  private getConfig() {
    if (!this.template) {
      throw new Error("Remote config not initialized");
    }
    const config = this.template.evaluate();
    return config;
  }

  /** Fetch latest config version */
  async loadConfig() {
    if (!this.template) {
      throw new Error("Remote config not initialized");
    }
    await this.template?.load();
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
    if (!this.template) {
      return this.getLocalConfig()[key] as never;
    }
    const config = this.getConfig();
    switch (key) {
      case ConfigParameter.guildEmojis:
      case ConfigParameter.guildMembers:
      case ConfigParameter.bots:
      case ConfigParameter.aiSafetySettings:
        return JSON.parse(config.getValue(key).asString());
      case ConfigParameter.checkInLeaderboard:
      case ConfigParameter.aiApiEndpoint:
      case ConfigParameter.aiLocationId:
      case ConfigParameter.aiModelId:
      case ConfigParameter.aiProjectId:
      case ConfigParameter.aiProvider:
      case ConfigParameter.aiSystemInstruction:
      case ConfigParameter.memoryStoreType:
        return config.getString(key) as never;
      case ConfigParameter.aiMaxOutputTokens:
      case ConfigParameter.aiMaxConversationHistory:
        return config.getNumber(key) as never;
      default:
        throw new Error("Invalid key");
    }
  }
}