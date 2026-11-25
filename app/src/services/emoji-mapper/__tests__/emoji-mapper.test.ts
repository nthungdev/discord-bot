import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenAi } from "../../../genAi";
import type { AiPrompt } from "../../../types";
import { getGenAi } from "../../../utils/genAi";
import {
  buildSafeEmojiThumbnailUrl,
  EMOJI_AI_BATCH_SIZE,
  EMOJI_CDN_FETCH_TIMEOUT_MS,
  type GuildCustomEmojiInfo,
  MAX_STANDARD_EMOJIS_PER_CUSTOM,
  parseEmojiSuggestions,
  suggestEmojiMappings,
} from "../index";

vi.mock("axios");
vi.mock("../../../utils/genAi", () => ({
  getGenAi: vi.fn(),
}));

function makeEmoji(
  index: number,
  overrides: Partial<GuildCustomEmojiInfo> = {},
): GuildCustomEmojiInfo {
  const id = String(100000000000000000n + BigInt(index));
  return {
    id,
    name: `custom_emoji_${index}`,
    animated: false,
    url: `https://cdn.discordapp.com/emojis/${id}.png`,
    ...overrides,
  };
}

describe("emoji-mapper service", () => {
  const mockInit = vi.fn<() => Promise<void>>();
  const mockGenerate =
    vi.fn<(prompt: AiPrompt) => Promise<{ content: string }>>();

  beforeEach(() => {
    vi.clearAllMocks();
    mockInit.mockResolvedValue(undefined);
    vi.mocked(getGenAi).mockReturnValue({
      init: mockInit,
      generate: mockGenerate,
    } as unknown as GenAi);
  });

  describe("buildSafeEmojiThumbnailUrl", () => {
    it("should build a safe Discord CDN URL for valid snowflakes", () => {
      expect(buildSafeEmojiThumbnailUrl("123456789012345678")).toBe(
        "https://cdn.discordapp.com/emojis/123456789012345678.webp?size=128&animated=false",
      );
      expect(buildSafeEmojiThumbnailUrl("123456789012345678", "png")).toBe(
        "https://cdn.discordapp.com/emojis/123456789012345678.png?size=128&animated=false",
      );
    });

    it("should reject invalid snowflake IDs to prevent SSRF", () => {
      expect(buildSafeEmojiThumbnailUrl("../123456789012345678")).toBeNull();
      expect(buildSafeEmojiThumbnailUrl("12345")).toBeNull();
      expect(buildSafeEmojiThumbnailUrl("http://169.254.169.254")).toBeNull();
      expect(
        buildSafeEmojiThumbnailUrl("123456789012345678?evil=1"),
      ).toBeNull();
    });
  });

  describe("parseEmojiSuggestions", () => {
    it("should parse markdown-fenced JSON and cap standardEmojis to 3 unique values", () => {
      const raw = [
        "```json",
        JSON.stringify([
          {
            customEmojiName: "pepe_laugh",
            standardEmojis: ["😂", "🤣", "😂", "😆", "😹"],
            reason: "  Laughing Pepe expression.  ",
          },
          {
            customEmojiName: "not_in_batch",
            standardEmojis: ["🔥"],
            reason: "Hallucinated emoji",
          },
        ]),
        "```",
      ].join("\n");

      const allowed = new Set(["pepe_laugh"]);
      const parsed = parseEmojiSuggestions(raw, allowed);

      expect(parsed).toEqual([
        {
          customEmojiName: "pepe_laugh",
          standardEmojis: ["😂", "🤣", "😆"],
          reason: "Laughing Pepe expression.",
        },
      ]);
      expect(parsed[0].standardEmojis).toHaveLength(
        MAX_STANDARD_EMOJIS_PER_CUSTOM,
      );
    });

    it("should return an empty array for malformed JSON", () => {
      expect(parseEmojiSuggestions("not json at all", new Set(["a"]))).toEqual(
        [],
      );
    });
  });

  describe("suggestEmojiMappings", () => {
    it("should return empty array immediately when emojis list is empty", async () => {
      const result = await suggestEmojiMappings({ emojis: [] });
      expect(result).toEqual([]);
      expect(getGenAi).not.toHaveBeenCalled();
    });

    it("should batch emojis by EMOJI_AI_BATCH_SIZE and pass base64 thumbnails", async () => {
      const totalEmojis = EMOJI_AI_BATCH_SIZE + 2;
      const emojis = Array.from({ length: totalEmojis }, (_, i) =>
        makeEmoji(i + 1),
      );

      vi.mocked(axios.get).mockResolvedValue({
        data: Buffer.from("fake-webp-bytes"),
      });

      mockGenerate
        .mockResolvedValueOnce({
          content: JSON.stringify(
            emojis.slice(0, EMOJI_AI_BATCH_SIZE).map((e) => ({
              customEmojiName: e.name,
              standardEmojis: ["😀"],
              reason: `Reason for ${e.name}`,
            })),
          ),
        })
        .mockResolvedValueOnce({
          content: JSON.stringify(
            emojis.slice(EMOJI_AI_BATCH_SIZE).map((e) => ({
              customEmojiName: e.name,
              standardEmojis: ["🔥"],
              reason: `Reason for ${e.name}`,
            })),
          ),
        });

      const result = await suggestEmojiMappings({ emojis });

      expect(mockInit).toHaveBeenCalledTimes(1);
      expect(mockGenerate).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(totalEmojis);

      const firstPrompt = mockGenerate.mock.calls[0][0];
      expect(firstPrompt.files).toHaveLength(EMOJI_AI_BATCH_SIZE);
      expect(firstPrompt.files?.[0]).toEqual({
        mimeType: "image/webp",
        uri: `data:image/webp;base64,${Buffer.from("fake-webp-bytes").toString("base64")}`,
      });

      const secondPrompt = mockGenerate.mock.calls[1][0];
      expect(secondPrompt.files).toHaveLength(2);
    });

    it("should never fetch arbitrary emoji.url and reject invalid snowflakes", async () => {
      const invalidEmoji = makeEmoji(1, {
        id: "not-a-snowflake",
        name: "suspicious_emoji",
        url: "http://169.254.169.254/latest/meta-data/",
      });

      mockGenerate.mockResolvedValueOnce({
        content: JSON.stringify([
          {
            customEmojiName: "suspicious_emoji",
            standardEmojis: ["🤔"],
            reason: "Inferred from name.",
          },
        ]),
      });

      const result = await suggestEmojiMappings({ emojis: [invalidEmoji] });

      expect(axios.get).not.toHaveBeenCalled();
      expect(mockGenerate).toHaveBeenCalledTimes(1);
      expect(mockGenerate.mock.calls[0][0].files).toBeUndefined();
      expect(result).toEqual([
        {
          customEmojiName: "suspicious_emoji",
          standardEmojis: ["🤔"],
          reason: "Inferred from name.",
        },
      ]);
    });

    it("should fall back to PNG when WebP fails and still include emoji by name if all fetches fail", async () => {
      const emojiPngFallback = makeEmoji(1, { name: "png_only" });
      const emojiFailed = makeEmoji(2, { name: "broken_cdn" });

      vi.mocked(axios.get).mockImplementation(async (url) => {
        if (url.includes(emojiPngFallback.id) && url.includes(".webp")) {
          throw new Error("404 WebP");
        }
        if (url.includes(emojiPngFallback.id) && url.includes(".png")) {
          return { data: Buffer.from("fake-png-bytes") };
        }
        throw new Error("CDN timeout");
      });

      mockGenerate.mockResolvedValueOnce({
        content: JSON.stringify([
          {
            customEmojiName: "png_only",
            standardEmojis: ["🎉"],
            reason: "Festive image.",
          },
          {
            customEmojiName: "broken_cdn",
            standardEmojis: ["💔"],
            reason: "Inferred from broken_cdn name.",
          },
        ]),
      });

      const result = await suggestEmojiMappings({
        emojis: [emojiPngFallback, emojiFailed],
      });

      expect(axios.get).toHaveBeenCalledWith(
        `https://cdn.discordapp.com/emojis/${emojiPngFallback.id}.webp?size=128&animated=false`,
        {
          responseType: "arraybuffer",
          timeout: EMOJI_CDN_FETCH_TIMEOUT_MS,
        },
      );
      expect(axios.get).toHaveBeenCalledWith(
        `https://cdn.discordapp.com/emojis/${emojiPngFallback.id}.png?size=128&animated=false`,
        {
          responseType: "arraybuffer",
          timeout: EMOJI_CDN_FETCH_TIMEOUT_MS,
        },
      );

      const promptArg = mockGenerate.mock.calls[0][0];
      expect(promptArg.files).toEqual([
        {
          mimeType: "image/png",
          uri: `data:image/png;base64,${Buffer.from("fake-png-bytes").toString("base64")}`,
        },
      ]);
      expect(promptArg.text).toContain('"png_only"');
      expect(promptArg.text).toContain('"broken_cdn"');
      expect(result).toHaveLength(2);
    });
  });
});
