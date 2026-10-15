import { describe, expect, it, vi } from "vitest";
import { sanitizeJsonResponse, ValorantAiCoach } from "../ai-coach";
import type { ValorantPersonalSummary } from "../types";

vi.mock("../../../utils/genAi", () => ({
  getGenAi: vi.fn(),
}));

describe("ValorantAiCoach", () => {
  it("should sanitize markdown code blocks from json response", () => {
    const raw =
      '```json\n{"strength":"Good","weakness":"Bad","actionableTip":"Drill"}\n```';
    expect(sanitizeJsonResponse(raw)).toBe(
      '{"strength":"Good","weakness":"Bad","actionableTip":"Drill"}',
    );

    const rawNoLang = '```\n{"foo":"bar"}\n```';
    expect(sanitizeJsonResponse(rawNoLang)).toBe('{"foo":"bar"}');

    const rawClean = '{"foo":"bar"}';
    expect(sanitizeJsonResponse(rawClean)).toBe('{"foo":"bar"}');
  });

  it("should fall back to deterministic rule-based advice when GenAI throws", async () => {
    const { getGenAi } = await import("../../../utils/genAi");
    vi.mocked(getGenAi).mockReturnValue({
      init: vi.fn().mockResolvedValue(undefined),
      generate: vi.fn().mockRejectedValue(new Error("GenAI timeout")),
    } as unknown as ReturnType<typeof getGenAi>);

    const coach = new ValorantAiCoach();
    const mockSummary: ValorantPersonalSummary = {
      puuid: "puuid-1",
      gameName: "Player",
      tagLine: "0001",
      currentRank: "Gold 1",
      currentTier: 13,
      currentRR: 50,
      peakRank: "Platinum 1",
      peakTier: 16,
      period: "recent_20",
      matchesEvaluated: 10,
      wins: 5,
      losses: 5,
      winRatePct: 50,
      netRrDelta: 0,
      kdRatio: 0.95,
      totalKills: 100,
      totalDeaths: 105,
      totalAssists: 30,
      headshotPct: 15,
      bodyPct: 75,
      legPct: 10,
      avgCombatScore: 190,
      avgDamagePerRound: 125,
      firstBloodsPerMatch: 1.2,
      firstDeathsPerMatch: 1.8,
      clutchStats: {
        v1: { won: 2, total: 5, winRate: 40 },
        v2: { won: 1, total: 4, winRate: 25 },
        v3Plus: { won: 0, total: 2, winRate: 0 },
      },
      topAgents: [{ agentName: "Reyna", matches: 6, winRate: 50, kd: 1.0 }],
      mapStats: {
        bestMap: { name: "Ascent", winRate: 60, matches: 5 },
        worstMap: { name: "Split", winRate: 40, matches: 5 },
      },
    };

    const verdict = await coach.generatePersonalCoaching(mockSummary);

    expect(verdict.strength).toBeDefined();
    expect(verdict.weakness).toContain(
      "First-bullet headshot percentage (15%)",
    );
    expect(verdict.actionableTip).toContain("The Range");
  });

  it("should parse valid AI JSON response when provided", async () => {
    const { getGenAi } = await import("../../../utils/genAi");
    vi.mocked(getGenAi).mockReturnValue({
      init: vi.fn().mockResolvedValue(undefined),
      generate: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          strength: "Incredible flick aim on Jett.",
          weakness: "Overextending after spike plants.",
          actionableTip: "Play post-plant numbers and hold crossfires.",
        }),
      }),
    } as unknown as ReturnType<typeof getGenAi>);

    const coach = new ValorantAiCoach();
    const mockSummary = {
      gameName: "ProPlayer",
      tagLine: "NA1",
      currentRank: "Ascendant 3",
      topAgents: [],
      mapStats: { bestMap: { name: "Ascent" }, worstMap: { name: "Bind" } },
    } as unknown as ValorantPersonalSummary;

    const verdict = await coach.generatePersonalCoaching(mockSummary);

    expect(verdict.strength).toBe("Incredible flick aim on Jett.");
    expect(verdict.weakness).toBe("Overextending after spike plants.");
    expect(verdict.actionableTip).toBe(
      "Play post-plant numbers and hold crossfires.",
    );
  });
});
