/**
 * Valorant Domain & HenrikDev API Type Definitions
 */

export interface ValorantPersonalSummary {
  puuid: string;
  gameName: string;
  tagLine: string;
  currentRank: string;
  currentTier: number;
  currentRR: number;
  peakRank: string;
  peakTier: number;
  period: "recent_20" | "current_act" | "all_time";
  matchesEvaluated: number;
  wins: number;
  losses: number;
  winRatePct: number;
  netRrDelta?: number | null;
  kdRatio: number;
  totalKills: number;
  totalDeaths: number;
  totalAssists: number;
  headshotPct: number;
  bodyPct: number;
  legPct: number;
  avgCombatScore: number;
  avgDamagePerRound: number;
  firstBloodsPerMatch: number;
  firstDeathsPerMatch: number;
  clutchStats: {
    v1: { won: number; total: number; attempts?: number; winRate: number };
    v2: { won: number; total: number; attempts?: number; winRate: number };
    v3Plus: { won: number; total: number; attempts?: number; winRate: number };
  };
  topAgents: {
    agentName: string;
    matches: number;
    winRate: number;
    kd: number;
  }[];
  mapStats: {
    bestMap: { name: string; winRate: number; matches: number };
    worstMap: { name: string; winRate: number; matches: number };
  };
  aiCoachVerdict?: {
    strength: string;
    weakness: string;
    actionableTip: string;
  };
}

export interface ValorantComparisonData {
  player1: ValorantPersonalSummary;
  player2: ValorantPersonalSummary;
  deltas: {
    kdDelta: number;
    hsDelta: number;
    acsDelta: number;
    adrDelta: number;
    winRateDelta: number;
  };
  aiVerdict?: {
    verdict: string;
    winnerUserId: string;
  };
}

export interface ValorantLivePlayer {
  name: string;
  tag: string;
  rank: string;
  tier: number;
  agent: string;
  accountLevel: number;
  isSmurfSuspect: boolean;
}

export interface ValorantLiveMatchData {
  matchId: string;
  mapName: string;
  gameMode: string;
  teamBlue: ValorantLivePlayer[];
  teamRed: ValorantLivePlayer[];
  avgBlueTier: number;
  avgRedTier: number;
}

export interface ValorantHealthData {
  userId: string;
  riotId: string;
  consecutiveLosses: number;
  sessionMatchCount: number;
  sessionDurationHours: number;
  isNightOwl: boolean;
  fatigueRiskScore: number;
  aimDeclinePct: number;
  tiltAlertLevel: "NORMAL" | "MODERATE" | "HIGH" | "CRITICAL";
  recommendation: string;
}

// ============================================================================
// HenrikDev API Raw Interfaces
// ============================================================================

export interface HenrikAccountData {
  puuid: string;
  region: string;
  account_level: number;
  name: string;
  tag: string;
  card?: {
    small: string;
    large: string;
    wide: string;
  };
}

export interface HenrikMmrData {
  name?: string;
  tag?: string;
  current_data: {
    currenttier: number;
    currenttierpatched: string;
    ranking_in_tier: number;
    mmr_change_to_last_game: number;
    elo: number;
    games_needed_for_rating?: number;
  };
  highest_rank?: {
    tier: number;
    patched_tier: string;
    season?: string;
  };
}

export interface HenrikPlayerStats {
  score: number;
  kills: number;
  deaths: number;
  assists: number;
  bodyshots: number;
  headshots: number;
  legshots: number;
}

export interface HenrikMmrHistoryItem {
  match_id?: string;
  currenttier: number;
  currenttierpatched: string;
  ranking_in_tier: number;
  mmr_change_to_last_game: number;
  elo: number;
  date: string;
  date_raw: number;
}

export interface HenrikPlayer {
  puuid: string;
  name: string;
  tag: string;
  team: "Red" | "Blue";
  level: number;
  character: string;
  currenttier: number;
  currenttier_patched: string;
  stats: HenrikPlayerStats;
  damage_made: number;
  damage_received: number;
}

export interface HenrikTeam {
  has_won: boolean;
  rounds_won: number;
  rounds_lost: number;
}

export interface HenrikKillEvent {
  kill_time_in_round?: number;
  kill_time_in_match?: number;
  killer_puuid: string;
  victim_puuid: string;
}

export interface HenrikRoundPlayerStats {
  player_puuid: string;
  kills: number;
  damage: number;
  headshots?: number;
  bodyshots?: number;
  legshots?: number;
  kill_events?: HenrikKillEvent[];
}

export interface HenrikRound {
  winning_team: "Red" | "Blue" | string;
  end_type: string;
  player_stats: HenrikRoundPlayerStats[];
  kill_events?: HenrikKillEvent[];
}

export interface HenrikMatch {
  metadata: {
    matchid: string;
    map: string;
    game_length: number;
    game_start: number;
    rounds_played: number;
    mode: string;
    queue: string;
    season_id: string;
  };
  players: {
    all_players: HenrikPlayer[];
  };
  teams: {
    red: HenrikTeam;
    blue: HenrikTeam;
  };
  rounds: HenrikRound[];
}

export interface HenrikLiveMatchData {
  match_id: string;
  map_name: string;
  game_mode: string;
  players: Array<{
    name: string;
    tag: string;
    team: "Red" | "Blue";
    agent: string;
    level: number;
    tier: number;
    rank: string;
  }>;
}
