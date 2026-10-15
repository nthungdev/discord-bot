export interface UserProfile {
  userId: string;
  optOutRoast: boolean;
  optedOutGuildIds?: string[];
  reputationScore: number;
  riotId?: string;
  riotRegion?: string;
  riotPuuid?: string;
  lastKnownMatchId?: string;
}
