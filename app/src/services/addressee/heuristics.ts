import type { Message } from "discord.js";
import type { BotGuildConfig } from "../../config/types";
import type { AddresseeEvaluationContext, AddresseeResult } from "./types";

export const DEFAULT_SESSION_TTL_SECONDS = 45;
export const DEFAULT_OPT_OUT_TOPIC_TAG = "[no-bot]";
export const BOT_COMMAND_PREFIXES = ["!", "/", "$", "~"] as const;

/**
 * Escapes regex special characters in dynamic strings like bot names.
 */
function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

/**
 * Checks if message author is a Discord bot.
 */
export function isBotAuthor(message: Message<boolean>): boolean {
  return message.author.bot;
}

/**
 * Checks if the channel is explicitly ignored or opted-out via channel topic.
 */
export function isChannelOptedOut(
  message: Message<boolean>,
  guildConfig?: BotGuildConfig,
): boolean {
  if (guildConfig?.ignoredChannelIds?.includes(message.channelId)) {
    return true;
  }

  const optOutTag =
    guildConfig?.smartReply?.optOutTopicTag ?? DEFAULT_OPT_OUT_TOPIC_TAG;

  const topic = (message.channel as { topic?: string | null })?.topic;
  if (topic?.includes(optOutTag)) {
    return true;
  }

  return false;
}

/**
 * Checks whether channel silence cooldown is currently active.
 */
export function isChannelSilenced(
  channelSilencedUntil?: number,
  now: number = Date.now(),
): boolean {
  return Boolean(channelSilencedUntil && channelSilencedUntil > now);
}

/**
 * Checks whether the message starts with an external bot command prefix.
 */
