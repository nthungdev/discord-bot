import { formatEmoji, type Guild } from "discord.js";
import { Config, ConfigParameter } from "../config";

export type ResolvedCustomEmoji = {
  id: string;
  name?: string;
  animated: boolean;
};

export type EmojiMapEntry = string | ResolvedCustomEmoji;
export type EmojiMap = Record<string, readonly EmojiMapEntry[]>;

const GRAPHEME_SEGMENTER = new Intl.Segmenter("en", {
  granularity: "grapheme",
});

const ENDING_CUSTOM_EMOJIS_PATTERN =
  /((?:<a?:[a-zA-Z0-9_]+:\d+>)+)[\s\n\t]*[.!?]?[\s\n\t]*(\\n)?$/;

const TRAILING_PUNCTUATION_PATTERN = /[.!?]/;

/**
 * Resolves a single custom emoji name against the guild's emoji cache.
 * Returns null if the emoji has been deleted or is not found in the guild.
 */
function resolveGuildEmoji(
  guild: Guild,
  name: string,
): ResolvedCustomEmoji | null {
  const found = guild.emojis.cache.find((emoji) => emoji.name === name);
  if (!found) {
    return null;
  }

  return {
    id: found.id,
    name: found.name ?? undefined,
    animated: Boolean(found.animated),
  };
}

/**
 * Formats a custom emoji map entry (raw ID string or resolved metadata) into a Discord emoji tag.
 */
function formatCustomEmojiEntry(entry: EmojiMapEntry): string {
  if (typeof entry === "string") {
    return formatEmoji(entry);
  }

  if (entry.name) {
    return formatEmoji({
      id: entry.id,
      name: entry.name,
      animated: entry.animated,
    });
  }

  return formatEmoji({
    id: entry.id,
    animated: entry.animated,
  });
}

/**
 * Builds a mapping from standard Unicode emojis to resolved guild custom emojis.
 * Unresolved or deleted custom emoji names are skipped.
 */
export const getEmojiMap = (
  guild: Guild,
): Record<string, ResolvedCustomEmoji[]> => {
  const emojis = Config.getInstance().getConfigValue(
    ConfigParameter.guildEmojis,
  )[guild.id];
  if (!emojis) {
    return {};
  }

  const resolvedMap: Record<string, ResolvedCustomEmoji[]> = {};
  for (const [standardEmoji, names] of Object.entries(emojis)) {
    const resolved = names
      .map((name) => resolveGuildEmoji(guild, name))
      .filter((entry): entry is ResolvedCustomEmoji => entry !== null);

    if (resolved.length > 0) {
      resolvedMap[standardEmoji] = resolved;
    }
  }

  return resolvedMap;
};

const VARIATION_SELECTOR_16_PATTERN = /\uFE0F/g;

/**
 * Strips Unicode Variation Selector-16 (U+FE0F) so emojis with and without
 * explicit emoji presentation (e.g. `❤` vs `❤️`) resolve consistently.
 */
function stripVariationSelector16(value: string): string {
  return value.replace(VARIATION_SELECTOR_16_PATTERN, "");
}

/**
 * Replaces standard Unicode emojis in text with the server's custom emojis.
 * Uses grapheme cluster segmentation so multi-codepoint emojis are matched accurately,
 * and falls back to Variation Selector-16 normalization (`❤` <-> `❤️`).
 */
export const replaceEmojis = (text: string, emojiMap: EmojiMap): string => {
  const normalizedMap = new Map<string, readonly EmojiMapEntry[]>();
  for (const [key, entries] of Object.entries(emojiMap)) {
    const normalizedKey = stripVariationSelector16(key);
    if (!normalizedMap.has(normalizedKey)) {
      normalizedMap.set(normalizedKey, entries);
    }
  }

  let newText = "";
  for (const { segment } of GRAPHEME_SEGMENTER.segment(text)) {
    const candidates =
      emojiMap[segment] ?? normalizedMap.get(stripVariationSelector16(segment));
    if (candidates && candidates.length > 0) {
      const randomIndex = Math.floor(Math.random() * candidates.length);
      newText += formatCustomEmojiEntry(candidates[randomIndex]);
    } else {
      newText += segment;
    }
  }
  return newText;
};

/**
 * Splits trailing custom Discord emojis (static or animated) from the end of a message.
 * Returns a single-element array containing the original text if no trailing custom emoji is found.
 */
export const splitEndingEmojis = (text: string): string[] => {
  const trimmed = text.trimEnd();
  const endingEmojis = trimmed.match(ENDING_CUSTOM_EMOJIS_PATTERN);
  if (endingEmojis === null || endingEmojis.index === undefined) {
    return [text];
  }

  const emojis = endingEmojis[1];
  const ending = trimmed.at(-1)?.match(TRAILING_PUNCTUATION_PATTERN)?.[0] || "";
  return [trimmed.slice(0, endingEmojis.index) + ending, emojis];
};
