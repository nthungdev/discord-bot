export interface UserProfile {
  userId: string;
  optOutRoast: boolean;
  optedOutGuildIds?: string[];
  reputationScore: number;
}
