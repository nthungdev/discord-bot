import { createItem, readItems, updateItem } from "@directus/sdk";
import type { ValorantFeaturesConfig } from "../../config/types";
import {
  DEFAULT_GUILD_CONFIG,
  type GuildConfig,
} from "../../domain/models/guild-config";
import type { IGuildConfigRepository } from "../../domain/repositories/guild-config.repository";
import { directusClient } from "./client";
import type { DirectusGuildConfigRaw } from "./types";

const DEFAULT_BOT_ID = "chatBot";
const DEFAULT_ROAST_LOCALE = "vi";
const DEFAULT_ROAST_MAX_PER_DAY = 10;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

function extractCompareConfig(
  raw: DirectusGuildConfigRaw,
): ValorantFeaturesConfig["compare"] | undefined {
  if (raw.valorant_compare_enabled == null) {
    return undefined;
  }
  return { enabled: raw.valorant_compare_enabled };
}

function extractStatsSummaryConfig(
  raw: DirectusGuildConfigRaw,
): ValorantFeaturesConfig["statsSummary"] | undefined {
  const result: NonNullable<ValorantFeaturesConfig["statsSummary"]> = {};
  if (raw.valorant_stats_enabled != null) {
    result.enabled = raw.valorant_stats_enabled;
  }
  if (raw.valorant_stats_default_period != null) {
    result.defaultPeriod = raw.valorant_stats_default_period;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function extractAutoRecapConfig(
  raw: DirectusGuildConfigRaw,
): ValorantFeaturesConfig["autoRecap"] | undefined {
  const result: NonNullable<ValorantFeaturesConfig["autoRecap"]> = {};
  if (raw.valorant_auto_recap_enabled != null) {
    result.enabled = raw.valorant_auto_recap_enabled;
  }
  if (raw.valorant_auto_recap_channel_id != null) {
    result.channelId = raw.valorant_auto_recap_channel_id;
  }
  if (raw.valorant_auto_recap_min_tier_alert != null) {
    result.minTierAlert = raw.valorant_auto_recap_min_tier_alert;
  }
  if (raw.valorant_auto_recap_sportscaster_banter != null) {
    result.sportscasterBanter = raw.valorant_auto_recap_sportscaster_banter;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function extractLiveScoutingConfig(
  raw: DirectusGuildConfigRaw,
): ValorantFeaturesConfig["liveScouting"] | undefined {
  const result: NonNullable<ValorantFeaturesConfig["liveScouting"]> = {};
  if (raw.valorant_live_scouting_enabled != null) {
    result.enabled = raw.valorant_live_scouting_enabled;
  }
  if (raw.valorant_live_scouting_channel_id != null) {
    result.channelId = raw.valorant_live_scouting_channel_id;
  }
  if (raw.valorant_live_scouting_alert_on_game_start != null) {
    result.alertOnGameStart = raw.valorant_live_scouting_alert_on_game_start;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function extractRankRoleSyncConfig(
  raw: DirectusGuildConfigRaw,
): ValorantFeaturesConfig["rankRoleSync"] | undefined {
  const result: NonNullable<ValorantFeaturesConfig["rankRoleSync"]> = {};
  if (raw.valorant_rank_role_sync_enabled != null) {
    result.enabled = raw.valorant_rank_role_sync_enabled;
  }
  if (raw.valorant_rank_role_mappings != null) {
    result.roleMappings = raw.valorant_rank_role_mappings;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function extractTiltProtectionConfig(
  raw: DirectusGuildConfigRaw,
): ValorantFeaturesConfig["tiltProtection"] | undefined {
  const result: NonNullable<ValorantFeaturesConfig["tiltProtection"]> = {};
  if (raw.valorant_tilt_enabled != null) {
    result.enabled = raw.valorant_tilt_enabled;
  }
  if (raw.valorant_tilt_consecutive_losses_threshold != null) {
    result.consecutiveLossesThreshold =
      raw.valorant_tilt_consecutive_losses_threshold;
  }
  if (raw.valorant_tilt_night_owl_hour_start != null) {
    result.nightOwlHourStart = raw.valorant_tilt_night_owl_hour_start;
  }
  if (raw.valorant_tilt_night_owl_hour_end != null) {
    result.nightOwlHourEnd = raw.valorant_tilt_night_owl_hour_end;
  }
  if (raw.valorant_tilt_dm_alert != null) {
    result.dmAlert = raw.valorant_tilt_dm_alert;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Reconstructs a nested `ValorantFeaturesConfig` from flattened `valorant_*` Directus columns.
 */
export function extractValorantFeaturesFromRaw(
  raw: DirectusGuildConfigRaw,
): ValorantFeaturesConfig | undefined {
  const features: ValorantFeaturesConfig = {};
  const compare = extractCompareConfig(raw);
  if (compare) {
    features.compare = compare;
  }
  const statsSummary = extractStatsSummaryConfig(raw);
  if (statsSummary) {
    features.statsSummary = statsSummary;
  }
  const autoRecap = extractAutoRecapConfig(raw);
  if (autoRecap) {
    features.autoRecap = autoRecap;
  }
  const liveScouting = extractLiveScoutingConfig(raw);
  if (liveScouting) {
    features.liveScouting = liveScouting;
  }
  const rankRoleSync = extractRankRoleSyncConfig(raw);
  if (rankRoleSync) {
    features.rankRoleSync = rankRoleSync;
  }
  const tiltProtection = extractTiltProtectionConfig(raw);
  if (tiltProtection) {
    features.tiltProtection = tiltProtection;
  }
  return Object.keys(features).length > 0 ? features : undefined;
}

function assignDefined<K extends keyof DirectusGuildConfigRaw>(
  target: Partial<DirectusGuildConfigRaw>,
  key: K,
  value: DirectusGuildConfigRaw[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

/**
 * Decomposes a nested `ValorantFeaturesConfig` into flattened `valorant_*` Directus columns.
 */
export function flattenValorantFeaturesToRaw(
  features?: ValorantFeaturesConfig,
): Partial<DirectusGuildConfigRaw> {
  if (!features) {
    return {};
  }
  const payload: Partial<DirectusGuildConfigRaw> = {};
  assignDefined(payload, "valorant_compare_enabled", features.compare?.enabled);
  assignDefined(
    payload,
    "valorant_stats_enabled",
    features.statsSummary?.enabled,
  );
  assignDefined(
    payload,
    "valorant_stats_default_period",
    features.statsSummary?.defaultPeriod,
  );
  assignDefined(
    payload,
    "valorant_auto_recap_enabled",
    features.autoRecap?.enabled,
  );
  assignDefined(
    payload,
    "valorant_auto_recap_channel_id",
    features.autoRecap?.channelId,
  );
  assignDefined(
    payload,
    "valorant_auto_recap_min_tier_alert",
    features.autoRecap?.minTierAlert,
  );
  assignDefined(
    payload,
    "valorant_auto_recap_sportscaster_banter",
    features.autoRecap?.sportscasterBanter,
  );
  assignDefined(
    payload,
    "valorant_live_scouting_enabled",
    features.liveScouting?.enabled,
  );
  assignDefined(
    payload,
    "valorant_live_scouting_channel_id",
    features.liveScouting?.channelId,
  );
  assignDefined(
    payload,
    "valorant_live_scouting_alert_on_game_start",
    features.liveScouting?.alertOnGameStart,
  );
  assignDefined(
    payload,
    "valorant_rank_role_sync_enabled",
    features.rankRoleSync?.enabled,
  );
  assignDefined(
    payload,
    "valorant_rank_role_mappings",
    features.rankRoleSync?.roleMappings,
  );
  assignDefined(
    payload,
    "valorant_tilt_enabled",
    features.tiltProtection?.enabled,
  );
  assignDefined(
    payload,
    "valorant_tilt_consecutive_losses_threshold",
    features.tiltProtection?.consecutiveLossesThreshold,
  );
  assignDefined(
    payload,
    "valorant_tilt_night_owl_hour_start",
    features.tiltProtection?.nightOwlHourStart,
  );
  assignDefined(
    payload,
    "valorant_tilt_night_owl_hour_end",
    features.tiltProtection?.nightOwlHourEnd,
  );
  assignDefined(
    payload,
    "valorant_tilt_dm_alert",
    features.tiltProtection?.dmAlert,
  );
  return payload;
}

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
