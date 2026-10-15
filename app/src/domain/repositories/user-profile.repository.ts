import type { UserProfile } from "../models/user-profile";

export interface IUserProfileRepository {
  isOptedOut(userId: string, guildId?: string): Promise<boolean>;
  setOptOut(userId: string, optOut: boolean, guildId?: string): Promise<void>;
  getProfile(userId: string): Promise<UserProfile | null>;
  clearOptOuts(guildId?: string): Promise<void>;
  linkRiotAccount(
    userId: string,
    riotId: string,
    region: string,
    puuid: string,
  ): Promise<void>;
  unlinkRiotAccount(userId: string): Promise<void>;
  getRiotProfile(userId: string): Promise<{
    riotId: string;
    region: string;
    puuid: string;
    lastKnownMatchId?: string;
  } | null>;
  setLastKnownMatchId(userId: string, matchId: string): Promise<void>;
}
