import type {
  HenrikAccountData,
  HenrikMatch,
  HenrikMmrData,
  HenrikPlayer,
  ValorantComparisonData,
  ValorantHealthData,
  ValorantPersonalSummary,
} from "./types";

/**
 * Rounds a number to 2 decimal places.
 */
export function roundTo2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

interface RawCombatAccumulator {
  wins: number;
  losses: number;
  totalKills: number;
  totalDeaths: number;
  totalAssists: number;
  totalHeadshots: number;
  totalBodyshots: number;
  totalLegshots: number;
  totalScore: number;
  totalDamage: number;
  totalRounds: number;
  firstBloods: number;
  firstDeaths: number;
  netRrDelta: number | null;
}

interface AgentStats {
  matches: number;
  wins: number;
  kills: number;
  deaths: number;
}

interface MapStats {
  matches: number;
  wins: number;
}

function processSingleMatch(
  puuid: string,
  match: HenrikMatch,
  acc: RawCombatAccumulator,
  agentMap: Map<string, AgentStats>,
  mapStatsMap: Map<string, MapStats>,
): void {
  const player = match.players.all_players.find((p) => p.puuid === puuid);
  if (!player) return;

  const team = player.team.toLowerCase() as "red" | "blue";
  const hasWon = match.teams[team]?.has_won ?? false;

  if (hasWon) {
    acc.wins++;
  } else {
    acc.losses++;
  }

  acc.totalRounds += match.metadata.rounds_played || 1;
  acc.totalKills += player.stats.kills;
  acc.totalDeaths += player.stats.deaths;
  acc.totalAssists += player.stats.assists;
  acc.totalHeadshots += player.stats.headshots;
  acc.totalBodyshots += player.stats.bodyshots;
  acc.totalLegshots += player.stats.legshots;
  acc.totalScore += player.stats.score;
  acc.totalDamage += player.damage_made;

  recordAgentUsage(player, hasWon, agentMap);
  recordMapUsage(match.metadata.map, hasWon, mapStatsMap);
  recordFirstBloods(puuid, match, acc);
}

function recordAgentUsage(
  player: HenrikPlayer,
  hasWon: boolean,
  agentMap: Map<string, AgentStats>,
): void {
  const agentName = player.character || "Unknown";
  const existing = agentMap.get(agentName) ?? {
    matches: 0,
    wins: 0,
    kills: 0,
    deaths: 0,
  };
  existing.matches++;
  if (hasWon) existing.wins++;
  existing.kills += player.stats.kills;
  existing.deaths += player.stats.deaths;
  agentMap.set(agentName, existing);
}

function recordMapUsage(
  mapName: string | undefined,
  hasWon: boolean,
  mapStatsMap: Map<string, MapStats>,
): void {
  const key = mapName || "Unknown";
  const existing = mapStatsMap.get(key) ?? { matches: 0, wins: 0 };
  existing.matches++;
  if (hasWon) existing.wins++;
  mapStatsMap.set(key, existing);
}

function recordFirstBloods(
  puuid: string,
  match: HenrikMatch,
  acc: RawCombatAccumulator,
): void {
  for (const round of match.rounds ?? []) {
    const events =
      round.kill_events ??
      round.player_stats.flatMap((ps) => ps.kill_events ?? []);
    if (events.length > 0) {
      const sorted = [...events].sort(
        (a, b) =>
          (a.kill_time_in_round ?? a.kill_time_in_match ?? 0) -
          (b.kill_time_in_round ?? b.kill_time_in_match ?? 0),
      );
      const openingKill = sorted[0];
      if (openingKill.killer_puuid === puuid) {
        acc.firstBloods++;
      }
      if (openingKill.victim_puuid === puuid) {
        acc.firstDeaths++;
      }
    }
  }
}

function extractTopAgents(
  agentMap: Map<string, AgentStats>,
): ValorantPersonalSummary["topAgents"] {
  return Array.from(agentMap.entries())
    .map(([agentName, data]) => ({
      agentName,
      matches: data.matches,
      winRate: Math.round((data.wins / data.matches) * 100),
      kd: roundTo2(data.kills / Math.max(1, data.deaths)),
    }))
    .sort((a, b) => b.matches - a.matches)
    .slice(0, 3);
}

