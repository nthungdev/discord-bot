import { readItems } from "@directus/sdk";
import {
  DEFAULT_GUILD_CONFIG,
  type GuildConfig,
} from "../../domain/models/guild-config";
import type { IGuildConfigRepository } from "../../domain/repositories/guild-config.repository";
import { directusClient } from "./client";

export class DirectusGuildConfigRepository implements IGuildConfigRepository {
  private cache = new Map<string, { config: GuildConfig; expiresAt: number }>();
  private readonly ttlMs: number;

  constructor(ttlMs = 5 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  async getConfig(guildId: string): Promise<GuildConfig> {
    const cached = this.cache.get(guildId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.config;
    }

    try {
      const items = await directusClient.request(
        readItems("bot_guild_configs", {
          filter: { guild_id: { _eq: guildId } },
          limit: 1,
        }),
      );

      if (!items || items.length === 0) {
        const fallbackConfig: GuildConfig = {
          ...DEFAULT_GUILD_CONFIG,
          guildId,
        };
        this.cache.set(guildId, {
          config: fallbackConfig,
          expiresAt: Date.now() + this.ttlMs,
        });
        return fallbackConfig;
      }

      const raw = items[0];
      const config: GuildConfig = {
        guildId: raw.guild_id,
        guildName: raw.guild_name ?? undefined,
        enableAiRoast: raw.enable_ai_roast ?? true,
        enableBouncergon: raw.enable_bouncergon ?? false,
        defaultLocale: raw.default_locale === "en" ? "en" : "vi",
        maxRoastsPerDay: raw.max_roasts_per_day ?? 10,
        allowedChannelIds: new Set<string>(raw.allowed_channel_ids || []),
        scmsVoiceChannelId: raw.scms_voice_channel_id ?? undefined,
      };

      this.cache.set(guildId, {
        config,
        expiresAt: Date.now() + this.ttlMs,
      });

      return config;
    } catch (error) {
      console.warn(
        `[GuildConfigRepo] Directus fetch failed for guild ${guildId}. Returning fallback.`,
        error,
      );
      return cached?.config ?? { ...DEFAULT_GUILD_CONFIG, guildId };
    }
  }

  invalidate(guildId?: string): void {
    if (guildId) {
      this.cache.delete(guildId);
      console.log(
        `[GuildConfigRepo] Invalidation applied for guild: ${guildId}`,
      );
    } else {
      this.cache.clear();
      console.log("[GuildConfigRepo] All cached guild configurations evicted.");
    }
  }
}
