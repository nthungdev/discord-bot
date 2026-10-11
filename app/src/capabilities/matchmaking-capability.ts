import type { Client, Interaction, VoiceState } from "discord.js";
import type { Config } from "../config";
import type {
  BotGuildConfig,
  MatchmakingCapabilityConfig,
} from "../config/types";
import type { IBotCapability } from "./types";

export const MATCHMAKING_INTERACTION_PREFIX = "10man_";
export const DEFAULT_TEAM_EVICT_REASON =
  "Unauthorized member joined restricted match team channel";

/**
 * Checks whether an interaction customId belongs to the matchmaking workflow.
 */
export function isMatchmakingInteraction(customId: string): boolean {
  return customId.startsWith(MATCHMAKING_INTERACTION_PREFIX);
}

/**
 * Checks whether a voice channel is configured as a dedicated match team channel.
 */
export function isMatchTeamVoiceChannel(
  channelId: string,
  config?: MatchmakingCapabilityConfig,
): boolean {
  if (!config) return false;
  return (
    channelId === config.team1VoiceChannelId ||
    channelId === config.team2VoiceChannelId
  );
}

/**
 * Matchmaking Capability
 * Coordinates custom 5v5 10-man lobby queues, drafting, map veto, dynamic VC isolation, and Elo rankings.
 */
export class MatchmakingCapability implements IBotCapability {
  readonly id = "matchmaking";
  readonly name = "Matchmaking & 10-Man Organizer";

  init(_client: Client, _config: Config): void {
    console.info("[MatchmakingCapability] Initialized.");
  }

  destroy(): void {
    // Teardown any pending timeouts or lobby subscriptions
  }

  /**
   * Dispatches button clicks and select menus related to the 10-man matchmaking lifecycle.
   */
  async handleInteraction(
    interaction: Interaction,
    guildConfig?: BotGuildConfig,
  ): Promise<void> {
    const matchmakingConfig = guildConfig?.matchmaking;
    if (!matchmakingConfig?.enabled) {
      return;
    }

    if (!(interaction.isButton() || interaction.isStringSelectMenu())) {
      return;
    }

    if (!isMatchmakingInteraction(interaction.customId)) {
      return;
    }

    // Interaction belongs to 10-man matchmaking; inform user of preview status
    console.info(
      `[MatchmakingCapability] Handling interaction '${interaction.customId}' for user '${interaction.user.id}'`,
    );

    if (!(interaction.replied || interaction.deferred)) {
      await interaction.reply({
        content:
          "⚠️ **[Matchmaking]** The 10-man matchmaking engine is currently in preview mode. Interactive lobbies are coming soon!",
        ephemeral: true,
      });
    }
  }

  /**
   * Monitors voice state changes to prevent unauthorized intrusion into active team channels.
   */
  async handleVoiceStateUpdate(
    oldState: VoiceState,
    newState: VoiceState,
    guildConfig?: BotGuildConfig,
  ): Promise<void> {
    const matchmakingConfig = guildConfig?.matchmaking;
    if (!matchmakingConfig?.enabled) {
      return;
    }

    const targetChannelId = newState.channelId;
    if (!targetChannelId || oldState.channelId === targetChannelId) {
      return;
    }

    if (!isMatchTeamVoiceChannel(targetChannelId, matchmakingConfig)) {
      return;
    }

    const member = newState.member;
    if (!member || member.user.bot) {
      return;
    }

    // In preview mode without active match rosters, team channels are restricted to avoid unauthorized intrusion.
    // Evict the intruder back to the main lobby, or disconnect if no lobby is configured.
    try {
      if (matchmakingConfig.lobbyVoiceChannelId) {
        await newState.setChannel(
          matchmakingConfig.lobbyVoiceChannelId,
          DEFAULT_TEAM_EVICT_REASON,
        );
      } else {
        await newState.disconnect(DEFAULT_TEAM_EVICT_REASON);
      }
    } catch (error) {
      console.error(
        `[MatchmakingCapability] Failed to evict intruder '${member.id}' from team channel:`,
        error,
      );
    }
  }
}