function extractMapStats(
  mapStatsMap: Map<string, MapStats>,
): ValorantPersonalSummary["mapStats"] {
  const mapList = Array.from(mapStatsMap.entries())
    .map(([name, data]) => ({
      name,
      matches: data.matches,
      winRate: Math.round((data.wins / data.matches) * 100),
    }))
    .sort((a, b) => b.winRate - a.winRate);

  const bestMap =
    mapList.length > 0
      ? mapList[0]
      : { name: "Ascent", winRate: 50, matches: 0 };
  const worstMap = mapList.length > 1 ? mapList[mapList.length - 1] : bestMap;

  return { bestMap, worstMap };
}

/**
 * Aggregates match history and MMR into a comprehensive personal stats summary.
 */
export function aggregatePersonalSummary(
  puuid: string,
  account: HenrikAccountData,
  mmr: HenrikMmrData,
  matches: HenrikMatch[],
  period: "recent_20" | "current_act" | "all_time" = "recent_20",
  realNetRrDelta: number | null = null,
): ValorantPersonalSummary {
  const acc: RawCombatAccumulator = {
    wins: 0,
    losses: 0,
    totalKills: 0,
    totalDeaths: 0,
    totalAssists: 0,
    totalHeadshots: 0,
    totalBodyshots: 0,
    totalLegshots: 0,
    totalScore: 0,
    totalDamage: 0,
    totalRounds: 0,
    firstBloods: 0,
    firstDeaths: 0,
    netRrDelta: realNetRrDelta,
  };

  const agentMap = new Map<string, AgentStats>();
  const mapStatsMap = new Map<string, MapStats>();

  for (const match of matches) {
    processSingleMatch(puuid, match, acc, agentMap, mapStatsMap);
    recordFirstBloods(puuid, match, acc);
  }

  const evaluated = matches.length;
  const totalShots =
    acc.totalHeadshots + acc.totalBodyshots + acc.totalLegshots;

  const headshotPct =
    totalShots > 0 ? Math.round((acc.totalHeadshots / totalShots) * 100) : 0;
  const bodyPct =
    totalShots > 0 ? Math.round((acc.totalBodyshots / totalShots) * 100) : 0;
  const legPct =
    totalShots > 0 ? Math.round((acc.totalLegshots / totalShots) * 100) : 0;

  const kdRatio = roundTo2(acc.totalKills / Math.max(1, acc.totalDeaths));
  const avgCombatScore =
    acc.totalRounds > 0 ? Math.round(acc.totalScore / acc.totalRounds) : 0;
  const avgDamagePerRound =
    acc.totalRounds > 0 ? Math.round(acc.totalDamage / acc.totalRounds) : 0;
  const winRatePct =
    evaluated > 0 ? Math.round((acc.wins / evaluated) * 100) : 0;

  const firstBloodsPerMatch =
    evaluated > 0 ? roundTo2(acc.firstBloods / evaluated) : 0;
  const firstDeathsPerMatch =
    evaluated > 0 ? roundTo2(acc.firstDeaths / evaluated) : 0;

  const topAgents = extractTopAgents(agentMap);
  const mapStats = extractMapStats(mapStatsMap);

  return {
    puuid,
    gameName: account.name,
    tagLine: account.tag,
    currentRank: mmr.current_data?.currenttierpatched ?? "Unrated",
    currentTier: mmr.current_data?.currenttier ?? 0,
    currentRR: mmr.current_data?.ranking_in_tier ?? 0,
    peakRank:
      mmr.highest_rank?.patched_tier ??
      mmr.current_data?.currenttierpatched ??
      "Unrated",
    peakTier: mmr.highest_rank?.tier ?? mmr.current_data?.currenttier ?? 0,
    period,
    matchesEvaluated: evaluated,
    wins: acc.wins,
    losses: acc.losses,
    winRatePct,
    netRrDelta: realNetRrDelta,
    kdRatio,
    totalKills: acc.totalKills,
    totalDeaths: acc.totalDeaths,
    totalAssists: acc.totalAssists,
    headshotPct,
    bodyPct,
    legPct,
    avgCombatScore,
    avgDamagePerRound,
    firstBloodsPerMatch,
    firstDeathsPerMatch,
    clutchStats: {
      v1: { won: 0, total: 0, winRate: 0 },
      v2: { won: 0, total: 0, winRate: 0 },
      v3Plus: { won: 0, total: 0, winRate: 0 },
    },
    topAgents,
    mapStats,
  };
}

/**
 * Calculates head-to-head delta differentials between two players.
 */
export function calculateComparisonDeltas(
  player1: ValorantPersonalSummary,
  player2: ValorantPersonalSummary,
): ValorantComparisonData["deltas"] {
  return {
    kdDelta: roundTo2(player1.kdRatio - player2.kdRatio),
    hsDelta: player1.headshotPct - player2.headshotPct,
    acsDelta: player1.avgCombatScore - player2.avgCombatScore,
    adrDelta: player1.avgDamagePerRound - player2.avgDamagePerRound,
    winRateDelta: player1.winRatePct - player2.winRatePct,
  };
}

