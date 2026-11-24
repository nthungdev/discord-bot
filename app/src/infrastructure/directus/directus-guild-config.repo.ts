import {
  createItem,
  readItems,
  readSingleton,
  updateItem,
  updateSingleton,
} from "@directus/sdk";
import type { AppConfigData } from "../../config";
import type {
  BotGuildConfig,
  ValorantFeaturesConfig,
} from "../../config/types";
import {
  DEFAULT_GUILD_CONFIG,
  type GuildConfig,
} from "../../domain/models/guild-config";
import type { IGuildConfigRepository } from "../../domain/repositories/guild-config.repository";
import { directusClient } from "./client";
import {
  extractValorantFeaturesFromRaw,
  flattenValorantFeaturesToRaw,
  isSafeRecordKey,
  mapAppConfigToDirectusSystemPayload,
  mapBotGuildConfigToDirectusPayload,
  mapPartialBotGuildConfigToDirectusPayload,
} from "./config-mapper";
import type { DirectusGuildConfigRaw, DirectusSystemConfigRaw } from "./types";

export { extractValorantFeaturesFromRaw, flattenValorantFeaturesToRaw };

const DEFAULT_BOT_ID = "chatBot";
const DEFAULT_ROAST_LOCALE = "vi";
const DEFAULT_ROAST_MAX_PER_DAY = 10;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Maps a raw flattened Directus `bot_guild_configs` record into a domain `GuildConfig`.
 */
export function mapRawToGuildConfig(raw: DirectusGuildConfigRaw): GuildConfig {
  const isEnglish =
    raw.roast_default_locale === "en" || raw.roast_default_locale === "en-US";
  const allowedChannelIds = Array.isArray(raw.roast_allowed_channel_ids)
    ? raw.roast_allowed_channel_ids.filter(
        (id): id is string => typeof id === "string",
      )
    : [];
  return {
    guildId: raw.guild_id,
    guildName: raw.guild_name ?? undefined,
    enableAiRoast: raw.roast_enabled ?? true,
    enableBouncergon: raw.voice_bouncer_enabled ?? false,
    defaultLocale: isEnglish ? "en" : "vi",
    maxRoastsPerDay: raw.roast_max_per_day ?? DEFAULT_ROAST_MAX_PER_DAY,
    allowedChannelIds: new Set<string>(allowedChannelIds),
    matchmakingLobbyChannelId: raw.matchmaking_lobby_channel_id ?? undefined,
    valorantEnabled: raw.valorant_enabled ?? true,
    valorantFeatures: extractValorantFeaturesFromRaw(raw),
  };
}

function createFallbackGuildConfig(guildId: string): GuildConfig {
  return {
    ...DEFAULT_GUILD_CONFIG,
    guildId,
    allowedChannelIds: new Set<string>(),
  };
}

export class DirectusGuildConfigRepository implements IGuildConfigRepository {
  private cache = new Map<string, { config: GuildConfig; expiresAt: number }>();
  private idToGuildMap = new Map<string, string>();
  private cacheGeneration = 0;
  private readonly ttlMs: number;

