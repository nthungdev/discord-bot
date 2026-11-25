import axios from "axios";
import type { AiPromptFile } from "../../types";
import { getGenAi } from "../../utils/genAi";

export const EMOJI_AI_BATCH_SIZE = 8;
export const EMOJI_CDN_FETCH_TIMEOUT_MS = 8000;
export const MAX_STANDARD_EMOJIS_PER_CUSTOM = 3;
export const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,20}$/;

const DISCORD_EMOJI_CDN_BASE_URL = "https://cdn.discordapp.com/emojis";
const EMOJI_THUMBNAIL_SIZE = 128;
const CODE_FENCE_START_PATTERN = /^```(?:json)?\s*/i;
const CODE_FENCE_END_PATTERN = /\s*```$/;

export interface GuildCustomEmojiInfo {
  id: string;
  name: string;
  animated: boolean;
  url: string;
}

export interface EmojiAiSuggestion {
  customEmojiName: string;
  standardEmojis: string[];
  reason: string;
}

export interface SuggestEmojiMappingsOptions {
  emojis: GuildCustomEmojiInfo[];
  existingMapping?: Record<string, string[]>;
}

interface FetchedEmojiThumbnail {
  mimeType: "image/webp" | "image/png";
  base64: string;
}

interface PreparedBatchItem {
  emoji: GuildCustomEmojiInfo;
  thumbnail: FetchedEmojiThumbnail | null;
}

/**
 * Builds a static Discord CDN thumbnail URL for a validated snowflake ID.
 * Returns null if the ID fails snowflake validation to prevent SSRF.
 */
export function buildSafeEmojiThumbnailUrl(
  emojiId: string,
  format: "webp" | "png" = "webp",
): string | null {
  if (!DISCORD_SNOWFLAKE_PATTERN.test(emojiId)) {
    return null;
  }
  return `${DISCORD_EMOJI_CDN_BASE_URL}/${emojiId}.${format}?size=${EMOJI_THUMBNAIL_SIZE}&animated=false`;
}

async function fetchBinaryAsBase64(url: string): Promise<string> {
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: "arraybuffer",
    timeout: EMOJI_CDN_FETCH_TIMEOUT_MS,
  });
  return Buffer.from(response.data).toString("base64");
}

/**
 * Downloads a static thumbnail for a custom emoji from Discord's CDN.
 * Attempts WebP first and falls back to PNG; returns null on invalid ID or fetch failure.
 */
async function fetchEmojiThumbnail(
  emoji: GuildCustomEmojiInfo,
): Promise<FetchedEmojiThumbnail | null> {
  const webpUrl = buildSafeEmojiThumbnailUrl(emoji.id, "webp");
  if (!webpUrl) {
    return null;
  }

  try {
    const base64 = await fetchBinaryAsBase64(webpUrl);
    return { mimeType: "image/webp", base64 };
  } catch {
    // Fall back to PNG if WebP thumbnail is unavailable
  }

  const pngUrl = buildSafeEmojiThumbnailUrl(emoji.id, "png");
  if (!pngUrl) {
    return null;
  }

  try {
    const base64 = await fetchBinaryAsBase64(pngUrl);
    return { mimeType: "image/png", base64 };
  } catch {
    return null;
  }
}

