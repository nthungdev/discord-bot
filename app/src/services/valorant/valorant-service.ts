import type { IUserProfileRepository } from "../../domain/repositories/user-profile.repository";
import { userProfileRepository } from "../../infrastructure/repositories";
import { getValorantAiCoach, type ValorantAiCoach } from "./ai-coach";
import { RiotClientAdapter } from "./riot-client-adapter";
import {
  aggregatePersonalSummary,
  calculateComparisonDeltas,
  calculateFatigueRisk,
} from "./stats-calculator";
import type {
  HenrikAccountData,
  ValorantComparisonData,
  ValorantHealthData,
  ValorantLiveMatchData,
  ValorantLivePlayer,
  ValorantPersonalSummary,
} from "./types";

/**
 * Custom error thrown when a user has not linked their Riot account yet.
 */
export class UserNotLinkedError extends Error {
  constructor(userId: string) {
    super(
      `User <@${userId}> has not linked their Riot account yet. Run \`/val link\` to link.`,
    );
    this.name = "UserNotLinkedError";
  }
}

/**
 * Custom error thrown when the Riot ID format is invalid.
 */
export class InvalidRiotIdFormatError extends Error {
  constructor(input: string) {
    super(
      `Invalid Riot ID '${input}'. Please use the format 'GameName#TagLine' (e.g., 'TenZ#NA1').`,
    );
    this.name = "InvalidRiotIdFormatError";
  }
}

/**
 * Parses a raw Riot ID string into GameName and TagLine components.
 */
export function parseRiotId(input: string): { name: string; tag: string } {
  const parts = input.trim().split("#");
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
    throw new InvalidRiotIdFormatError(input);
  }
  return {
    name: parts[0].trim(),
    tag: parts[1].trim(),
  };
}

/**
 * Core Valorant Domain Service
 */
export class ValorantService {
  private riotAdapter: RiotClientAdapter;
  private aiCoach: ValorantAiCoach;
  private userRepo: IUserProfileRepository;

  constructor(
    riotAdapter?: RiotClientAdapter,
    aiCoach?: ValorantAiCoach,
    userRepo?: IUserProfileRepository,
  ) {
    this.riotAdapter = riotAdapter ?? new RiotClientAdapter();
    this.aiCoach = aiCoach ?? getValorantAiCoach();
    this.userRepo = userRepo ?? userProfileRepository;
  }

  /**
   * Links a Discord user to a verified Riot account.
   */
  async linkAccount(
    userId: string,
    riotIdInput: string,
    region: string,
  ): Promise<{ account: HenrikAccountData; region: string }> {
    const { name, tag } = parseRiotId(riotIdInput);
    const account = await this.riotAdapter.getAccount(name, tag);

    await this.userRepo.linkRiotAccount(
      userId,
      `${account.name}#${account.tag}`,
      region,
      account.puuid,
    );

    return { account, region };
  }

  /**
   * Unlinks a user's Riot account.
   */
  async unlinkAccount(userId: string): Promise<void> {
    await this.userRepo.unlinkRiotAccount(userId);
  }

  /**
   * Gets linked Riot profile for a Discord user.
   */
  async getLinkedProfile(userId: string): Promise<{
    riotId: string;
    region: string;
    puuid: string;
    lastKnownMatchId?: string;
  } | null> {
    return this.userRepo.getRiotProfile(userId);
  }

