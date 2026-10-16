/**
 * Voice Manager.
 * Central manager tracking active VoiceCompanion sessions per guild,
 * handling slash command actions, and dispatching voice state lifecycle events.
 */

import type { BaseGuildVoiceChannel, Guild, VoiceState } from "discord.js";
import type { VoiceCompanionSessionConfig, VoiceSessionStats } from "./types";
import { VoiceSession } from "./voice-session";

export class VoiceManager {
  private sessions = new Map<string, VoiceSession>();

  /**
   * Connects the voice companion to a guild voice channel.
   */
  public async joinChannel(
    guild: Guild,
    channel: BaseGuildVoiceChannel,
    sessionConfig?: Partial<VoiceCompanionSessionConfig>,
  ): Promise<VoiceSession> {
    const existing = this.sessions.get(guild.id);
    if (existing) {
      if (existing.channelId === channel.id) {
        return existing;
      }
      existing.destroy();
      this.sessions.delete(guild.id);
    }

    const config: VoiceCompanionSessionConfig = {
      guildId: guild.id,
      channelId: channel.id,
      modelId: sessionConfig?.modelId,
      voiceName: sessionConfig?.voiceName,
      systemInstruction: sessionConfig?.systemInstruction,
      participationMode: sessionConfig?.participationMode ?? "ambient",
      energyThreshold: sessionConfig?.energyThreshold,
      bargeInSensitivity: sessionConfig?.bargeInSensitivity,
      inactivityTimeoutMinutes: sessionConfig?.inactivityTimeoutMinutes,
      emptyChannelGraceSeconds: sessionConfig?.emptyChannelGraceSeconds,
    };

    const session = new VoiceSession(config);

    session.on("destroyed", () => {
      this.sessions.delete(guild.id);
    });

    await session.start(guild, channel);
    this.sessions.set(guild.id, session);
    return session;
  }

  /**
   * Disconnects voice companion from the specified guild.
   */
  public leaveChannel(guildId: string): boolean {
    const session = this.sessions.get(guildId);
    if (!session) {
      return false;
    }

    session.destroy();
    this.sessions.delete(guildId);
    return true;
  }

  /**
   * Retrieves active session for a guild.
   */
  public getSession(guildId: string): VoiceSession | undefined {
    return this.sessions.get(guildId);
  }

  /**
   * Pauses active companion in a guild.
   */
  public pauseSession(guildId: string): boolean {
    const session = this.sessions.get(guildId);
    if (!session) return false;
    session.pause();
    return true;
  }

  /**
   * Resumes paused companion in a guild.
   */
  public resumeSession(guildId: string): boolean {
    const session = this.sessions.get(guildId);
    if (!session) return false;
    session.resume();
    return true;
  }

  /**
   * Updates user voice opt-out setting in a guild.
   */
  public optOutUser(guildId: string, userId: string, optOut: boolean): boolean {
    const session = this.sessions.get(guildId);
    if (!session) return false;
    session.setOptOut(userId, optOut);
    return true;
  }

  /**
   * Returns stats for active session in guild.
   */
  public getStats(guildId: string): VoiceSessionStats | undefined {
    return this.sessions.get(guildId)?.getStats();
  }

  /**
   * Dispatches voice state update events to active session for auto-leave / channel tracking.
   */
  public handleVoiceStateUpdate(
    oldState: VoiceState,
    newState: VoiceState,
  ): void {
    const guild = newState.guild ?? oldState.guild;
    if (!guild) return;

    const guildId = guild.id;
    const session = this.sessions.get(guildId);
    if (!session) return;

    const botUserId = guild.client?.user?.id;
    const memberUserId = newState.id ?? oldState.id;

    // Check if the bot itself was disconnected or moved by an admin
    if (memberUserId === botUserId) {
      if (!newState.channelId) {
        console.info(
          `[VoiceManager] Bot was disconnected from voice in guild ${guildId}.`,
        );
        session.destroy();
      } else if (newState.channelId !== session.channelId) {
        console.info(
          `[VoiceManager] Bot was moved from ${session.channelId} to ${newState.channelId} in guild ${guildId}. Cleaning up session.`,
        );
        session.destroy();
      }
      return;
    }

    // Check member leaves/joins in session channel
    const isSessionChannel =
      oldState.channelId === session.channelId ||
      newState.channelId === session.channelId;

    if (!isSessionChannel) return;

    // If human member joined session channel, register them with speaker tracker
    if (
      newState.channelId === session.channelId &&
      newState.member &&
      !newState.member.user.bot
    ) {
      session.registerMember(newState.member);
    }

    const channel = guild.channels.cache.get(session.channelId) as
      | BaseGuildVoiceChannel
      | undefined;

    if (!channel) return;

    // Count non-bot human members remaining in the channel
    const humanCount = channel.members.filter(
      (m) => !m.user.bot && m.id !== botUserId,
    ).size;

    session.onMemberCountChanged(humanCount);
  }

  /**
   * Destroys all active sessions on shutdown or capability unmount.
   */
  public destroyAll(): void {
    for (const [, session] of this.sessions) {
      session.destroy();
    }
    this.sessions.clear();
  }
}

let defaultVoiceManager: VoiceManager | null = null;

export function getVoiceManager(): VoiceManager {
  if (!defaultVoiceManager) {
    defaultVoiceManager = new VoiceManager();
  }
  return defaultVoiceManager;
}

export function setVoiceManager(manager: VoiceManager | null): void {
  defaultVoiceManager = manager;
}
