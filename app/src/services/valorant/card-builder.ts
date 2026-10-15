import { EmbedBuilder } from "discord.js";
import type {
  HenrikAccountData,
  ValorantComparisonData,
  ValorantHealthData,
  ValorantLiveMatchData,
  ValorantPersonalSummary,
} from "./types";

/**
 * Builds a visual text progress bar like [████████░░░░]
 */
export function buildProgressBar(
  current: number,
  max: number,
  length = 10,
): string {
  const percentage = Math.min(1, Math.max(0, current / Math.max(1, max)));
  const filledLength = Math.round(length * percentage);
  const emptyLength = length - filledLength;
  const bar = "█".repeat(filledLength) + "░".repeat(emptyLength);
  return `[${bar}]`;
}

/**
 * Maps Valorant rank tier (0 - 27) to corresponding Discord embed hex color.
 */
export function getRankColor(tier: number): number {
  if (tier >= 27) return 0xfffa65; // Radiant (Gold/Yellow)
  if (tier >= 24) return 0xc0392b; // Immortal (Crimson)
  if (tier >= 21) return 0x16a085; // Ascendant (Emerald Green)
  if (tier >= 18) return 0xb56fe8; // Diamond (Purple)
  if (tier >= 15) return 0x00a2b9; // Platinum (Teal)
  if (tier >= 12) return 0xe6b800; // Gold (Yellow)
  if (tier >= 9) return 0xbac4c8; // Silver (Silver)
  if (tier >= 6) return 0xa57c52; // Bronze (Bronze)
  if (tier >= 3) return 0x5a5a5a; // Iron (Dark Grey)
  return 0x7289da; // Unrated (Discord Blurple)
}

/**
 * Formats signed metric delta with emoji indicator.
 */
export function formatDelta(delta: number, suffix = ""): string {
  if (delta > 0) return `📈 +${delta}${suffix}`;
  if (delta < 0) return `📉 ${delta}${suffix}`;
  return `⚖️ 0${suffix}`;
}

/**
 * High-contrast Discord Embed Builders for Valorant capabilities.
 */
export class ValorantCardBuilder {
  /**
   * Builds detailed personal summary card with aim stats and AI coaching.
   */
  static buildPersonalSummaryEmbed(
    summary: ValorantPersonalSummary,
  ): EmbedBuilder {
    const hsBar = buildProgressBar(summary.headshotPct, 45, 10);
    const winRateColor = summary.winRatePct >= 50 ? 0x22c55e : 0xef4444;
    const rankColor = getRankColor(summary.currentTier);

    const embed = new EmbedBuilder()
      .setColor(summary.matchesEvaluated > 0 ? winRateColor : rankColor)
      .setTitle(
        `📊 Valorant Performance: ${summary.gameName}#${summary.tagLine}`,
      )
      .setDescription(
        `**${summary.currentRank}** (${summary.currentRR} RR) • Peak: **${summary.peakRank}**\n*Evaluated window: ${summary.matchesEvaluated} matches (${summary.period})*`,
      )
      .addFields(
        {
          name: "🎯 Aim & Combat",
          value: `**K/D**: ${summary.kdRatio} (${summary.totalKills}/${summary.totalDeaths})\n**Headshot**: ${summary.headshotPct}% \`${hsBar}\`\n**ACS**: ${summary.avgCombatScore} | **ADR**: ${summary.avgDamagePerRound}\n**First Bloods/Match**: ${summary.firstBloodsPerMatch}`,
          inline: true,
        },
        {
          name: "🏆 Rating & Clutches",
          value: `**Win Rate**: ${summary.winRatePct}% (${summary.wins}W - ${summary.losses}L)\n**Net RR**: ${formatDelta(summary.netRrDelta, " RR")}\n**1v1 Clutch**: ${summary.clutchStats.v1.winRate}%\n**1v2 Clutch**: ${summary.clutchStats.v2.winRate}%`,
          inline: true,
        },
        {
          name: "🗺️ Top Agents & Maps",
          value: `**Agents**: ${summary.topAgents.map((a) => `${a.agentName} (${a.winRate}%)`).join(", ") || "No matches"}\n**Best Map**: ${summary.mapStats.bestMap.name} (${summary.mapStats.bestMap.winRate}%)\n**Worst Map**: ${summary.mapStats.worstMap.name} (${summary.mapStats.worstMap.winRate}%)`,
          inline: false,
        },
      );

    if (summary.aiCoachVerdict) {
      embed.addFields({
        name: "🧠 AI Performance Coach",
        value: `🌟 **Strength**: ${summary.aiCoachVerdict.strength}\n⚠️ **Weakness**: ${summary.aiCoachVerdict.weakness}\n💡 **Coach Drill**: ${summary.aiCoachVerdict.actionableTip}`,
        inline: false,
      });
    }

    embed.setFooter({ text: "discord-bot • Valorant Esports Capability" });
    embed.setTimestamp();

    return embed;
  }