  constructor(ttlMs = DEFAULT_CACHE_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  async getConfig(guildId: string): Promise<GuildConfig> {
    const cached = this.cache.get(guildId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.config;
    }

    const generation = this.cacheGeneration;

    try {
      const items = await directusClient.request(
        readItems("bot_guild_configs", {
          filter: { guild_id: { _eq: guildId } },
          limit: 1,
        }),
      );

      if (!items || items.length === 0) {
        const fallbackConfig = createFallbackGuildConfig(guildId);
        if (this.cacheGeneration === generation) {
          this.cache.set(guildId, {
            config: fallbackConfig,
            expiresAt: Date.now() + this.ttlMs,
          });
        }
        return fallbackConfig;
      }

      const raw = items[0];
      const config = mapRawToGuildConfig(raw);

      if (this.cacheGeneration === generation) {
        if (raw.id) {
          this.idToGuildMap.set(String(raw.id), raw.guild_id);
        }
        this.cache.set(guildId, {
          config,
          expiresAt: Date.now() + this.ttlMs,
        });
      }

      return config;
    } catch (error) {
      console.warn(
        `[GuildConfigRepo] Directus fetch failed for guild ${guildId}. Returning fallback:`,
        error instanceof Error ? error.message : String(error),
      );
      return cached?.config ?? createFallbackGuildConfig(guildId);
    }
  }

  async updateValorantConfig(
    guildId: string,
    valorantEnabled: boolean,
    valorantFeatures?: ValorantFeaturesConfig,
  ): Promise<void> {
    try {
      const items = await directusClient.request(
        readItems("bot_guild_configs", {
          filter: { guild_id: { _eq: guildId } },
          limit: 1,
        }),
      );

      const existing = items?.[0];
      const payload: Partial<DirectusGuildConfigRaw> = {
        valorant_enabled: valorantEnabled,
        ...flattenValorantFeaturesToRaw(valorantFeatures),
      };

      if (existing?.id) {
        await directusClient.request(
          updateItem("bot_guild_configs", existing.id, payload),
        );
      } else {
        await directusClient.request(
          createItem("bot_guild_configs", {
            bot_id: DEFAULT_BOT_ID,
            guild_id: guildId,
            roast_enabled: true,
            voice_bouncer_enabled: false,
            roast_default_locale: DEFAULT_ROAST_LOCALE,
            roast_max_per_day: DEFAULT_ROAST_MAX_PER_DAY,
            ...payload,
          }),
        );
      }
      this.invalidate(guildId);
    } catch (error) {
      console.error(
        `[GuildConfigRepo] Failed to persist Valorant config to Directus for guild ${guildId}:`,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Fetches the global `bot_system_config` singleton and all `bot_guild_configs` rows.
   */
  async fetchAllConfigs(): Promise<{
    systemConfig: DirectusSystemConfigRaw | null;
    guildConfigs: DirectusGuildConfigRaw[];
  }> {
    const [rawSystem, rawGuilds] = await Promise.all([
      directusClient.request(readSingleton("bot_system_config")),
      directusClient.request(readItems("bot_guild_configs", { limit: -1 })),
    ]);

    if (!Array.isArray(rawGuilds)) {
      throw new Error(
        "Invalid Directus response: bot_guild_configs did not return an array.",
      );
    }

    const systemConfig =
      rawSystem &&
      typeof rawSystem === "object" &&
      !Array.isArray(rawSystem) &&
      Object.keys(rawSystem).length > 0
        ? (rawSystem as DirectusSystemConfigRaw)
        : null;

    const guildConfigs = rawGuilds as DirectusGuildConfigRaw[];

    this.idToGuildMap.clear();
    for (const row of guildConfigs) {
      if (row.id && row.guild_id) {
        this.idToGuildMap.set(String(row.id), row.guild_id);
      }
    }

    return { systemConfig, guildConfigs };
  }

  private buildGuildConfigFilter(effectiveBotId: string, guildId: string) {
    return effectiveBotId === DEFAULT_BOT_ID
      ? {
          _and: [
            { guild_id: { _eq: guildId } },
            {
              _or: [
                { bot_id: { _eq: effectiveBotId } },
                { bot_id: { _null: true } },
              ],
            },
          ],
        }
      : {
          _and: [
            { guild_id: { _eq: guildId } },
            { bot_id: { _eq: effectiveBotId } },
          ],
        };
  }

  private validateBotAndGuildId(
    botId: string,
    guildId: string,
  ): { effectiveBotId: string; guildId: string } {
    if (!isSafeRecordKey(guildId)) {
      throw new Error("Invalid guildId for Directus guild config.");
    }
    const effectiveBotId = botId || DEFAULT_BOT_ID;
    if (!isSafeRecordKey(effectiveBotId)) {
      throw new Error("Invalid botId for Directus guild config.");
    }
    return { effectiveBotId, guildId };
  }

  /**
   * Upserts a full `BotGuildConfig` row for `(botId, guildId)` into `bot_guild_configs`.
   */
  async upsertBotGuildConfig(
    botId: string,
    guildId: string,
    config: BotGuildConfig,
  ): Promise<void> {
    const { effectiveBotId } = this.validateBotAndGuildId(botId, guildId);
    const filter = this.buildGuildConfigFilter(effectiveBotId, guildId);

    try {
      const items = await directusClient.request(
        readItems("bot_guild_configs", {
          filter,
          limit: 1,
        }),
      );

      const existing = items?.[0];
      const payload = mapBotGuildConfigToDirectusPayload(
        effectiveBotId,
        guildId,
        config,
      );

      if (existing?.id) {
        await directusClient.request(
          updateItem("bot_guild_configs", existing.id, payload),
        );
      } else {
        await directusClient.request(createItem("bot_guild_configs", payload));
      }
      this.invalidate(guildId);
    } catch (error) {
      console.error(
        `[GuildConfigRepo] Failed to upsert bot guild config to Directus for ${effectiveBotId}/${guildId}:`,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Patches only the defined fields of a partial `BotGuildConfig` onto Directus without overwriting unrelated columns.
   */
  async patchBotGuildConfig(
    botId: string,
    guildId: string,
    partial: Partial<BotGuildConfig>,
  ): Promise<void> {
    const { effectiveBotId } = this.validateBotAndGuildId(botId, guildId);
    const partialPayload = mapPartialBotGuildConfigToDirectusPayload(partial);
    if (Object.keys(partialPayload).length === 0) {
      return;
    }

    const filter = this.buildGuildConfigFilter(effectiveBotId, guildId);

    try {
      const items = await directusClient.request(
        readItems("bot_guild_configs", {
          filter,
          limit: 1,
        }),
      );

      const existing = items?.[0];
      if (existing?.id) {
        await directusClient.request(
          updateItem("bot_guild_configs", existing.id, partialPayload),
        );
      } else {
        const fullConfig: BotGuildConfig = {
          replyChannelIds: [],
          ignoredChannelIds: [],
          respondToMentions: false,
          ...partial,
        };
        const createPayload = mapBotGuildConfigToDirectusPayload(
          effectiveBotId,
          guildId,
          fullConfig,
        );
        await directusClient.request(
          createItem("bot_guild_configs", createPayload),
        );
      }
      this.invalidate(guildId);
    } catch (error) {
      console.error(
        `[GuildConfigRepo] Failed to patch bot guild config in Directus for ${effectiveBotId}/${guildId}:`,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Persists custom emoji mappings across all `bot_guild_configs` rows for a guild.
   * Creates a default `chatBot` row if none exist yet.
   */
  async upsertGuildEmojis(
    guildId: string,
    emojis: Record<string, string[]>,
  ): Promise<void> {
    if (!isSafeRecordKey(guildId)) {
      throw new Error("Invalid guildId for Directus guild emojis.");
    }

    try {
      const items = await directusClient.request(
        readItems("bot_guild_configs", {
          filter: { guild_id: { _eq: guildId } },
          limit: -1,
        }),
      );

      const rowsWithId = Array.isArray(items)
        ? items.filter((item) => Boolean(item.id))
        : [];

      if (rowsWithId.length > 0) {
        await Promise.all(
          rowsWithId.map((item) =>
            directusClient.request(
              updateItem("bot_guild_configs", item.id, {
                guild_emojis: emojis,
              }),
            ),
          ),
        );
      } else {
        await directusClient.request(
          createItem("bot_guild_configs", {
            guild_id: guildId,
            bot_id: DEFAULT_BOT_ID,
            guild_emojis: emojis,
          }),
        );
      }

      this.invalidate(guildId);
    } catch (error) {
      console.error(
        `[GuildConfigRepo] Failed to upsert guild emojis to Directus for guild ${guildId}:`,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Updates the `bot_system_config` singleton in Directus with partial `AppConfigData` system fields.
   */
  async upsertSystemConfig(partial: Partial<AppConfigData>): Promise<void> {
    const payload = mapAppConfigToDirectusSystemPayload(partial);
    if (Object.keys(payload).length === 0) {
      return;
    }

    try {
      await directusClient.request(
        updateSingleton("bot_system_config", payload),
      );
    } catch (error) {
      console.error(
        "[GuildConfigRepo] Failed to upsert system config to Directus:",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  invalidate(key?: string): void {
    this.cacheGeneration += 1;
    if (key) {
      const targetGuildId = this.idToGuildMap.get(key) || key;
      this.cache.delete(targetGuildId);
      this.idToGuildMap.delete(key);
      if (key !== targetGuildId) {
        this.cache.delete(key);
      }
      console.log(
        `[GuildConfigRepo] Invalidation applied for key: ${key} (guild: ${targetGuildId})`,
      );
    } else {
      this.cache.clear();
      this.idToGuildMap.clear();
      console.log("[GuildConfigRepo] All cached guild configurations evicted.");
    }
  }
}
