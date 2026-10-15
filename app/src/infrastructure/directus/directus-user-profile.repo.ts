import { createItem, readItems, updateItem } from "@directus/sdk";
import type { UserProfile } from "../../domain/models/user-profile";
import type { IUserProfileRepository } from "../../domain/repositories/user-profile.repository";
import { directusClient } from "./client";

async function clearProfileOptOutItem(
  item: import("./types").DirectusUserProfileRaw,
  guildId?: string,
): Promise<void> {
  if (!item.id) return;
  const currentGuilds = new Set<string>(
    Array.isArray(item.opted_out_guild_ids) ? item.opted_out_guild_ids : [],
  );

  if (guildId) {
    if (!currentGuilds.has(guildId)) return;
    currentGuilds.delete(guildId);
    await directusClient.request(
      updateItem("bot_user_profiles", item.id, {
        opted_out_guild_ids: Array.from(currentGuilds),
      }),
    );
    return;
  }

  if (item.opt_out_roast || currentGuilds.size > 0) {
    await directusClient.request(
      updateItem("bot_user_profiles", item.id, {
        opt_out_roast: false,
        opted_out_guild_ids: [],
      }),
    );
  }
}

export class DirectusUserProfileRepository implements IUserProfileRepository {
  async isOptedOut(userId: string, guildId?: string): Promise<boolean> {
    try {
      const items = await directusClient.request(
        readItems("bot_user_profiles", {
          filter: { user_id: { _eq: userId } },
          fields: ["opt_out_roast", "opted_out_guild_ids"],
          limit: 1,
        }),
      );

      if (!items || items.length === 0) {
        return false;
      }

      const raw = items[0];
      if (raw.opt_out_roast) {
        return true;
      }

      if (guildId && Array.isArray(raw.opted_out_guild_ids)) {
        return raw.opted_out_guild_ids.includes(guildId);
      }

      return false;
    } catch (error) {
      console.error(
        `[UserProfileRepo] Directus query failed for user ${userId}. Rethrowing to prevent fail-open privacy bypass.`,
        error,
      );
      throw error;
    }
  }

  async setOptOut(
    userId: string,
    optOut: boolean,
    guildId?: string,
  ): Promise<void> {
    try {
      const items = await directusClient.request(
        readItems("bot_user_profiles", {
          filter: { user_id: { _eq: userId } },
          limit: 1,
        }),
      );

      const existing = items?.[0];
      const profileId = existing?.id;

      let nextOptOutRoast = existing?.opt_out_roast ?? false;
      const currentGuilds = new Set<string>(
        Array.isArray(existing?.opted_out_guild_ids)
          ? existing.opted_out_guild_ids
          : [],
      );

      if (guildId) {
        if (optOut) {
          currentGuilds.add(guildId);
        } else {
          currentGuilds.delete(guildId);
          nextOptOutRoast = false;
        }
      } else {
        nextOptOutRoast = optOut;
        if (!optOut) {
          currentGuilds.clear();
        }
      }

      const payload = {
        opt_out_roast: nextOptOutRoast,
        opted_out_guild_ids: Array.from(currentGuilds),
      };

      if (profileId) {
        await directusClient.request(
          updateItem("bot_user_profiles", profileId, payload),
        );
      } else {
        await directusClient.request(
          createItem("bot_user_profiles", {
            user_id: userId,
            reputation_score: 1000,
            ...payload,
          }),
        );
      }
    } catch (error) {
      console.error(
        `[UserProfileRepo] Failed to set opt-out status for ${userId}:`,
        error,
      );
      throw error;
    }
  }

  async clearOptOuts(guildId?: string): Promise<void> {
    try {
      const items = await directusClient.request(
        readItems("bot_user_profiles", {
          limit: -1,
        }),
      );

      if (!items || items.length === 0) return;

      for (const item of items) {
        await clearProfileOptOutItem(item, guildId);
      }
    } catch (error) {
      console.error("[UserProfileRepo] Failed to clear opt-outs:", error);
      throw error;
    }
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    try {
      const items = await directusClient.request(
        readItems("bot_user_profiles", {
          filter: { user_id: { _eq: userId } },
          limit: 1,
        }),
      );

      if (!items || items.length === 0) {
        return this.inMemoryFallback.get(userId) ?? null;
      }

      const raw = items[0];
      const profile: UserProfile = {
        userId: raw.user_id,
        optOutRoast: Boolean(raw.opt_out_roast),
        optedOutGuildIds: Array.isArray(raw.opted_out_guild_ids)
          ? raw.opted_out_guild_ids
          : [],
        reputationScore: raw.reputation_score ?? 1000,
        riotId: raw.riot_id ?? undefined,
        riotRegion: raw.riot_region ?? undefined,
        riotPuuid: raw.riot_puuid ?? undefined,
        lastKnownMatchId: raw.last_known_match_id ?? undefined,
      };
      this.inMemoryFallback.set(userId, profile);
      return profile;
    } catch (error) {
      console.warn(
        `[UserProfileRepo] Failed to fetch profile for user ${userId}:`,
        error,
      );
      return this.inMemoryFallback.get(userId) ?? null;
    }
  }