export function startsWithCommandPrefix(content: string): boolean {
  const trimmed = content.trim();
  return BOT_COMMAND_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

function hasMentionedBot(
  mentionedUsers: Message<boolean>["mentions"]["users"] | undefined,
  botUserId: string,
): boolean {
  if (!mentionedUsers) return false;
  if (typeof mentionedUsers.has === "function") {
    return mentionedUsers.has(botUserId);
  }
  if (typeof mentionedUsers.toJSON === "function") {
    return mentionedUsers.toJSON().some((u) => u.id === botUserId);
  }
  return false;
}

function hasMentionedOtherUsers(
  mentionedUsers: Message<boolean>["mentions"]["users"] | undefined,
  botUserId: string,
): boolean {
  if (!mentionedUsers) return false;
  if (typeof mentionedUsers.filter === "function") {
    return mentionedUsers.filter((u) => u.id !== botUserId).size > 0;
  }
  if (typeof mentionedUsers.toJSON === "function") {
    return mentionedUsers.toJSON().some((u) => u.id !== botUserId);
  }
  return false;
}

/**
 * Checks whether the message was explicitly directed at another user.
 */
export function isAddressedToOtherUser(
  message: Message<boolean>,
  refMessage: Message<boolean> | null | undefined,
  botUserId: string,
): boolean {
  if (refMessage && refMessage.author.id !== botUserId) {
    return true;
  }

  const mentionedUsers = message.mentions?.users;
  if (
    !hasMentionedBot(mentionedUsers, botUserId) &&
    hasMentionedOtherUsers(mentionedUsers, botUserId)
  ) {
    return true;
  }

  return false;
}

/**
 * Checks if the message is in a dedicated thread owned by the bot.
 */
export function isBotOwnedThread(
  message: Message<boolean>,
  botUserId: string,
): boolean {
  return (
    typeof message.channel?.isThread === "function" &&
    message.channel.isThread() &&
    message.channel.ownerId === botUserId
  );
}

/**
 * Checks if the bot is explicitly mentioned in the message.
 */
export function isExplicitBotMention(
  message: Message<boolean>,
  botUserId: string,
): boolean {
  const users = message.mentions?.users;
  if (!users) return false;

  if (typeof users.has === "function") {
    return users.has(botUserId);
  }
  if (typeof users.toJSON === "function") {
    return users.toJSON().some((u) => u.id === botUserId);
  }
  return false;
}

/**
 * Checks if the message is a direct reply to one of the bot's messages.
 */
export function isDirectReplyToBot(
  refMessage: Message<boolean> | null | undefined,
  botUserId: string,
): boolean {
  return Boolean(refMessage && refMessage.author.id === botUserId);
}

/**
 * Checks if message begins with vocative addressing like "Hey bot" or configured bot name.
 */
export function isVocativeAddressing(
  content: string,
  botName?: string,
): boolean {
  const names = ["bot"];
  if (botName && botName.trim().length > 0) {
    names.push(escapeRegex(botName.trim()));
  }

  const namePattern = names.join("|");
  const vocativeRegex = new RegExp(
    `^(?:hey|hi|hello|ok|yo)?\\s*(?:${namePattern})\\b`,
    "i",
  );
  return vocativeRegex.test(content.trim());
}

/**
 * Checks if the user is in an active conversational session within the TTL window.
 */
export function isActiveUserSession(
  lastActiveTimestamp?: number,
  sessionTtlSeconds: number = DEFAULT_SESSION_TTL_SECONDS,
  now: number = Date.now(),
): boolean {
  if (!lastActiveTimestamp) return false;
  const ttlMs = sessionTtlSeconds * 1000;
  return now - lastActiveTimestamp <= ttlMs;
}

/**
 * Checks if the current channel is configured as a dedicated reply channel.
 */
export function isWhitelistedReplyChannel(
  message: Message<boolean>,
  guildConfig?: BotGuildConfig,
): boolean {
  return Boolean(guildConfig?.replyChannelIds?.includes(message.channelId));
}

/**
 * Evaluates all Tier 1 deterministic addressee heuristics.
 * Returns an AddresseeResult if a definitive determination is made, or null if ambiguous.
 */
export function evaluateTier1Heuristics(
  context: AddresseeEvaluationContext,
): AddresseeResult | null {
  const {
    message,
    botUserId,
    botName,
    guildConfig,
    refMessage,
    activeSessionTimestamp,
    channelSilencedUntil,
    now = Date.now(),
  } = context;

  // 1. Author is a bot -> drop immediately
  if (isBotAuthor(message)) {
    return {
      decision: "ignore",
      tier: "tier1_deterministic",
      reason: "bot_author",
      confidence: 1.0,
    };
  }

  // 2. Channel is opted out -> drop immediately
  if (isChannelOptedOut(message, guildConfig)) {
    return {
      decision: "ignore",
      tier: "tier1_deterministic",
      reason: "channel_opt_out",
      confidence: 1.0,
    };
  }

  const isExplicitMention = isExplicitBotMention(message, botUserId);

  // 3. Channel is silenced -> drop unless explicitly mentioned
  if (isChannelSilenced(channelSilencedUntil, now) && !isExplicitMention) {
    return {
      decision: "ignore",
      tier: "tier1_deterministic",
      reason: "channel_silenced",
      confidence: 1.0,
    };
  }

  // 4. Message starts with bot command prefix -> drop
  if (startsWithCommandPrefix(message.content)) {
    return {
      decision: "ignore",
      tier: "tier1_deterministic",
      reason: "command_prefix",
      confidence: 1.0,
    };
  }

  // 5. Positive Triggers: Dedicated bot thread
  if (isBotOwnedThread(message, botUserId)) {
    return {
      decision: "respond",
      tier: "tier1_deterministic",
      reason: "bot_thread",
      confidence: 1.0,
    };
  }

  // 6. Positive Trigger: Explicit mention
  if (isExplicitMention) {
    return {
      decision: "respond",
      tier: "tier1_deterministic",
      reason: "explicit_mention",
      confidence: 1.0,
    };
  }

  // 7. Positive Trigger: Direct reply to bot message
  if (isDirectReplyToBot(refMessage, botUserId)) {
    return {
      decision: "respond",
      tier: "tier1_deterministic",
      reason: "direct_reply",
      confidence: 1.0,
    };
  }

  // 8. Addressed to another user -> drop
  if (isAddressedToOtherUser(message, refMessage, botUserId)) {
    return {
      decision: "ignore",
      tier: "tier1_deterministic",
      reason: "addressed_to_other",
      confidence: 1.0,
    };
  }

  // 9. Positive Trigger: Vocative addressing (e.g. "Hey bot", "ChatBot ...")
  if (isVocativeAddressing(message.content, botName)) {
    return {
      decision: "respond",
      tier: "tier1_deterministic",
      reason: "vocative_name",
      confidence: 1.0,
    };
  }

  // 10. Positive Trigger: Active user session within TTL
  const sessionTtl =
    guildConfig?.smartReply?.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  if (isActiveUserSession(activeSessionTimestamp, sessionTtl, now)) {
    return {
      decision: "respond",
      tier: "tier1_deterministic",
      reason: "active_session",
      confidence: 0.9,
    };
  }

  // 11. Positive Trigger: Whitelisted reply channel
  if (isWhitelistedReplyChannel(message, guildConfig)) {
    return {
      decision: "respond",
      tier: "tier1_deterministic",
      reason: "reply_channel_whitelist",
      confidence: 1.0,
    };
  }

  // 12. No Tier 1 rule matched -> ambiguous
  return null;
}
