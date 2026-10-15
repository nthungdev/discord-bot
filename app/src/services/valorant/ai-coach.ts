import { getGenAi } from "../../utils/genAi";
import type { ValorantComparisonData, ValorantPersonalSummary } from "./types";

export interface AiCoachVerdict {
  strength: string;
  weakness: string;
  actionableTip: string;
}

export interface ComparisonBanterVerdict {
  verdict: string;
  winnerUserId: string;
}

/**
 * Strips code fences, markdown tags, or stray formatting around a JSON response.
 */
export function sanitizeJsonResponse(rawText: string): string {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

/**
 * AI Performance Coach & Sportscaster for Valorant capabilities.
 * Model-agnostic, leveraging the unified GenAI provider interface.
 */
export class ValorantAiCoach {
  /**
   * Generates tailored coaching feedback for a player's recent matches.
   */
  async generatePersonalCoaching(
    summary: ValorantPersonalSummary,
  ): Promise<AiCoachVerdict> {
    const prompt = `
You are an analytical, encouraging professional esports Valorant coach reviewing a player's recent ranked form:
Player: ${summary.gameName}#${summary.tagLine}
Rank: ${summary.currentRank} (${summary.currentRR} RR) | Peak: ${summary.peakRank}
KD: ${summary.kdRatio} | HS%: ${summary.headshotPct}% | ACS: ${summary.avgCombatScore} | ADR: ${summary.avgDamagePerRound}
First Bloods/Match: ${summary.firstBloodsPerMatch} | First Deaths/Match: ${summary.firstDeathsPerMatch}
Win Rate: ${summary.winRatePct}% (${summary.netRrDelta != null ? `Net RR: ${summary.netRrDelta >= 0 ? "+" : ""}${summary.netRrDelta} RR` : "Net RR: N/A"})
Top Agents: ${summary.topAgents.map((a) => `${a.agentName} (${a.winRate}%)`).join(", ") || "None"}
Best Map: ${summary.mapStats.bestMap.name} (${summary.mapStats.bestMap.winRate}%) | Worst Map: ${summary.mapStats.worstMap.name} (${summary.mapStats.worstMap.winRate}%)

Respond ONLY in strict JSON format with three exact keys (no markdown code blocks, just raw JSON):
{
  "strength": "1 concise sentence praising their primary mechanical or tactical strength.",
  "weakness": "1 concise sentence highlighting their primary vulnerability.",
  "actionableTip": "1 concrete positioning, crosshair placement, or warmup drill tip."
}
`;

    try {
      const genAi = getGenAi();
      await genAi.init();
      const response = await genAi.generate({ text: prompt });
      const rawContent = response.content || "";
      const cleaned = sanitizeJsonResponse(rawContent);
      const parsed = JSON.parse(cleaned) as AiCoachVerdict;

      if (parsed.strength && parsed.weakness && parsed.actionableTip) {
        return {
          strength: parsed.strength.trim(),
          weakness: parsed.weakness.trim(),
          actionableTip: parsed.actionableTip.trim(),
        };
      }
    } catch (err) {
      console.warn(
        "[ValorantAiCoach] Failed to generate AI coaching feedback, applying rule-based heuristics:",
        err,
      );
    }

    return this.fallbackCoaching(summary);
  }

  /**
   * Generates sportscaster commentary comparing two players head-to-head.
   */
  async generateComparisonBanter(
    p1: ValorantPersonalSummary,
    p2: ValorantPersonalSummary,
    deltas: ValorantComparisonData["deltas"],
  ): Promise<ComparisonBanterVerdict> {
    const p1Score =
      p1.kdRatio * 30 + p1.headshotPct * 1.5 + p1.avgCombatScore * 0.1;
    const p2Score =
      p2.kdRatio * 30 + p2.headshotPct * 1.5 + p2.avgCombatScore * 0.1;
    const isP1Winner = p1Score >= p2Score;
    const winnerName = isP1Winner ? `${p1.gameName}` : `${p2.gameName}`;
    const loserName = isP1Winner ? `${p2.gameName}` : `${p1.gameName}`;

    const prompt = `
You are a witty, hype esports sportscaster settling a head-to-head aiming duel between two Valorant players:
Player 1: ${p1.gameName} (Rank: ${p1.currentRank}, KD: ${p1.kdRatio}, HS%: ${p1.headshotPct}%, ACS: ${p1.avgCombatScore})
Player 2: ${p2.gameName} (Rank: ${p2.currentRank}, KD: ${p2.kdRatio}, HS%: ${p2.headshotPct}%, ACS: ${p2.avgCombatScore})
Deltas (P1 - P2): KD Delta: ${deltas.kdDelta}, HS% Delta: ${deltas.hsDelta}%, ACS Delta: ${deltas.acsDelta}
Statistical Winner: ${winnerName}

Provide a 2-3 sentence punchy sportscaster verdict roasting or praising them based on these metrics. Crown ${winnerName} as the duel victor over ${loserName}. Keep it entertaining.
`;

    try {
      const genAi = getGenAi();
      await genAi.init();
      const response = await genAi.generate({ text: prompt });
      const verdict = response.content?.trim();
      if (verdict) {
        return {
          verdict,
          winnerUserId: isP1Winner ? p1.puuid : p2.puuid,
        };
      }
    } catch (err) {
      console.warn(
        "[ValorantAiCoach] Failed to generate AI comparison verdict, applying rule-based fallback:",
        err,
      );
    }

    return {
      verdict: `🏆 **${winnerName}** claims victory in this duel with superior combat output (${isP1Winner ? p1.kdRatio : p2.kdRatio} K/D and ${isP1Winner ? p1.headshotPct : p2.headshotPct}% HS). ${loserName} will need to hit the range before asking for a rematch!`,
      winnerUserId: isP1Winner ? p1.puuid : p2.puuid,
    };
  }

  /**
   * Deterministic fallback when AI is offline or model fails.
   */
  private fallbackCoaching(summary: ValorantPersonalSummary): AiCoachVerdict {
    const isHighHs = summary.headshotPct >= 22;
    const isHighKd = summary.kdRatio >= 1.1;

    const strength = isHighHs
      ? `Crisp aim mechanics with a ${summary.headshotPct}% headshot precision rate.`
      : isHighKd
        ? `Consistent fragger maintaining a ${summary.kdRatio} K/D ratio.`
        : `Strong map familiarity on ${summary.mapStats.bestMap.name} (${summary.mapStats.bestMap.winRate}% win rate).`;

    const weakness =
      summary.headshotPct < 18
        ? `First-bullet headshot percentage (${summary.headshotPct}%) leaves room for improvement against high-tier peeks.`
        : summary.kdRatio < 1.0
          ? `Opening trades are unfavorable, resulting in a ${summary.kdRatio} K/D ratio.`
          : `Struggling on ${summary.mapStats.worstMap.name} (${summary.mapStats.worstMap.winRate}% win rate).`;

    const actionableTip =
      summary.headshotPct < 18
        ? "Spend 10 minutes in The Range practicing static head-level Microflex drills with Guardian or Sheriff."
        : "Work on crosshair placement and clearing common angles slice-by-slice rather than wide-swinging.";

    return { strength, weakness, actionableTip };
  }
}

let aiCoachInstance: ValorantAiCoach | null = null;

export function getValorantAiCoach(): ValorantAiCoach {
  if (!aiCoachInstance) {
    aiCoachInstance = new ValorantAiCoach();
  }
  return aiCoachInstance;
}