function determineTiltAlert(fatigueRiskScore: number): {
  tiltAlertLevel: ValorantHealthData["tiltAlertLevel"];
  recommendation: string;
} {
  if (fatigueRiskScore >= 75) {
    return {
      tiltAlertLevel: "CRITICAL",
      recommendation:
        "🚨 High tilt hazard! On a severe loss streak or playing very late. Step away, hydrate, and save your RR!",
    };
  }
  if (fatigueRiskScore >= 50) {
    return {
      tiltAlertLevel: "HIGH",
      recommendation:
        "⚠️ Fatigue detected. Aim and reaction speed decline rapidly after consecutive losses. Take a 15-minute breather.",
    };
  }
  if (fatigueRiskScore >= 30) {
    return {
      tiltAlertLevel: "MODERATE",
      recommendation:
        "Moderate session duration. Do some quick hand stretches and drink water before queuing the next match.",
    };
  }
  return {
    tiltAlertLevel: "NORMAL",
    recommendation: "You're in great shape! Keep grinding with focus.",
  };
}

const REGION_UTC_OFFSETS: Record<string, number> = {
  ap: 8,
  kr: 9,
  eu: 1,
  na: -5,
  latam: -4,
  br: -3,
};

function resolvePlayerLocalHour(
  matches: HenrikMatch[],
  region: string,
  providedHour?: number,
): number | undefined {
  if (providedHour !== undefined) {
    return providedHour;
  }
  const gameStart = matches[0]?.metadata?.game_start;
  if (!gameStart) {
    return undefined;
  }
  const ms = gameStart < 1e11 ? gameStart * 1000 : gameStart;
  const offset = REGION_UTC_OFFSETS[region.toLowerCase()] ?? 0;
  const utcHour = new Date(ms).getUTCHours();
  return (utcHour + offset + 24) % 24;
}

function analyzeMatchHistorySession(
  matches: HenrikMatch[],
  playerPuuid: string,
): { consecutiveLosses: number; sessionMatchCount: number } {
  let consecutiveLosses = 0;
  let hasLossStreakEnded = false;
  const sixHoursAgo = Date.now() - 6 * 3_600_000;
  let sessionMatchCount = 0;

  for (const match of matches) {
    const player = match.players.all_players.find(
      (p) => p.puuid === playerPuuid,
    );
    if (!player) continue;

    const team = player.team.toLowerCase() as "red" | "blue";
    const teamWon = match.teams[team]?.has_won ?? false;

    if (!hasLossStreakEnded) {
      if (!teamWon) {
        consecutiveLosses++;
      } else {
        hasLossStreakEnded = true;
      }
    }

    if (match.metadata.game_start >= sixHoursAgo) {
      sessionMatchCount++;
    }
  }

  return { consecutiveLosses, sessionMatchCount };
}

/**
 * Evaluates session fatigue, loss streaks, and tilt risk factors.
 */
export function calculateFatigueRisk(
  userId: string,
  riotId: string,
  matches: HenrikMatch[],
  playerPuuid: string,
  currentHour?: number,
  region = "ap",
): ValorantHealthData {
  const { consecutiveLosses, sessionMatchCount } = analyzeMatchHistorySession(
    matches,
    playerPuuid,
  );

  const effectiveHour = resolvePlayerLocalHour(matches, region, currentHour);
  const sessionDurationHours = roundTo2((sessionMatchCount * 35) / 60);
  const isNightOwl =
    effectiveHour !== undefined && effectiveHour >= 1 && effectiveHour <= 5;

  let fatigueRiskScore = 15;
  fatigueRiskScore += consecutiveLosses * 20;
  fatigueRiskScore += Math.min(30, sessionMatchCount * 6);
  if (isNightOwl) fatigueRiskScore += 25;
  fatigueRiskScore = Math.min(100, Math.max(0, fatigueRiskScore));

  const { tiltAlertLevel, recommendation } =
    determineTiltAlert(fatigueRiskScore);
  const aimDeclinePct = Math.min(
    25,
    Math.round(consecutiveLosses * 4.5 + sessionMatchCount * 1.5),
  );

  return {
    userId,
    riotId,
    consecutiveLosses,
    sessionMatchCount,
    sessionDurationHours,
    isNightOwl,
    fatigueRiskScore,
    aimDeclinePct,
    tiltAlertLevel,
    recommendation,
  };
}
