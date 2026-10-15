import axios, { type AxiosInstance } from "axios";
import type {
  HenrikAccountData,
  HenrikLiveMatchData,
  HenrikMatch,
  HenrikMmrData,
} from "./types";

export const HENRIK_API_BASE_URL = "https://api.henrikdev.xyz";
export const DEFAULT_MATCH_CACHE_TTL_MS = 300_000; // 5 minutes
export const DEFAULT_LIVE_CACHE_TTL_MS = 20_000; // 20 seconds

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * Custom error thrown when a Riot account is not found.
 */
export class RiotAccountNotFoundError extends Error {
  constructor(name: string, tag: string) {
    super(`Riot account '${name}#${tag}' was not found.`);
    this.name = "RiotAccountNotFoundError";
  }
}

/**
 * Custom error thrown when HenrikDev API requests fail.
 */
export class RiotApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "RiotApiError";
    this.status = status;
  }
}

/**
 * HTTP client adapter communicating with HenrikDev Unofficial Valorant API.
 */
export class RiotClientAdapter {
  private httpClient: AxiosInstance;
  private apiKey: string;
  private cache = new Map<string, CacheEntry<unknown>>();

  constructor(apiKey?: string, baseUrl = HENRIK_API_BASE_URL) {
    this.apiKey =
      apiKey ??
      process.env.HENRIK_API_KEY ??
      process.env.VALORANT_API_KEY ??
      "";

    this.httpClient = axios.create({
      baseURL: baseUrl,
      timeout: 10_000,
      headers: this.apiKey ? { Authorization: this.apiKey } : {},
    });
  }

  /**
   * Retrieves or sets value in the in-memory TTL cache.
   */
  private async getOrSetCache<T>(
    key: string,
    ttlMs: number,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const cached = this.cache.get(key) as CacheEntry<T> | undefined;
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const freshData = await fetcher();
    this.cache.set(key, {
      data: freshData,
      expiresAt: Date.now() + ttlMs,
    });
    return freshData;
  }

  /**
   * Clears the in-memory cache.
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Fetches Riot account metadata by GameName and TagLine.
   */
  public async getAccount(
    name: string,
    tag: string,
  ): Promise<HenrikAccountData> {
    const cacheKey = `account:${name.toLowerCase()}:${tag.toLowerCase()}`;
    return this.getOrSetCache(cacheKey, DEFAULT_MATCH_CACHE_TTL_MS, () =>
      this.fetchRemoteAccount(name, tag),
    );
  }

  private async fetchRemoteAccount(
    name: string,
    tag: string,
  ): Promise<HenrikAccountData> {
    if (!this.apiKey) {
      return this.generateMockAccount(name, tag);
    }

    try {
      const encodedName = encodeURIComponent(name);
      const encodedTag = encodeURIComponent(tag);
      const resp = await this.httpClient.get<{
        status: number;
        data: HenrikAccountData;
      }>(`/valorant/v1/account/${encodedName}/${encodedTag}`);

      if (resp.status === 200 && resp.data?.data) {
        return resp.data.data;
      }
      throw new RiotAccountNotFoundError(name, tag);
    } catch (err: unknown) {
      if (!axios.isAxiosError(err)) {
        throw new RiotApiError(`Failed to fetch account for ${name}#${tag}`);
      }
      if (err.response?.status === 404) {
        throw new RiotAccountNotFoundError(name, tag);
      }
      if (err.response?.status === 401 || err.response?.status === 403) {
        return this.generateMockAccount(name, tag);
      }
      throw new RiotApiError(`Failed to fetch account for ${name}#${tag}`);
    }
  }

  /**
   * Fetches MMR and Competitive Rank information for a player.
   */
  public async getMmr(region: string, puuid: string): Promise<HenrikMmrData> {
    const cacheKey = `mmr:${region}:${puuid}`;
    return this.getOrSetCache(cacheKey, DEFAULT_MATCH_CACHE_TTL_MS, () =>
      this.fetchRemoteMmr(region, puuid),
    );
  }

  private async fetchRemoteMmr(
    region: string,
    puuid: string,
  ): Promise<HenrikMmrData> {
    if (!this.apiKey) {
      return this.generateMockMmr();
    }

    try {
      const resp = await this.httpClient.get<{
        status: number;
        data: HenrikMmrData;
      }>(`/valorant/v2/by-puuid/mmr/${region}/${puuid}`);

      if (resp.status === 200 && resp.data?.data) {
        return resp.data.data;
      }
      return this.generateMockMmr();
    } catch (err: unknown) {
      if (
        axios.isAxiosError(err) &&
        (err.response?.status === 401 || err.response?.status === 403)
      ) {
        return this.generateMockMmr();
      }
      throw new RiotApiError(`Failed to fetch MMR for PUUID ${puuid}`);
    }
  }

  /**
   * Fetches match history for a player.
   */
  public async getMatches(
    region: string,
    puuid: string,
    size = 20,
    mode = "competitive",
  ): Promise<HenrikMatch[]> {
    const cacheKey = `matches:${region}:${puuid}:${size}:${mode}`;
    return this.getOrSetCache(cacheKey, DEFAULT_MATCH_CACHE_TTL_MS, () =>
      this.fetchRemoteMatches(region, puuid, size, mode),
    );
  }

