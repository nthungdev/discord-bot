import type { UserProfile } from "../models/user-profile";

export interface IUserProfileRepository {
  isOptedOut(userId: string, guildId?: string): Promise<boolean>;
  setOptOut(userId: string, optOut: boolean, guildId?: string): Promise<void>;
  getProfile(userId: string): Promise<UserProfile | null>;
  clearOptOuts(guildId?: string): Promise<void>;
}
