import { createItem, readItems, updateItem } from "@directus/sdk";
import type { UserProfile } from "../../domain/models/user-profile";
import type { IUserProfileRepository } from "../../domain/repositories/user-profile.repository";
import { directusClient } from "./client";

export class DirectusUserProfileRepository implements IUserProfileRepository {
  async isOptedOut(userId: string): Promise<boolean> {
    try {
      const items = await directusClient.request(
        readItems("bot_user_profiles", {
          filter: { user_id: { _eq: userId } },
          fields: ["opt_out_roast"],
          limit: 1,
        }),
      );

      if (!items || items.length === 0) {
        return false;
      }

      return Boolean(items[0].opt_out_roast);
    } catch (error) {
      console.warn(
        `[UserProfileRepo] Directus query failed for user ${userId}. Defaulting to false (not opted out).`,
        error,
      );
      return false;
    }
  }

  async setOptOut(userId: string, optOut: boolean): Promise<void> {
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
            opt_out_roast: optOut,
          }),
        );
      } else {
        await directusClient.request(
          createItem("bot_user_profiles", {
            user_id: userId,
            opt_out_roast: optOut,
            reputation_score: 1000,
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

  async getProfile(userId: string): Promise<UserProfile | null> {
    try {
      const items = await directusClient.request(
        readItems("bot_user_profiles", {
          filter: { user_id: { _eq: userId } },
          limit: 1,
        }),
      );

      if (!items || items.length === 0) {
        return null;
      }

      const raw = items[0];
      return {
        userId: raw.user_id,
        optOutRoast: Boolean(raw.opt_out_roast),
        reputationScore: raw.reputation_score ?? 1000,
      };
    } catch (error) {
      console.warn(
        `[UserProfileRepo] Failed to fetch profile for user ${userId}:`,
        error,
      );
      return null;
    }
  }
}
