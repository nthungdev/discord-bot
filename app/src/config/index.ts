import fs from "node:fs";
import path from "node:path";
import {
  getRemoteConfig,
  type ServerTemplate,
} from "firebase-admin/remote-config";
import {
  isSafeRecordKey,
  mapDirectusToAppConfig,
} from "../infrastructure/directus/config-mapper";
import { guildConfigRepository } from "../infrastructure/repositories";
import type {
  AiApiEndpointConfig,
  AiLocationIdConfig,
  AiMaxConversationHistoryConfig,
  AiMaxOutputTokens,
  AiModelIdConfig,
  AiProjectIdConfig,
  AiProviderConfig,
  AiSafetySettingsConfig,
  BotGuildConfig,
  BotGuildsConfig,
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
  aiModelId: "gemini-4-hydrogen",
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
const DEFAULT_BOT_ID = "chatBot";

interface GuildOverrideEntry {
  botId: string;
  guildId: string;
  config: BotGuildConfig;
}

function buildGuildOverrideKey(botId: string, guildId: string): string {
  return JSON.stringify([botId, guildId]);
}

function setSafeProperty<T extends object>(
  target: T,
  key: string,
  value: unknown,
): void {
  if (!isSafeRecordKey(key)) {
    return;
  }
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

export type ConfigSource = "directus" | "remote-config" | "local";

const VALID_CONFIG_SOURCES: ReadonlySet<string> = new Set<ConfigSource>([
  "directus",
  "remote-config",
  "local",
]);

function isValidConfigSource(value: string | undefined): value is ConfigSource {
  return typeof value === "string" && VALID_CONFIG_SOURCES.has(value);
}

/**
 * Resolves the authoritative configuration source from explicit options and environment variables.
 */
export function resolveConfigSource(options?: {
  useLocalConfigOnly?: boolean;
  configSource?: ConfigSource;
}): ConfigSource {
  if (
    options?.useLocalConfigOnly === true ||
    process.env.USE_CONFIG_FILE === "true" ||
    process.env.USE_CONFIG_FILE === "1"
  ) {
    return "local";
  }
  if (options?.configSource && isValidConfigSource(options.configSource)) {
    return options.configSource;
  }
  if (isValidConfigSource(process.env.CONFIG_SOURCE)) {
    return process.env.CONFIG_SOURCE;
  }
  if (process.env.DIRECTUS_URL && process.env.DIRECTUS_BOT_TOKEN) {
    return "directus";
  }
  return "remote-config";
}

export class Config {
  private static instance: Config;
  private template: ServerTemplate | null = null;
  private localConfig: AppConfigData | null = null;
  private directusSnapshot: AppConfigData | null = null;
  private lastFetchedAt: number = 0;
  private refreshIntervalTimer: NodeJS.Timeout | null = null;
  private ttlMs: number = DEFAULT_CONFIG_REFRESH_INTERVAL_MS;
  private localOnly: boolean = false;
  private configSource: ConfigSource = "remote-config";
  private inMemoryGuildOverrides: Map<string, GuildOverrideEntry> = new Map();
  private overrideGenerations: Map<string, number> = new Map();
  private inMemoryGuildEmojiOverrides: Map<string, Record<string, string[]>> =
    new Map();
  private emojiOverrideGenerations: Map<string, number> = new Map();
  private inFlightLoad: Promise<void> | null = null;
  private loadGeneration: number = 0;

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

  public getConfigSource(): ConfigSource {
    return this.configSource;
  }

  public getLastFetchedAt(): number {
    return this.lastFetchedAt;
  }

  /**
   * Initializes the configuration service using Directus, Firebase Remote Config, or local config.json.
   */
  async init(options?: {
    refreshIntervalMs?: number;
    useLocalConfigOnly?: boolean;
    configSource?: ConfigSource;
  }): Promise<void> {
    this.localConfig = loadLocalConfig();
    this.loadGeneration += 1;
    this.inFlightLoad = null;
    this.directusSnapshot = null;
    this.template = null;
    this.inMemoryGuildOverrides.clear();
    this.overrideGenerations.clear();
    this.inMemoryGuildEmojiOverrides.clear();
    this.emojiOverrideGenerations.clear();

    if (options?.refreshIntervalMs !== undefined) {
      this.ttlMs = options.refreshIntervalMs;
    }

    this.configSource = resolveConfigSource(options);
    this.localOnly = this.configSource === "local";

    if (this.configSource === "local") {
      this.stopAutoRefresh();
      console.info(
        "[Config] Using local configuration file only (Remote Config omitted).",
      );
      return;
    }

    if (this.configSource === "directus") {
      await this.loadDirectusConfig();
      this.startAutoRefresh();
      return;
    }

    await this.initRemoteConfigTemplate();
    this.startAutoRefresh();
  }

  private async initRemoteConfigTemplate(): Promise<void> {
    const local = this.getLocalConfig();
    try {
      const rc = getRemoteConfig();
      this.template = await rc.getServerTemplate({
        defaultConfig: {
          guildEmojis: JSON.stringify(local.guildEmojis),
          guildMembers: JSON.stringify(local.guildMembers),
          bots: JSON.stringify(local.bots),
          checkInLeaderboard: local.checkInLeaderboard,
          aiApiEndpoint: local.aiApiEndpoint,
          aiProjectId: local.aiProjectId,
          aiModelId: local.aiModelId,
          aiLocationId: local.aiLocationId,
          aiProvider: local.aiProvider,
          aiMaxOutputTokens: local.aiMaxOutputTokens,
          aiSafetySettings: JSON.stringify(local.aiSafetySettings),
          aiMaxConversationHistory: local.aiMaxConversationHistory,
          memoryStoreType: local.memoryStoreType,
        },
      });
      this.lastFetchedAt = Date.now();
    } catch (error) {
      console.warn(
        "Failed to initialize Server Remote Config template, using local config fallback:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async loadDirectusConfig(): Promise<void> {
    const startGen = this.loadGeneration;
    const overrideVersionsAtStart = new Map(this.overrideGenerations);
    const emojiOverrideVersionsAtStart = new Map(this.emojiOverrideGenerations);
    try {
      const { systemConfig, guildConfigs } =
        await guildConfigRepository.fetchAllConfigs();
      if (startGen !== this.loadGeneration) {
        return;
      }
      this.directusSnapshot = mapDirectusToAppConfig(
        systemConfig,
        guildConfigs,
        this.getLocalConfig(),
      );
      for (const [
        overrideKey,
        startVersion,
      ] of overrideVersionsAtStart.entries()) {
        if (this.overrideGenerations.get(overrideKey) === startVersion) {
          this.inMemoryGuildOverrides.delete(overrideKey);
          this.overrideGenerations.delete(overrideKey);
        }
      }
      for (const [
        guildId,
        startVersion,
      ] of emojiOverrideVersionsAtStart.entries()) {
        if (this.emojiOverrideGenerations.get(guildId) === startVersion) {
          this.inMemoryGuildEmojiOverrides.delete(guildId);
          this.emojiOverrideGenerations.delete(guildId);
        }
      }
      this.lastFetchedAt = Date.now();
    } catch (error) {
      console.warn(
        "[Config] Failed to fetch Directus config, retaining fallback:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  startAutoRefresh(): void {
    this.stopAutoRefresh();
    if (this.ttlMs > 0) {
      this.refreshIntervalTimer = setInterval(() => {
        this.loadConfig().catch((err) => {
          console.error(
            "Auto-refreshing config failed:",
            err instanceof Error ? err.message : String(err),
          );
        });
      }, this.ttlMs);
      if (this.refreshIntervalTimer.unref) {
        this.refreshIntervalTimer.unref();
      }
    }
  }

  stopAutoRefresh(): void {
    if (this.refreshIntervalTimer) {
      clearInterval(this.refreshIntervalTimer);
      this.refreshIntervalTimer = null;
    }
  }

  private async executeLoadConfig(): Promise<void> {
    if (this.configSource === "directus") {
      await this.loadDirectusConfig();
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
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /** Fetch latest config version, deduplicating concurrent reloads */
  async loadConfig(): Promise<void> {
    if (this.localOnly || this.configSource === "local") {
      return;
    }
    if (this.inFlightLoad) {
      return this.inFlightLoad;
    }
    const loadPromise = this.executeLoadConfig().finally(() => {
      if (this.inFlightLoad === loadPromise) {
        this.inFlightLoad = null;
      }
    });
    this.inFlightLoad = loadPromise;
    return loadPromise;
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

  private parseJsonConfig<T>(strVal: string | null, fallback: T): T {
    if (!strVal) return fallback;
    try {
      return JSON.parse(strVal) as T;
    } catch {
      return fallback;
    }
  }

  private applyGuildOverrides(bots: BotsConfig): BotsConfig {
    if (this.inMemoryGuildOverrides.size === 0 || !bots) {
      return bots;
    }
    const updatedBots: BotsConfig = { ...bots };
    const clonedGuildMaps = new Map<string, BotGuildsConfig>();

    for (const {
      botId,
      guildId,
      config,
    } of this.inMemoryGuildOverrides.values()) {
      if (!(isSafeRecordKey(botId) && isSafeRecordKey(guildId))) {
        continue;
      }
      const baseBot = Object.hasOwn(updatedBots, botId)
        ? updatedBots[botId]
        : undefined;
      let targetGuilds = clonedGuildMaps.get(botId);
      if (!targetGuilds) {
        targetGuilds = { ...(baseBot?.guilds ?? {}) };
        clonedGuildMaps.set(botId, targetGuilds);
        setSafeProperty(updatedBots, botId, {
          ...baseBot,
          guilds: targetGuilds,
        });
      }
      const existing = Object.hasOwn(targetGuilds, guildId)
        ? targetGuilds[guildId]
        : undefined;
      setSafeProperty(targetGuilds, guildId, {
        ...existing,
        ...config,
      });
    }

    return updatedBots;
  }

  private applyGuildEmojiOverrides(
    guildEmojis: GuildEmojisConfig,
  ): GuildEmojisConfig {
    if (this.inMemoryGuildEmojiOverrides.size === 0 || !guildEmojis) {
      return guildEmojis;
    }
    const updatedGuildEmojis: GuildEmojisConfig = { ...guildEmojis };
    for (const [
      guildId,
      emojiMapping,
    ] of this.inMemoryGuildEmojiOverrides.entries()) {
      if (!isSafeRecordKey(guildId)) {
        continue;
      }
      setSafeProperty(updatedGuildEmojis, guildId, emojiMapping);
    }
    return updatedGuildEmojis;
  }

  private getGuildEmojisConfig(): GuildEmojisConfig {
    if (this.configSource === "directus") {
      const snapshot = this.directusSnapshot ?? this.getLocalConfig();
      return this.applyGuildEmojiOverrides(snapshot.guildEmojis);
    }
    const fallback = this.getLocalConfig()[ConfigParameter.guildEmojis];
    const config = this.getConfig();
    if (!config) {
      return this.applyGuildEmojiOverrides(fallback);
    }
    const strVal = config.getString(ConfigParameter.guildEmojis);
    const parsedEmojis = this.parseJsonConfig(strVal, fallback);
    return this.applyGuildEmojiOverrides(parsedEmojis);
  }

  private getBotsConfig(): BotsConfig {
    if (this.configSource === "directus") {
      const snapshot = this.directusSnapshot ?? this.getLocalConfig();
      return this.applyGuildOverrides(snapshot.bots);
    }
    const fallback = this.getLocalConfig()[
      ConfigParameter.bots
    ] as unknown as BotsConfig;
    const config = this.getConfig();
    if (!config) {
      return this.applyGuildOverrides(fallback);
    }
    const strVal = config.getString(ConfigParameter.bots);
    const parsedBots = this.parseJsonConfig(strVal, fallback);
    return this.applyGuildOverrides(parsedBots);
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
    if (key === ConfigParameter.bots) {
      return this.getBotsConfig() as never;
    }
    if (key === ConfigParameter.guildEmojis) {
      return this.getGuildEmojisConfig() as never;
    }

    if (this.configSource === "directus") {
      const snapshot = this.directusSnapshot ?? this.getLocalConfig();
      return snapshot[key] as never;
    }

    const config = this.getConfig();
    if (!config) {
      return this.getLocalConfig()[key] as never;
    }

    switch (key) {
      case ConfigParameter.guildEmojis:
      case ConfigParameter.guildMembers:
      case ConfigParameter.aiSafetySettings: {
        const strVal = config.getString(key);
        return this.parseJsonConfig(
          strVal,
          this.getLocalConfig()[key],
        ) as never;
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

  /**
   * Updates or sets an authoritative in-memory override for a guild configuration.
   * Survives evaluate() cycles without mutating `localConfig`, and updates `directusSnapshot` if present.
   */
  public updateBotGuildConfig(
    guildId: string,
    updatedConfig: BotGuildConfig,
    botId = DEFAULT_BOT_ID,
  ): void {
    if (!isSafeRecordKey(botId)) {
      throw new Error("Invalid botId for configuration update.");
    }
    if (!isSafeRecordKey(guildId)) {
      throw new Error("Invalid guildId for configuration update.");
    }

    const overrideKey = buildGuildOverrideKey(botId, guildId);
    this.inMemoryGuildOverrides.set(overrideKey, {
      botId,
      guildId,
      config: updatedConfig,
    });
    this.overrideGenerations.set(
      overrideKey,
      (this.overrideGenerations.get(overrideKey) ?? 0) + 1,
    );

    if (this.directusSnapshot) {
      const existingBots = this.directusSnapshot.bots ?? ({} as BotsConfig);
      const existingBot = Object.hasOwn(existingBots, botId)
        ? existingBots[botId]
        : undefined;
      const updatedGuilds: BotGuildsConfig = {
        ...(existingBot?.guilds ?? {}),
      };
      setSafeProperty(updatedGuilds, guildId, updatedConfig);

      const updatedBots: BotsConfig = { ...existingBots };
      setSafeProperty(updatedBots, botId, {
        ...existingBot,
        guilds: updatedGuilds,
      });

      this.directusSnapshot = {
        ...this.directusSnapshot,
        bots: updatedBots,
      };
    }
  }

  /**
   * Updates or sets an authoritative in-memory override for a guild's custom emoji mapping.
   * Survives evaluate() cycles without mutating `localConfig`, and updates `directusSnapshot` if present.
   */
  public updateGuildEmojis(
    guildId: string,
    emojis: Record<string, string[]>,
  ): void {
    if (!isSafeRecordKey(guildId)) {
      throw new Error("Invalid guildId for emoji configuration update.");
    }

    const clonedEmojis: Record<string, string[]> = {};
    for (const [emojiKey, customNames] of Object.entries(emojis)) {
      if (!isSafeRecordKey(emojiKey)) {
        continue;
      }
      setSafeProperty(clonedEmojis, emojiKey, [...customNames]);
    }

    this.inMemoryGuildEmojiOverrides.set(guildId, clonedEmojis);
    this.emojiOverrideGenerations.set(
      guildId,
      (this.emojiOverrideGenerations.get(guildId) ?? 0) + 1,
    );

    if (this.directusSnapshot) {
      const updatedGuildEmojis: GuildEmojisConfig = {
        ...(this.directusSnapshot.guildEmojis ?? {}),
      };
      setSafeProperty(updatedGuildEmojis, guildId, clonedEmojis);
      this.directusSnapshot = {
        ...this.directusSnapshot,
        guildEmojis: updatedGuildEmojis,
      };
    }
  }

  /**
   * Synchronously resolves a bot's configuration for a specific guild, guarding against prototype lookups.
   */
  getBotGuildConfig(
    botId: string,
    guildId: string,
  ): BotGuildConfig | undefined {
    if (!(isSafeRecordKey(botId) && isSafeRecordKey(guildId))) {
      return undefined;
    }
    const override = this.inMemoryGuildOverrides.get(
      buildGuildOverrideKey(botId, guildId),
    );
    if (override) {
      return override.config;
    }
    const bots = this.getConfigValue(ConfigParameter.bots);
    if (!(bots && Object.hasOwn(bots, botId))) {
      return undefined;
    }
    const bot = bots[botId as keyof BotsConfig];
    if (!(bot?.guilds && Object.hasOwn(bot.guilds, guildId))) {
      return undefined;
    }
    return bot.guilds[guildId];
  }
}
