import type {
  Client,
  GuildMember,
  VoiceBasedChannel,
  VoiceState,
} from "discord.js";
import type { Config } from "../config";
import type {
  BotGuildConfig,
  VoiceBouncerCapabilityConfig,
} from "../config/types";
import type { IBotCapability } from "./types";

export const DEFAULT_TAG_PATTERN =
  "^(?:\\[[A-Za-z0-9_-]+\\]|\\([A-Za-z0-9_-]+\\))";
export const MAX_BOUNCE_BURST_ATTEMPTS = 3;
export const BOUNCE_WINDOW_MS = 30_000;
export const DEFAULT_VOICE_BOUNCE_DISCONNECT_REASON =
  "Missing required server tag";

/**
 * Determines whether a guild member's display name or username satisfies the tag regex pattern.
 */
export function isMemberTagCompliant(
  displayName: string,
  username: string,
  pattern: string,
): boolean {
  if (!pattern) return true;
  try {
    const regex = new RegExp(pattern, "i");
    return regex.test(displayName) || regex.test(username);
  } catch (error) {
    console.warn(
      `[VoiceBouncerCapability] Invalid regex pattern '${pattern}':`,
      error,
    );
    return true;
  }
}

/**
 * Checks whether the member holds at least one exempt role.
 */
export function isMemberExemptByRole(
  memberRoleIds: readonly string[],
  exemptRoleIds: readonly string[],
): boolean {
  if (exemptRoleIds.length === 0) return false;
  return memberRoleIds.some((roleId) => exemptRoleIds.includes(roleId));
}

/**
 * Evaluates if a voice channel is protected by tag-only restrictions.
 */
export function isChannelProtectedByBouncer(
  channelId: string,
  parentCategoryId: string | null | undefined,
  protectedChannelIds: readonly string[] = [],
  protectedCategoryIds: readonly string[] = [],
): boolean {
  if (protectedChannelIds.includes(channelId)) {
    return true;
  }
  if (parentCategoryId && protectedCategoryIds.includes(parentCategoryId)) {
    return true;
  }
  return false;
}

/**
 * Voice Bouncer Capability
 * Automatically verifies member server tags and clan identifiers upon joining protected voice channels.
 * Disconnects or redirects non-compliant users and suppresses notification loops.
 */
export class VoiceBouncerCapability implements IBotCapability {
  readonly id = "voice-bouncer";
  readonly name = "Voice Channel Bouncer";

  private bounceHistory: Map<string, number[]> = new Map();

  init(_client: Client, _config: Config): void {
    console.info("[VoiceBouncerCapability] Initialized.");
  }

  destroy(): void {
    this.bounceHistory.clear();
  }

  /**
   * Tracks and evaluates bounce rate-limiting to mitigate notification loops.
   */
  public isBounceRateLimited(
    userId: string,
    now: number = Date.now(),
  ): boolean {
    const windowStart = now - BOUNCE_WINDOW_MS;
    const pastTimestamps = this.bounceHistory.get(userId) || [];
    const validTimestamps = pastTimestamps.filter((ts) => ts > windowStart);

    validTimestamps.push(now);
    this.bounceHistory.set(userId, validTimestamps);

    return validTimestamps.length > MAX_BOUNCE_BURST_ATTEMPTS;
  }

  /**
   * Handles incoming voice state updates to enforce server tag compliance.
   */
  async handleVoiceStateUpdate(
    oldState: VoiceState,
    newState: VoiceState,
    guildConfig?: BotGuildConfig,
  ): Promise<void> {
    const bouncerConfig = guildConfig?.voiceBouncer;
    if (!bouncerConfig?.enabled) {
      return;
    }

    const targetChannelId = newState.channelId;
    if (!targetChannelId) {
      return;
    }

    // Skip if channel did not change (e.g. mute or deafen toggle)
    if (oldState.channelId === targetChannelId) {
      return;
    }

    const channel = newState.channel;
    const parentCategoryId = channel?.parentId;
    const isProtected = isChannelProtectedByBouncer(
      targetChannelId,
      parentCategoryId,
      bouncerConfig.tagOnlyVoiceChannelIds,
      bouncerConfig.tagOnlyCategoryIds,
    );

    if (!isProtected) {
      return;
    }

    const member = newState.member;
    if (!member || member.user.bot) {
      return;
    }

    const memberRoleIds = Array.from(member.roles.cache.keys());
    if (
      isMemberExemptByRole(memberRoleIds, bouncerConfig.exemptRoleIds || [])
    ) {
      return;
    }

    const pattern = bouncerConfig.tagPattern ?? DEFAULT_TAG_PATTERN;
    if (
      isMemberTagCompliant(member.displayName, member.user.username, pattern)
    ) {
      return;
    }

    // Member is non-compliant; enforce policy
    await this.enforceBounceAction(newState, member, channel, bouncerConfig);
  }

  /**
   * Disconnects or relocates non-compliant member and dispatches an explanation notice.
   */
  private async enforceBounceAction(
    voiceState: VoiceState,
    member: GuildMember,
    channel: VoiceBasedChannel | null,
    config: VoiceBouncerCapabilityConfig,
  ): Promise<void> {
    const isRateLimited = this.isBounceRateLimited(member.id);

    try {
      if (config.action === "move" && config.fallbackChannelId) {
        await voiceState.setChannel(
          config.fallbackChannelId,
          "Redirected by Voice Bouncer: Missing server tag",
        );
      } else {
        await voiceState.disconnect(DEFAULT_VOICE_BOUNCE_DISCONNECT_REASON);
      }

      if (!isRateLimited && channel && channel.isSendable()) {
        const warning =
          config.warningMessage ||
          `⚠️ **[Voice Bouncer]** Hey <@${member.id}>, this voice channel is reserved for tagged server members. Please update your nickname or profile with the server tag to join.`;

        await channel.send({ content: warning });
      }
    } catch (error) {
      console.error(
        `[VoiceBouncerCapability] Failed to enforce bounce action on member '${member.id}':`,
        error,
      );
    }
  }
}
