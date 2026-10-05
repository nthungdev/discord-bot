import fs from "node:fs/promises";
import path from "node:path";
import { Config, ConfigParameter } from "../../config";
import type { BotGuildConfig, BotsConfig } from "../../config/types";
import type { SupportedRoastLocale } from "../roast/types";

export type GuildLocaleSetting = SupportedRoastLocale | "auto";

export interface IGuildLocaleStore {
  getLocale(
    guildId?: string | null,
    guildConfig?: BotGuildConfig,
  ): GuildLocaleSetting;
  setLocale(guildId: string, locale: GuildLocaleSetting): Promise<void>;
  isOverridden(guildId?: string | null, guildConfig?: BotGuildConfig): boolean;
  clear(guildId?: string): Promise<void>;
}

export class GuildLocaleStore implements IGuildLocaleStore {
  private filePath: string;
  private overrides = new Map<string, SupportedRoastLocale>();
  private isLoaded = false;

  constructor(customPath?: string) {
    this.filePath =
      customPath || path.resolve(process.cwd(), ".data", "guild-locales.json");
  }

  private async ensureLoaded(): Promise<void> {
    if (this.isLoaded) return;

    try {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      const content = await fs.readFile(this.filePath, "utf-8");
      const records: Record<string, SupportedRoastLocale> = JSON.parse(content);
      this.overrides = new Map(Object.entries(records));
    } catch {
      this.overrides.clear();
    }
    this.isLoaded = true;
  }

  private async persist(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    const records = Object.fromEntries(this.overrides.entries());
    const tempFile = `${this.filePath}.tmp.${Date.now()}`;
    await fs.writeFile(tempFile, JSON.stringify(records, null, 2), "utf-8");
    await fs.rename(tempFile, this.filePath);
  }

  /**
   * Retrieves the effective locale setting for a guild.
   */
  public getLocale(
    guildId?: string | null,
    guildConfig?: BotGuildConfig,
  ): GuildLocaleSetting {
    if (!guildId) return "auto";

    // 1. Check persistent overrides map
    const stored = this.overrides.get(guildId);
    if (stored === "vi" || stored === "en-US") {
      return stored;
    }

    // 2. Check provided guild config override
    const configOverride =
      guildConfig?.roast?.localeOverride ?? guildConfig?.localeOverride;
    if (configOverride === "vi" || configOverride === "en-US") {
      return configOverride;
    }

    // 3. Check global loaded config if available
    try {
      const botsConfig = Config.getInstance().getConfigValue(
        ConfigParameter.bots,
      ) as BotsConfig;
      const loadedGuildConfig = botsConfig?.chatBot?.guilds?.[guildId];
      const loadedOverride =
        loadedGuildConfig?.roast?.localeOverride ??
        loadedGuildConfig?.localeOverride;
      if (loadedOverride === "vi" || loadedOverride === "en-US") {
        return loadedOverride;
      }
    } catch {
      // Config not yet initialized or test environment
    }

    return "auto";
  }

  /**
   * Determines whether an explicit locale override is active.
   */
  public isOverridden(
    guildId?: string | null,
    guildConfig?: BotGuildConfig,
  ): boolean {
    return this.getLocale(guildId, guildConfig) !== "auto";
  }

  /**
   * Sets or clears the server-wide locale override for a guild.
   */
  public async setLocale(
    guildId: string,
    locale: GuildLocaleSetting,
  ): Promise<void> {
    await this.ensureLoaded();

    if (locale === "auto") {
      this.overrides.delete(guildId);
    } else {
      this.overrides.set(guildId, locale);
    }

    await this.persist();
  }

  /**
   * Clears overrides for a guild or all guilds.
   */
  public async clear(guildId?: string): Promise<void> {
    await this.ensureLoaded();
    if (guildId) {
      this.overrides.delete(guildId);
    } else {
      this.overrides.clear();
    }
    await this.persist();
  }
}

// Singleton instance
let storeInstance: GuildLocaleStore | null = null;

export function getGuildLocaleStore(customPath?: string): GuildLocaleStore {
  if (!storeInstance || customPath) {
    storeInstance = new GuildLocaleStore(customPath);
  }
  return storeInstance;
}
