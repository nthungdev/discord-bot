import type {
  Client,
  GuildMember,
  User,
  UserPrimaryGuild,
  VoiceBasedChannel,
  VoiceState,
} from "discord.js";
import type { Config } from "../config";
import type {
  BotGuildConfig,
  VoiceBouncerCapabilityConfig,
} from "../config/types";
import type { IBotCapability } from "./types";

export const MAX_BOUNCE_BURST_ATTEMPTS = 3;
export const BOUNCE_WINDOW_MS = 30_000;
export const WARNING_AUTO_DELETE_DELAY_MS = 15_000;
export const USER_TAG_CACHE_TTL_MS = 60_000;
export const DEFAULT_VOICE_BOUNCE_DISCONNECT_REASON =
  "Missing required server tag";
export function formatDefaultVoiceBounceWarning(memberId: string): string {
  return `⚠️ **[Voice Bouncer]** Hey <@${memberId}>, this voice channel is reserved for members with this server's tag equipped. Please set this server as your Primary Guild (Server Tag) in your Discord profile to join.`;
}

/**
 * Determines whether a guild member has equipped the target guild's server tag as their primary guild.
 * Fails closed (returns false) if primaryGuild is missing, disabled, or does not match the target guild ID.
 */
export function isMemberGuildTagCompliant(
  primaryGuild: UserPrimaryGuild | null | undefined,
  guildId: string,
): boolean {
  if (!primaryGuild) {
    return false;
  }
  if (primaryGuild.identityEnabled === false) {
    return false;
  }
  return Boolean(
    primaryGuild.identityGuildId && primaryGuild.identityGuildId === guildId,
  );
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
  private userTagCache: Map<
    string,
    { primaryGuild: UserPrimaryGuild | null; expiresAt: number }
  > = new Map();
  private inFlightUserFetches: Map<string, Promise<UserPrimaryGuild | null>> =
    new Map();
  private pendingDeletionTimers: Set<NodeJS.Timeout> = new Set();

  init(_client: Client, _config: Config): void {
    console.info("[VoiceBouncerCapability] Initialized.");
  }

  destroy(): void {
    this.bounceHistory.clear();
    this.userTagCache.clear();
    this.inFlightUserFetches.clear();
    for (const timer of this.pendingDeletionTimers) {
      clearTimeout(timer);
    }
    this.pendingDeletionTimers.clear();
  }

  /**
   * Tracks and evaluates bounce rate-limiting scoped per guild and user.
   * Periodically purges stale entries to prevent memory growth.
   */
  public isBounceRateLimited(
    guildId: string,
    userId: string,
    now: number = Date.now(),
  ): boolean {
    const key = `${guildId}:${userId}`;
    const windowStart = now - BOUNCE_WINDOW_MS;

    // Sweep expired entries across the map to prevent memory leak
    for (const [entryKey, timestamps] of this.bounceHistory.entries()) {
      const activeTimestamps = timestamps.filter((ts) => ts > windowStart);
      if (activeTimestamps.length === 0) {
        this.bounceHistory.delete(entryKey);
      } else {
        this.bounceHistory.set(entryKey, activeTimestamps);
      }
    }

    const pastTimestamps = this.bounceHistory.get(key) || [];
    const validTimestamps = pastTimestamps.filter((ts) => ts > windowStart);

    validTimestamps.push(now);
    this.bounceHistory.set(key, validTimestamps);

    return validTimestamps.length > MAX_BOUNCE_BURST_ATTEMPTS;
  }

  /**
   * Resolves the user's primary guild tag, falling back to a REST fetch if not cached in memory.
   * Caches results for 60 seconds to prevent REST API rate limits.
   */
  public async resolveUserPrimaryGuild(
    user: User,
    now: number = Date.now(),
  ): Promise<UserPrimaryGuild | null> {
    const cached = this.userTagCache.get(user.id);
    if (cached && cached.expiresAt > now) {
      return cached.primaryGuild;
    }

    const inFlight = this.inFlightUserFetches.get(user.id);
    if (inFlight) {
      return inFlight;
    }

    const fetchPromise = (async () => {
      let primaryGuild: UserPrimaryGuild | null = null;
      try {
        const fetchedUser = await user.fetch();
        primaryGuild = fetchedUser.primaryGuild ?? null;
      } catch (error) {
        console.warn(
          `[VoiceBouncerCapability] Failed to fetch user '${user.id}' from Discord API:`,
          error,
        );
        primaryGuild = user.primaryGuild ?? null;
      } finally {
        this.inFlightUserFetches.delete(user.id);
      }

      this.userTagCache.set(user.id, {
        primaryGuild,
        expiresAt: now + USER_TAG_CACHE_TTL_MS,
      });

      return primaryGuild;
    })();

    this.inFlightUserFetches.set(user.id, fetchPromise);
    return fetchPromise;
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

    const guildId = newState.guild?.id ?? member.guild?.id;
    if (!guildId) {
      return;
    }

    const primaryGuild = await this.resolveUserPrimaryGuild(member.user);
    if (isMemberGuildTagCompliant(primaryGuild, guildId)) {
      return;
    }

    // Guard against race conditions where member moved or disconnected during async fetch
    if (member.voice && member.voice.channelId !== targetChannelId) {
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
    const guildId = member.guild?.id ?? voiceState.guild?.id ?? "unknown-guild";
    const isRateLimited = this.isBounceRateLimited(guildId, member.id);

    try {
      if (config.action === "move" && config.fallbackChannelId) {
        try {
          await voiceState.setChannel(
            config.fallbackChannelId,
            "Redirected by Voice Bouncer: Missing server tag",
          );
        } catch (moveError) {
          console.warn(
            `[VoiceBouncerCapability] Failed to move member '${member.id}' to fallback channel '${config.fallbackChannelId}', falling back to disconnect:`,
            moveError,
          );
          await voiceState.disconnect(DEFAULT_VOICE_BOUNCE_DISCONNECT_REASON);
        }
      } else {
        await voiceState.disconnect(DEFAULT_VOICE_BOUNCE_DISCONNECT_REASON);
      }

      if (!isRateLimited && channel && channel.isSendable()) {
        const warning =
          config.warningMessage || formatDefaultVoiceBounceWarning(member.id);

        const sentMessage = await channel.send({ content: warning });
        const timer = setTimeout(() => {
          this.pendingDeletionTimers.delete(timer);
          sentMessage.delete().catch(() => {});
        }, WARNING_AUTO_DELETE_DELAY_MS);

        if (timer.unref) {
          timer.unref();
        }
        this.pendingDeletionTimers.add(timer);
      }
    } catch (error) {
      console.error(
        `[VoiceBouncerCapability] Failed to enforce bounce action on member '${member.id}':`,
        error,
      );
    }
  }
}