  /**
   * Builds head-to-head comparison duel card.
   */
  static buildComparisonEmbed(comp: ValorantComparisonData): EmbedBuilder {
    const { player1: p1, player2: p2, deltas, aiVerdict } = comp;

    const embed = new EmbedBuilder()
      .setColor(0x3b82f6)
      .setTitle(`⚔️ Aim Duel: ${p1.gameName} vs ${p2.gameName}`)
      .setDescription(
        `Head-to-head combat & precision comparison between **${p1.gameName}#${p1.tagLine}** and **${p2.gameName}#${p2.tagLine}**.`,
      )
      .addFields(
        {
          name: `👤 ${p1.gameName}`,
          value: `**Rank**: ${p1.currentRank}\n**K/D**: ${p1.kdRatio}\n**HS%**: ${p1.headshotPct}%\n**ACS**: ${p1.avgCombatScore}\n**ADR**: ${p1.avgDamagePerRound}\n**Win Rate**: ${p1.winRatePct}%`,
          inline: true,
        },
        {
          name: "⚖️ Deltas (P1 vs P2)",
          value: `**Rank**: ${p1.currentTier >= p2.currentTier ? "👑 P1" : "👑 P2"}\n**K/D**: ${formatDelta(deltas.kdDelta)}\n**HS%**: ${formatDelta(deltas.hsDelta, "%")}\n**ACS**: ${formatDelta(deltas.acsDelta)}\n**ADR**: ${formatDelta(deltas.adrDelta)}\n**Win Rate**: ${formatDelta(deltas.winRateDelta, "%")}`,
          inline: true,
        },
        {
          name: `👤 ${p2.gameName}`,
          value: `**Rank**: ${p2.currentRank}\n**K/D**: ${p2.kdRatio}\n**HS%**: ${p2.headshotPct}%\n**ACS**: ${p2.avgCombatScore}\n**ADR**: ${p2.avgDamagePerRound}\n**Win Rate**: ${p2.winRatePct}%`,
          inline: true,
        },
      );

    if (aiVerdict) {
      embed.addFields({
        name: "🎙️ Sportscaster Verdict",
        value: aiVerdict.verdict,
        inline: false,
      });
    }

    embed.setFooter({ text: "discord-bot • Valorant Compare" });
    embed.setTimestamp();

    return embed;
  }

  /**
   * Builds live match scouting embed with smurf detections and team ranks.
   */
  static buildLiveMatchEmbed(live: ValorantLiveMatchData): EmbedBuilder {
    const formatTeam = (players: ValorantLiveMatchData["teamBlue"]): string => {
      if (players.length === 0) return "*No player data available*";
      return players
        .map((p) => {
          const smurfBadge = p.isSmurfSuspect ? " ⚠️ **[SMURF ALERT]**" : "";
          return `• **${p.agent}** - ${p.name}#${p.tag} (${p.rank}, Lvl ${p.accountLevel})${smurfBadge}`;
        })
        .join("\n");
    };

    return new EmbedBuilder()
      .setColor(0xec4899)
      .setTitle(`🔴 Live Match Scouting: ${live.mapName} (${live.gameMode})`)
      .setDescription(
        `Active lobby analysis. Check enemy lineup ranks and smurf flags before round 1!`,
      )
      .addFields(
        {
          name: "🔷 Team Blue",
          value: formatTeam(live.teamBlue),
          inline: false,
        },
        {
          name: "🔶 Team Red",
          value: formatTeam(live.teamRed),
          inline: false,
        },
      )
      .setFooter({ text: `Match ID: ${live.matchId} • discord-bot` })
      .setTimestamp();
  }