  private async fetchRemoteMatches(
    region: string,
    puuid: string,
    size: number,
    mode: string,
  ): Promise<HenrikMatch[]> {
    if (!this.apiKey) {
      return this.generateMockMatches(puuid, size);
    }

    try {
      const resp = await this.httpClient.get<{
        status: number;
        data: HenrikMatch[];
      }>(`/valorant/v3/by-puuid/matches/${region}/${puuid}`, {
        params: { size, mode },
      });

      if (resp.status === 200 && Array.isArray(resp.data?.data)) {
        return resp.data.data;
      }
      return this.generateMockMatches(puuid, size);
    } catch (err: unknown) {
      if (
        axios.isAxiosError(err) &&
        (err.response?.status === 401 || err.response?.status === 403)
      ) {
        return this.generateMockMatches(puuid, size);
      }
      throw new RiotApiError(`Failed to fetch matches for PUUID ${puuid}`);
    }
  }

  /**
   * Fetches real-time match scouting data if the player is currently in-game.
   */
  public async getLiveMatch(
    region: string,
    puuid: string,
  ): Promise<HenrikLiveMatchData | null> {
    const cacheKey = `live:${region}:${puuid}`;
    return this.getOrSetCache(cacheKey, DEFAULT_LIVE_CACHE_TTL_MS, () =>
      this.fetchRemoteLiveMatch(region, puuid),
    );
  }

  private async fetchRemoteLiveMatch(
    region: string,
    puuid: string,
  ): Promise<HenrikLiveMatchData | null> {
    if (!this.apiKey) {
      return this.generateMockLiveMatch();
    }

    try {
      const resp = await this.httpClient.get<{
        status: number;
        data: HenrikLiveMatchData;
      }>(`/valorant/v1/by-puuid/live-match/${region}/${puuid}`);

      if (resp.status === 200 && resp.data?.data) {
        return resp.data.data;
      }
      return null;
    } catch (_err: unknown) {
      return null;
    }
  }

  // ============================================================================
  // Deterministic Mock Generators for Local Dev & Testing
  // ============================================================================

  private generateMockAccount(name: string, tag: string): HenrikAccountData {
    return {
      puuid: `mock-puuid-${name.toLowerCase()}-${tag.toLowerCase()}`,
      region: "ap",
      account_level: 145,
      name,
      tag,
      card: {
        small:
          "https://media.valorant-api.com/playercards/9fb348bc-41a0-91ad-8a3e-818035c4e561/smallart.png",
        large:
          "https://media.valorant-api.com/playercards/9fb348bc-41a0-91ad-8a3e-818035c4e561/largeart.png",
        wide: "https://media.valorant-api.com/playercards/9fb348bc-41a0-91ad-8a3e-818035c4e561/wideart.png",
      },
    };
  }

  private generateMockMmr(): HenrikMmrData {
    return {
      current_data: {
        currenttier: 23,
        currenttierpatched: "Ascendant 3",
        ranking_in_tier: 68,
        mmr_change_to_last_game: 18,
        elo: 1868,
      },
      highest_rank: {
        tier: 24,
        patched_tier: "Immortal 1",
        season: "e9a2",
      },
    };
  }

  private generateMockMatches(puuid: string, count: number): HenrikMatch[] {
    const maps = ["Ascent", "Bind", "Haven", "Split", "Lotus", "Sunset"];
    const agents = ["Jett", "Omen", "Sova", "Killjoy", "Reyna"];
    const matches: HenrikMatch[] = [];

    for (let i = 0; i < count; i++) {
      const isWin = i % 3 !== 0;
      const roundsWon = isWin ? 13 : 9;
      const roundsLost = isWin ? 9 : 13;
      const totalRounds = roundsWon + roundsLost;

      matches.push({
        metadata: {
          matchid: `mock-match-${puuid}-${i + 1}`,
          map: maps[i % maps.length],
          game_length: 2100,
          game_start: Date.now() - (i + 1) * 3_600_000,
          rounds_played: totalRounds,
          mode: "Competitive",
          queue: "Standard",
          season_id: "e9a2",
        },
        players: {
          all_players: [
            {
              puuid,
              name: "Player",
              tag: "0001",
              team: "Blue",
              level: 150,
              character: agents[i % agents.length],
              currenttier: 23,
              currenttier_patched: "Ascendant 3",
              stats: {
                score: 5200,
                kills: isWin ? 22 : 14,
                deaths: isWin ? 12 : 17,
                assists: 5,
                headshots: 18,
                bodyshots: 32,
                legshots: 6,
              },
              damage_made: 3450,
              damage_received: 2400,
            },
          ],
        },
        teams: {
          blue: {
            has_won: isWin,
            rounds_won: roundsWon,
            rounds_lost: roundsLost,
          },
          red: {
            has_won: !isWin,
            rounds_won: roundsLost,
            rounds_lost: roundsWon,
          },
        },
        rounds: [
          {
            winning_team: isWin ? "Blue" : "Red",
            end_type: "Eliminated",
            player_stats: [
              {
                player_puuid: puuid,
                kills: 1,
                damage: 150,
                headshots: 1,
                bodyshots: 2,
              },
            ],
          },
        ],
      });
    }

    return matches;
  }

  private generateMockLiveMatch(): HenrikLiveMatchData {
    return {
      match_id: "mock-live-match-1234",
      map_name: "Ascent",
      game_mode: "Competitive",
      players: [
        {
          name: "Hung",
          tag: "VN1",
          team: "Blue",
          agent: "Jett",
          level: 180,
          tier: 23,
          rank: "Ascendant 3",
        },
        {
          name: "Dung",
          tag: "VN2",
          team: "Blue",
          agent: "Omen",
          level: 120,
          tier: 22,
          rank: "Ascendant 2",
        },
        {
          name: "EnemySmurf",
          tag: "SUS",
          team: "Red",
          agent: "Reyna",
          level: 21,
          tier: 24,
          rank: "Immortal 1",
        },
      ],
    };
  }
}