  /**
   * Fetches full personal stats summary and AI performance coach analysis.
   */
  async getPersonalSummary(
    userId: string,
    period: "recent_20" | "current_act" | "all_time" = "recent_20",
    mode = "competitive",
  ): Promise<ValorantPersonalSummary> {
    const linked = await this.getLinkedProfile(userId);
    if (!linked) {
      throw new UserNotLinkedError(userId);
    }

    const { name, tag } = parseRiotId(linked.riotId);
    const fetchSize = period === "all_time" ? 50 : 20;
    const [account, mmr, rawMatches, mmrHistory] = await Promise.all([
      this.riotAdapter.getAccount(name, tag),
      this.riotAdapter.getMmr(linked.region, linked.puuid),
      this.riotAdapter.getMatches(linked.region, linked.puuid, fetchSize, mode),
      this.riotAdapter
        .getMmrHistory(linked.region, linked.puuid)
        .catch(() => []),
    ]);

    let filteredMatches = rawMatches;
    if (period === "current_act" && rawMatches.length > 0) {
      const currentSeasonId = rawMatches[0].metadata?.season_id;
      if (currentSeasonId) {
        filteredMatches = rawMatches.filter(
          (m) => m.metadata?.season_id === currentSeasonId,
        );
      }
    } else if (period === "recent_20") {
      filteredMatches = rawMatches.slice(0, 20);
    }

    let realNetRrDelta: number | null = null;
    if (mmrHistory.length > 0) {
      const matchWindowSize = filteredMatches.length;
      const relevantHistory = mmrHistory.slice(0, matchWindowSize);
      realNetRrDelta = relevantHistory.reduce(
        (sum, item) => sum + (item.mmr_change_to_last_game || 0),
        0,
      );
    }

    const summary = aggregatePersonalSummary(
      linked.puuid,
      account,
      mmr,
      filteredMatches,
      period,
      realNetRrDelta,
    );

    summary.aiCoachVerdict =
      await this.aiCoach.generatePersonalCoaching(summary);
    return summary;
  }

  /**
   * Compares two Discord users head-to-head with delta metrics and AI banter.
   */
  async getComparison(
    user1Id: string,
    user2Id: string,
  ): Promise<ValorantComparisonData> {
    const [player1, player2] = await Promise.all([
      this.getPersonalSummary(user1Id),
      this.getPersonalSummary(user2Id),
    ]);

    const deltas = calculateComparisonDeltas(player1, player2);
    const aiVerdict = await this.aiCoach.generateComparisonBanter(
      player1,
      player2,
      deltas,
    );

    return {
      player1,
      player2,
      deltas,
      aiVerdict,
    };
  }

  /**
   * Scouts live match for a player. Returns null if not in an active match.
   */
  async getLiveMatch(userId: string): Promise<ValorantLiveMatchData | null> {
    const linked = await this.getLinkedProfile(userId);
    if (!linked) {
      throw new UserNotLinkedError(userId);
    }

    const liveRaw = await this.riotAdapter.getLiveMatch(
      linked.region,
      linked.puuid,
    );
    if (!liveRaw) {
      return null;
    }

    const teamBlue: ValorantLivePlayer[] = [];
    const teamRed: ValorantLivePlayer[] = [];
    let blueTierSum = 0;
    let redTierSum = 0;

    for (const p of liveRaw.players) {
      const isSmurf = p.level < 30 && p.tier >= 18; // Diamond+ under level 30
      const playerObj: ValorantLivePlayer = {
        name: p.name,
        tag: p.tag,
        rank: p.rank,
        tier: p.tier,
        agent: p.agent,
        accountLevel: p.level,
        isSmurfSuspect: isSmurf,
      };

      if (p.team === "Blue") {
        teamBlue.push(playerObj);
        blueTierSum += p.tier;
      } else {
        teamRed.push(playerObj);
        redTierSum += p.tier;
      }
    }

    return {
      matchId: liveRaw.match_id,
      mapName: liveRaw.map_name,
      gameMode: liveRaw.game_mode,
      teamBlue,
      teamRed,
      avgBlueTier:
        teamBlue.length > 0 ? Math.round(blueTierSum / teamBlue.length) : 0,
      avgRedTier:
        teamRed.length > 0 ? Math.round(redTierSum / teamRed.length) : 0,
    };
  }

  /**
   * Evaluates fatigue, loss streaks, and tilt risk for a linked user.
   */
  async getHealthAnalysis(userId: string): Promise<ValorantHealthData> {
    const linked = await this.getLinkedProfile(userId);
    if (!linked) {
      throw new UserNotLinkedError(userId);
    }

    const matches = await this.riotAdapter.getMatches(
      linked.region,
      linked.puuid,
      15,
    );
    return calculateFatigueRisk(
      userId,
      linked.riotId,
      matches,
      linked.puuid,
      undefined,
      linked.region,
    );
  }
}

let valorantServiceInstance: ValorantService | null = null;

export function getValorantService(): ValorantService {
  if (!valorantServiceInstance) {
    valorantServiceInstance = new ValorantService();
  }
  return valorantServiceInstance;
}
