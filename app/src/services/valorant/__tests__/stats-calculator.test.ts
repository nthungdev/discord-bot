import { describe, expect, it } from "vitest";
import {
  aggregatePersonalSummary,
  calculateComparisonDeltas,
  calculateFatigueRisk,
} from "../stats-calculator";
import type { HenrikAccountData, HenrikMatch, HenrikMmrData } from "../types";

describe("stats-calculator", () => {
  const mockAccount: HenrikAccountData = {
    puuid: "puuid-123",
    region: "ap",
    account_level: 120,
    name: "TenZ",
    tag: "NA1",
  };

  const mockMmr: HenrikMmrData = {
    current_data: {
      currenttier: 25,
      currenttierpatched: "Radiant",
      ranking_in_tier: 450,
      mmr_change_to_last_game: 22,
      elo: 2450,
    },
    highest_rank: {
      tier: 25,
      patched_tier: "Radiant",
    },
  };

  it("should calculate aim and combat metrics accurately", () => {
    const mockMatches: HenrikMatch[] = [
      {
        metadata: {
          matchid: "m1",
          map: "Ascent",
          game_length: 2000,
          game_start: Date.now() - 3600000,
          rounds_played: 20,
          mode: "Competitive",
          queue: "Standard",
          season_id: "e9a2",
        },
        players: {
          all_players: [
            {
              puuid: "puuid-123",
              name: "TenZ",
              tag: "NA1",
              team: "Blue",
              level: 120,
              character: "Jett",
              currenttier: 25,
              currenttier_patched: "Radiant",
              stats: {
                score: 6000,
                kills: 25,
                deaths: 10,
                assists: 5,
                headshots: 30,
                bodyshots: 60,
                legshots: 10,
              },
              damage_made: 4000,
              damage_received: 2000,
            },
          ],
        },
        teams: {
          blue: { has_won: true, rounds_won: 13, rounds_lost: 7 },
          red: { has_won: false, rounds_won: 7, rounds_lost: 13 },
        },
        rounds: [],
      },
    ];

    const summary = aggregatePersonalSummary(
      "puuid-123",
      mockAccount,
      mockMmr,
      mockMatches,
    );

    expect(summary.totalKills).toBe(25);
    expect(summary.totalDeaths).toBe(10);
    expect(summary.kdRatio).toBe(2.5); // 25 / 10
    expect(summary.headshotPct).toBe(30); // 30 / 100 shots = 30%
    expect(summary.bodyPct).toBe(60);
    expect(summary.legPct).toBe(10);
    expect(summary.avgCombatScore).toBe(300); // 6000 / 20
    expect(summary.avgDamagePerRound).toBe(200); // 4000 / 20
    expect(summary.winRatePct).toBe(100);
    expect(summary.topAgents[0].agentName).toBe("Jett");
    expect(summary.mapStats.bestMap.name).toBe("Ascent");
  });

  it("should gracefully handle zero matches or zero shots without division by zero", () => {
    const summary = aggregatePersonalSummary(
      "puuid-123",
      mockAccount,
      mockMmr,
      [],
    );

    expect(summary.matchesEvaluated).toBe(0);
    expect(summary.kdRatio).toBe(0);
    expect(summary.headshotPct).toBe(0);
    expect(summary.avgCombatScore).toBe(0);
    expect(summary.winRatePct).toBe(0);
  });

  it("should calculate comparison deltas properly", () => {
    const p1 = aggregatePersonalSummary("p1", mockAccount, mockMmr, []);
    p1.kdRatio = 1.45;
    p1.headshotPct = 28;
    p1.avgCombatScore = 240;
    p1.avgDamagePerRound = 155;
    p1.winRatePct = 58;

    const p2 = aggregatePersonalSummary("p2", mockAccount, mockMmr, []);
    p2.kdRatio = 1.15;
    p2.headshotPct = 22;
    p2.avgCombatScore = 210;
    p2.avgDamagePerRound = 140;
    p2.winRatePct = 50;

    const deltas = calculateComparisonDeltas(p1, p2);

    expect(deltas.kdDelta).toBe(0.3);
    expect(deltas.hsDelta).toBe(6);
    expect(deltas.acsDelta).toBe(30);
    expect(deltas.adrDelta).toBe(15);
    expect(deltas.winRateDelta).toBe(8);
  });

  it("should detect loss streaks and night owl fatigue in calculateFatigueRisk", () => {
    const lossMatches: HenrikMatch[] = Array.from({ length: 4 }).map(
      (_, i) => ({
        metadata: {
          matchid: `loss-${i}`,
          map: "Ascent",
          game_length: 2000,
          game_start: Date.now() - (i + 1) * 1800000,
          rounds_played: 20,
          mode: "Competitive",
          queue: "Standard",
          season_id: "e9a2",
        },
        players: {
          all_players: [
            {
              puuid: "puuid-123",
              name: "Player",
              tag: "0001",
              team: "Blue",
              level: 50,
              character: "Jett",
              currenttier: 15,
              currenttier_patched: "Gold 3",
              stats: {
                score: 1000,
                kills: 10,
                deaths: 18,
                assists: 2,
                headshots: 5,
                bodyshots: 15,
                legshots: 2,
              },
              damage_made: 1200,
              damage_received: 2200,
            },
          ],
        },
        teams: {
          blue: { has_won: false, rounds_won: 5, rounds_lost: 13 },
          red: { has_won: true, rounds_won: 13, rounds_lost: 5 },
        },
        rounds: [],
      }),
    );

    const health = calculateFatigueRisk(
      "user-1",
      "Player#0001",
      lossMatches,
      "puuid-123",
      2, // 2 AM (night owl)
    );

    expect(health.consecutiveLosses).toBe(4);
    expect(health.isNightOwl).toBe(true);
    expect(health.tiltAlertLevel).toBe("CRITICAL");
    expect(health.fatigueRiskScore).toBeGreaterThanOrEqual(75);
  });
});