  private inMemoryFallback = new Map<string, UserProfile>();

  async linkRiotAccount(
    userId: string,
    riotId: string,
    region: string,
    puuid: string,
  ): Promise<void> {
    const existing = (await this.getProfile(userId)) ?? {
      userId,
      optOutRoast: false,
      reputationScore: 1000,
    };

    const updated: UserProfile = {
      ...existing,
      riotId,
      riotRegion: region,
      riotPuuid: puuid,
    };

    try {
      const items = await directusClient.request(
        readItems("bot_user_profiles", {
          filter: { user_id: { _eq: userId } },
          limit: 1,
        }),
      );

      const profileId = items?.[0]?.id;
      const payload = {
        riot_id: riotId,
        riot_region: region,
        riot_puuid: puuid,
      };

      if (profileId) {
        await directusClient.request(
          updateItem("bot_user_profiles", profileId, payload),
        );
      } else {
        await directusClient.request(
          createItem("bot_user_profiles", {
            user_id: userId,
            reputation_score: 1000,
            opt_out_roast: false,
            ...payload,
          }),
        );
      }
      this.inMemoryFallback.set(userId, updated);
    } catch (error) {
      console.error(
        `[UserProfileRepo] Failed to save Riot link to Directus for ${userId}:`,
        error,
      );
      throw error;
    }
  }

  async unlinkRiotAccount(userId: string): Promise<void> {
    const existing = await this.getProfile(userId);

    try {
      const items = await directusClient.request(
        readItems("bot_user_profiles", {
          filter: { user_id: { _eq: userId } },
          limit: 1,
        }),
      );

      const profileId = items?.[0]?.id;
      if (profileId) {
        await directusClient.request(
          updateItem("bot_user_profiles", profileId, {
            riot_id: null,
            riot_region: null,
            riot_puuid: null,
            last_known_match_id: null,
          }),
        );
      }
      if (existing) {
        existing.riotId = undefined;
        existing.riotRegion = undefined;
        existing.riotPuuid = undefined;
        existing.lastKnownMatchId = undefined;
        this.inMemoryFallback.set(userId, existing);
      }
    } catch (error) {
      console.error(
        `[UserProfileRepo] Failed to unlink Riot account in Directus for ${userId}:`,
        error,
      );
      throw error;
    }
  }

  async getRiotProfile(userId: string): Promise<{
    riotId: string;
    region: string;
    puuid: string;
    lastKnownMatchId?: string;
  } | null> {
    const profile = await this.getProfile(userId);
    if (!(profile?.riotId && profile.riotRegion && profile.riotPuuid)) {
      return null;
    }
    return {
      riotId: profile.riotId,
      region: profile.riotRegion,
      puuid: profile.riotPuuid,
      lastKnownMatchId: profile.lastKnownMatchId,
    };
  }

  async setLastKnownMatchId(userId: string, matchId: string): Promise<void> {
    const profile = await this.getProfile(userId);

    try {
      const items = await directusClient.request(
        readItems("bot_user_profiles", {
          filter: { user_id: { _eq: userId } },
          limit: 1,
        }),
      );

      const profileId = items?.[0]?.id;
      if (profileId) {
        await directusClient.request(
          updateItem("bot_user_profiles", profileId, {
            last_known_match_id: matchId,
          }),
        );
      }
      if (profile) {
        profile.lastKnownMatchId = matchId;
        this.inMemoryFallback.set(userId, profile);
      }
    } catch (error) {
      console.error(
        `[UserProfileRepo] Failed to update lastKnownMatchId for ${userId}:`,
        error,
      );
      throw error;
    }
  }
}
