import { describe, expect, it } from "vitest";
import {
  buildProgressBar,
  formatDelta,
  getRankColor,
  ValorantCardBuilder,
} from "../card-builder";
import type {
  ValorantComparisonData,
  ValorantHealthData,
  ValorantPersonalSummary,
} from "../types";

describe("card-builder", () => {
  it("should generate visual progress bar correctly", () => {
    expect(buildProgressBar(0, 100, 10)).toBe("[░░░░░░░░░░]");
    expect(buildProgressBar(50, 100, 10)).toBe("[█████░░░░░]");
    expect(buildProgressBar(100, 100, 10)).toBe("[██████████]");
    expect(buildProgressBar(150, 100, 10)).toBe("[██████████]"); // clamped to 100%
  });

  it("should map rank tiers to correct colors", () => {
    expect(getRankColor(27)).toBe(0xfffa65); // Radiant
    expect(getRankColor(24)).toBe(0xc0392b); // Immortal
    expect(getRankColor(21)).toBe(0x16a085); // Ascendant
    expect(getRankColor(12)).toBe(0xe6b800); // Gold
    expect(getRankColor(0)).toBe(0x7289da); // Unrated
  });

  it("should format deltas with signs", () => {
    expect(formatDelta(5.2, "%")).toBe("📈 +5.2%");
    expect(formatDelta(-3.1, "%")).toBe("📉 -3.1%");
    expect(formatDelta(0, "%")).toBe("⚖️ 0%");
  });

  it("should construct personal summary embed with all required fields", () => {
    const summary: ValorantPersonalSummary = {
      puuid: "puuid-1",
      gameName: "TenZ",
      tagLine: "NA1",
      currentRank: "Radiant",
      currentTier: 27,
      currentRR: 500,
      peakRank: "Radiant",
      peakTier: 27,
      period: "recent_20",
      matchesEvaluated: 20,
      wins: 14,
      losses: 6,
      winRatePct: 70,
      netRrDelta: 120,
      kdRatio: 1.65,
      totalKills: 450,
      totalDeaths: 272,
      totalAssists: 100,
      headshotPct: 34,
      bodyPct: 56,
      legPct: 10,
      avgCombatScore: 310,
      avgDamagePerRound: 195,
      firstBloodsPerMatch: 3.5,
      firstDeathsPerMatch: 1.2,
      clutchStats: {
        v1: { won: 5, total: 8, winRate: 63 },
        v2: { won: 2, total: 5, winRate: 40 },
        v3Plus: { won: 1, total: 3, winRate: 33 },
      },
      topAgents: [{ agentName: "Jett", matches: 15, winRate: 73, kd: 1.7 }],
      mapStats: {
        bestMap: { name: "Ascent", winRate: 80, matches: 8 },
        worstMap: { name: "Split", winRate: 50, matches: 4 },
      },
      aiCoachVerdict: {
        strength: "Outstanding first-shot accuracy.",
        weakness: "Can overheat on post-plants.",
        actionableTip: "Hold passive crossfires.",
      },
    };

    const embed = ValorantCardBuilder.buildPersonalSummaryEmbed(summary);
    const json = embed.toJSON();

    expect(json.title).toContain("TenZ#NA1");
    expect(json.fields).toHaveLength(4);
    expect(json.fields?.[0].name).toContain("Aim & Combat");
    expect(json.fields?.[3].name).toContain("AI Performance Coach");
  });

  it("should construct comparison embed with deltas and verdict", () => {
    const p1: ValorantPersonalSummary = {
      puuid: "p1",
      gameName: "Player1",
      tagLine: "NA1",
      currentRank: "Immortal 1",
      currentTier: 24,
      currentRR: 50,
      peakRank: "Immortal 1",
      peakTier: 24,
      period: "recent_20",
      matchesEvaluated: 20,
      wins: 10,
      losses: 10,
      winRatePct: 50,
      netRrDelta: 0,
      kdRatio: 1.2,
      totalKills: 300,
      totalDeaths: 250,
      totalAssists: 50,
      headshotPct: 25,
      bodyPct: 65,
      legPct: 10,
      avgCombatScore: 230,
      avgDamagePerRound: 150,
      firstBloodsPerMatch: 2,
      firstDeathsPerMatch: 2,
      clutchStats: {
        v1: { won: 2, total: 4, winRate: 50 },
        v2: { won: 1, total: 3, winRate: 33 },
        v3Plus: { won: 0, total: 1, winRate: 0 },
      },
      topAgents: [],
      mapStats: {
        bestMap: { name: "Ascent", winRate: 60, matches: 5 },
        worstMap: { name: "Bind", winRate: 40, matches: 5 },
      },
    };

    const p2: ValorantPersonalSummary = {
      ...p1,
      puuid: "p2",
      gameName: "Player2",
      kdRatio: 1.0,
      headshotPct: 20,
    };

    const comparison: ValorantComparisonData = {
      player1: p1,
      player2: p2,
      deltas: {
        kdDelta: 0.2,
        hsDelta: 5,
        acsDelta: 10,
        adrDelta: 5,
        winRateDelta: 0,
      },
      aiVerdict: {
        verdict: "Player1 has the mechanical advantage.",
        winnerUserId: "p1",
      },
    };

    const embed = ValorantCardBuilder.buildComparisonEmbed(comparison);
    const json = embed.toJSON();

    expect(json.title).toContain("Player1 vs Player2");
    expect(
      json.fields?.some((f) => f.name.includes("Sportscaster Verdict")),
    ).toBe(true);
  });

  it("should construct health embed properly", () => {
    const health: ValorantHealthData = {
      userId: "u1",
      riotId: "Hung#VN1",
      consecutiveLosses: 3,
      sessionMatchCount: 5,
      sessionDurationHours: 2.9,
      isNightOwl: true,
      fatigueRiskScore: 65,
      aimDeclinePct: 18,
      tiltAlertLevel: "HIGH",
      recommendation: "Take a break!",
    };

    const embed = ValorantCardBuilder.buildHealthEmbed(health);
    const json = embed.toJSON();

    expect(json.title).toContain("Hung#VN1");
    expect(json.fields?.[1].value).toContain("HIGH");
  });
});