function chunkArray<T>(items: readonly T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function buildBatchPrompt(
  items: readonly PreparedBatchItem[],
  existingMapping?: Record<string, string[]>,
): { text: string; files: AiPromptFile[] } {
  const files: AiPromptFile[] = [];
  const emojiLines: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const { emoji, thumbnail } = items[i];
    if (thumbnail) {
      files.push({
        uri: `data:${thumbnail.mimeType};base64,${thumbnail.base64}`,
        mimeType: thumbnail.mimeType,
      });
      emojiLines.push(
        `${i + 1}. "${emoji.name}" (image #${files.length} attached)`,
      );
    } else {
      emojiLines.push(
        `${i + 1}. "${emoji.name}" (image unavailable; infer meaning from name)`,
      );
    }
  }

  const existingContext =
    existingMapping && Object.keys(existingMapping).length > 0
      ? `\nExisting standard-to-custom emoji mappings for context:\n${JSON.stringify(existingMapping)}\n`
      : "";

  const text = [
    "You are mapping Discord server custom emojis to equivalent standard Unicode emojis.",
    `For each custom emoji listed below, suggest 1 to ${MAX_STANDARD_EMOJIS_PER_CUSTOM} standard Unicode emojis that best match its visual expression, meme meaning, or reaction intent.`,
    existingContext,
    "Custom emojis in this batch:",
    ...emojiLines,
    "",
    "Respond ONLY with a strict JSON array matching this exact schema (no extra commentary):",
    '[{"customEmojiName": "...", "standardEmojis": ["😂", "🤣"], "reason": "short 1-sentence reason"}]',
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { text, files };
}

function parseRawJsonArray(rawContent: string): unknown[] {
  const stripped = rawContent
    .trim()
    .replace(CODE_FENCE_START_PATTERN, "")
    .replace(CODE_FENCE_END_PATTERN, "")
    .trim();

  try {
    const parsed: unknown = JSON.parse(stripped);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const startIdx = stripped.indexOf("[");
    const endIdx = stripped.lastIndexOf("]");
    if (startIdx === -1 || endIdx <= startIdx) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(stripped.slice(startIdx, endIdx + 1));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

function normalizeStandardEmojis(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const unique: string[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    unique.push(trimmed);
    if (unique.length >= MAX_STANDARD_EMOJIS_PER_CUSTOM) {
      break;
    }
  }

  return unique;
}

/**
 * Parses and validates raw GenAI JSON output against the requested batch of emoji names.
 */
export function parseEmojiSuggestions(
  rawContent: string,
  allowedEmojiNames: ReadonlySet<string>,
): EmojiAiSuggestion[] {
  const rawItems = parseRawJsonArray(rawContent);
  const suggestions: EmojiAiSuggestion[] = [];
  const seenNames = new Set<string>();

  for (const item of rawItems) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const customEmojiName =
      typeof record.customEmojiName === "string"
        ? record.customEmojiName.trim()
        : "";

    if (
      !(customEmojiName && allowedEmojiNames.has(customEmojiName)) ||
      seenNames.has(customEmojiName)
    ) {
      continue;
    }

    const standardEmojis = normalizeStandardEmojis(record.standardEmojis);
    if (standardEmojis.length === 0) {
      continue;
    }

    const reason =
      typeof record.reason === "string" ? record.reason.trim() : "";

    seenNames.add(customEmojiName);
    suggestions.push({
      customEmojiName,
      standardEmojis,
      reason,
    });
  }

  return suggestions;
}

/**
 * Analyzes guild custom emojis in batches using the configured multimodal GenAI provider
 * and returns validated suggestions mapping each custom emoji to standard Unicode emojis.
 */
export async function suggestEmojiMappings(
  options: SuggestEmojiMappingsOptions,
): Promise<EmojiAiSuggestion[]> {
  const { emojis, existingMapping } = options;
  if (emojis.length === 0) {
    return [];
  }

  const genAi = getGenAi({ temperature: 0.2 });
  await genAi.init();

  const batches = chunkArray(emojis, EMOJI_AI_BATCH_SIZE);
  const allSuggestions: EmojiAiSuggestion[] = [];

  for (const batch of batches) {
    const preparedItems: PreparedBatchItem[] = await Promise.all(
      batch.map(async (emoji) => ({
        emoji,
        thumbnail: await fetchEmojiThumbnail(emoji),
      })),
    );

    const { text, files } = buildBatchPrompt(preparedItems, existingMapping);
    const response = await genAi.generate({
      text,
      files: files.length > 0 ? files : undefined,
    });

    const allowedNames = new Set(batch.map((emoji) => emoji.name));
    const batchSuggestions = parseEmojiSuggestions(
      response.content,
      allowedNames,
    );
    allSuggestions.push(...batchSuggestions);
  }

  return allSuggestions;
}
