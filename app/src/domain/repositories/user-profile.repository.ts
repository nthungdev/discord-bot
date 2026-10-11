import type { UserProfile } from "../models/user-profile";

export interface IUserProfileRepository {
  isOptedOut(userId: string): Promise<boolean>;
  setOptOut(userId: string, optOut: boolean): Promise<void>;
  getProfile(userId: string): Promise<UserProfile | null>;
}
