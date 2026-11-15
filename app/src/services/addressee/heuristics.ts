import type { Message } from "discord.js";
import type { BotGuildConfig } from "../../config/types";
import type { AddresseeEvaluationContext, AddresseeResult } from "./types";

export const DEFAULT_SESSION_TTL_SECONDS = 45;
export const DEFAULT_OPT_OUT_TOPIC_TAG = "[no-bot]";
export const BOT_COMMAND_PREFIXES = ["!", "/", "$", "~"] as const;
/**
 * Minimum name length (in code points) for Tier 1 vocative matching. Shorter
 * nicknames like "Em" are common words that would force replies, so they are
 * left to the Tier 2 classifier.
 */
export const MIN_VOCATIVE_NAME_LENGTH = 3;

/**
 * Escapes regex special characters in dynamic strings like bot names.
 */
function escapeRegex(text: string): string {
  // Only syntax characters: identity escapes like `\,` or `\ ` are SyntaxErrors under the `u` flag.
  return text.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");
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
 * Checks if message begins with vocative addressing like "Hey bot", the bot name, or an alias.
 * Names shorter than MIN_VOCATIVE_NAME_LENGTH are ignored.
 */
export function isVocativeAddressing(
  content: string,
  botName?: string,
  aliases: readonly string[] = [],
): boolean {
  const names = ["bot"];
  for (const name of [botName, ...aliases]) {
    const trimmed = name?.trim();
    if (trimmed && [...trimmed].length >= MIN_VOCATIVE_NAME_LENGTH) {
      names.push(escapeRegex(trimmed));
    }
  }

  const namePattern = names.join("|");
  // The greeting needs a separator so "hijarvis" is not read as "hi" + "jarvis".
  // Unicode-aware boundary: `\b` is ASCII-only and fails on names ending in letters like "ồ".
  const vocativeRegex = new RegExp(
    `^(?:(?:hey|hi|hello|ok|yo)[\\s,]+)?(?:${namePattern})(?![\\p{L}\\p{N}_])`,
    "iu",
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
 * Evaluates positive direct interactions (bot thread, explicit mention, direct reply).
 */
function evaluateDirectInteractions(
  context: AddresseeEvaluationContext,
): AddresseeResult | null {
  const { message, botUserId, refMessage } = context;

  if (isBotOwnedThread(message, botUserId)) {
    return {
      decision: "respond",
      tier: "tier1_deterministic",
      reason: "bot_thread",
      confidence: 1.0,
    };
  }

  if (isExplicitBotMention(message, botUserId)) {
    return {
      decision: "respond",
      tier: "tier1_deterministic",
      reason: "explicit_mention",
      confidence: 1.0,
    };
  }

  if (isDirectReplyToBot(refMessage, botUserId)) {
    return {
      decision: "respond",
      tier: "tier1_deterministic",
      reason: "direct_reply",
      confidence: 1.0,
    };
  }

  return null;
}

/**
 * Evaluates ambient positive triggers (vocative, active session, whitelisted channel).
 */
function evaluateAmbientTriggers(
  context: AddresseeEvaluationContext,
): AddresseeResult | null {
  const {
    message,
    botName,
    botAliases,
    guildConfig,
    activeSessionTimestamp,
    now = Date.now(),
  } = context;

  const isSmartReplyDisabled =
    guildConfig?.smartReply?.enabled === false ||
    guildConfig?.smartReply?.mode === "disabled";

  if (
    !isSmartReplyDisabled &&
    isVocativeAddressing(message.content, botName, botAliases)
  ) {
    return {
      decision: "respond",
      tier: "tier1_deterministic",
      reason: "vocative_name",
      confidence: 1.0,
    };
  }

  const sessionTtl =
    guildConfig?.smartReply?.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  if (
    !isSmartReplyDisabled &&
    isActiveUserSession(activeSessionTimestamp, sessionTtl, now)
  ) {
    return {
      decision: "respond",
      tier: "tier1_deterministic",
      reason: "active_session",
      confidence: 0.9,
    };
  }

  if (isWhitelistedReplyChannel(message, guildConfig)) {
    return {
      decision: "respond",
      tier: "tier1_deterministic",
      reason: "reply_channel_whitelist",
      confidence: 1.0,
    };
  }

  return null;
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
    guildConfig,
    refMessage,
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

  // 5-7. Positive Triggers: Direct interactions
  const directResult = evaluateDirectInteractions(context);
  if (directResult) {
    return directResult;
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

  // 9-11. Ambient Triggers (vocative, active session, whitelist)
  return evaluateAmbientTriggers(context);
}