  /**
   * Builds compact profile card.
   */
  static buildProfileEmbed(summary: ValorantPersonalSummary): EmbedBuilder {
    const rankColor = getRankColor(summary.currentTier);
    const topAgentList =
      summary.topAgents
        .map((a) => `**${a.agentName}** (${a.winRate}% WR, ${a.kd} K/D)`)
        .join(" • ") || "None";

    return new EmbedBuilder()
      .setColor(rankColor)
      .setTitle(`🎖️ Player Profile: ${summary.gameName}#${summary.tagLine}`)
      .setDescription(
        `**Rank**: ${summary.currentRank} (${summary.currentRR} RR)\n**Peak**: ${summary.peakRank}`,
      )
      .addFields(
        {
          name: "📊 Recent Form",
          value: `**K/D**: ${summary.kdRatio} | **HS%**: ${summary.headshotPct}%\n**Win Rate**: ${summary.winRatePct}% (${summary.wins}W - ${summary.losses}L)`,
          inline: true,
        },
        {
          name: "⚡ Top Agents",
          value: topAgentList,
          inline: false,
        },
      )
      .setFooter({ text: "Run /val stats for full AI coaching breakdown" });
  }

  /**
   * Builds tilt and aim fatigue health analysis embed.
   */
  static buildHealthEmbed(health: ValorantHealthData): EmbedBuilder {
    const bar = buildProgressBar(health.fatigueRiskScore, 100, 10);
    const color =
      health.tiltAlertLevel === "CRITICAL"
        ? 0xef4444
        : health.tiltAlertLevel === "HIGH"
          ? 0xf97316
          : health.tiltAlertLevel === "MODERATE"
            ? 0xeab308
            : 0x22c55e;

    return new EmbedBuilder()
      .setColor(color)
      .setTitle(`🩺 Aim Fatigue & Tilt Health: ${health.riotId}`)
      .setDescription(`Session health monitoring and tilt risk assessment.`)
      .addFields(
        {
          name: "📊 Session Telemetry",
          value: `**Consecutive Losses**: ${health.consecutiveLosses}\n**Matches in Session**: ${health.sessionMatchCount}\n**Est. Playtime**: ~${health.sessionDurationHours} hours\n**Night Owl (1am-5am)**: ${health.isNightOwl ? "🌙 Yes" : "☀️ No"}`,
          inline: true,
        },
        {
          name: "🧠 Fatigue & Tilt Hazard",
          value: `**Alert Level**: **${health.tiltAlertLevel}**\n**Fatigue Risk**: ${health.fatigueRiskScore}/100 \`${bar}\`\n**Estimated Aim Decline**: -${health.aimDeclinePct}%`,
          inline: true,
        },
        {
          name: "💡 Recommendation",
          value: health.recommendation,
          inline: false,
        },
      )
      .setFooter({ text: "Protect your RR • Take regular breaks" });
  }

  /**
   * Builds link success confirmation embed.
   */
  static buildLinkSuccessEmbed(
    account: HenrikAccountData,
    region: string,
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle("✅ Riot Account Linked Successfully!")
      .setDescription(
        `Your Discord account is now linked to **${account.name}#${account.tag}**.`,
      )
      .addFields(
        { name: "Region", value: region.toUpperCase(), inline: true },
        {
          name: "Account Level",
          value: `${account.account_level}`,
          inline: true,
        },
        {
          name: "PUUID",
          value: `\`${account.puuid.slice(0, 12)}...\``,
          inline: true,
        },
      )
      .setFooter({
        text: "You can now use /val stats, /val compare, and /val live!",
      });

    if (account.card?.small) {
      embed.setThumbnail(account.card.small);
    }

    return embed;
  }
}
