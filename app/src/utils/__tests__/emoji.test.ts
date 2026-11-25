import type { Guild } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { Config, ConfigParameter } from "../../config";
import {
  getEmojiMap,
  type ResolvedCustomEmoji,
  replaceEmojis,
  splitEndingEmojis,
} from "../emoji";

function createMockGuild(
  guildId: string,
  cachedEmojis: { id: string; name: string | null; animated?: boolean }[],
): Guild {
  return {
    id: guildId,
    emojis: {
      cache: {
        find: (predicate: (emoji: { name: string | null }) => boolean) =>
          cachedEmojis.find(predicate),
      },
    },
  } as unknown as Guild;
}

describe("emoji utils", () => {
  describe("getEmojiMap", () => {
    it("should resolve static and animated custom emojis from guild cache", () => {
      vi.spyOn(Config.prototype, "getConfigValue").mockImplementation((key) => {
        if (key === ConfigParameter.guildEmojis) {
          return {
            "guild-1": {
              "😀": ["pepe_happy"],
              "🎉": ["party_parrot"],
            },
          } as never;
        }
        return {} as never;
      });

      const guild = createMockGuild("guild-1", [
        { id: "111111111111111111", name: "pepe_happy", animated: false },
        { id: "222222222222222222", name: "party_parrot", animated: true },
      ]);

      const map = getEmojiMap(guild);
      expect(map).toEqual({
        "😀": [
          { id: "111111111111111111", name: "pepe_happy", animated: false },
        ],
        "🎉": [
          { id: "222222222222222222", name: "party_parrot", animated: true },
        ],
      });
    });

    it("should skip deleted or unresolved custom emoji names", () => {
      vi.spyOn(Config.prototype, "getConfigValue").mockImplementation((key) => {
        if (key === ConfigParameter.guildEmojis) {
          return {
            "guild-1": {
              "😀": ["deleted_emoji", "valid_emoji"],
              "😢": ["only_deleted"],
            },
          } as never;
        }
        return {} as never;
      });

      const guild = createMockGuild("guild-1", [
        { id: "333333333333333333", name: "valid_emoji", animated: false },
      ]);

      const map = getEmojiMap(guild);
      expect(map).toEqual({
        "😀": [
          { id: "333333333333333333", name: "valid_emoji", animated: false },
        ],
      });
      expect(map["😢"]).toBeUndefined();
    });

    it("should return an empty map when guild has no configured emojis", () => {
      vi.spyOn(Config.prototype, "getConfigValue").mockImplementation(
        () => ({}) as never,
      );

      const guild = createMockGuild("unknown-guild", []);
      expect(getEmojiMap(guild)).toEqual({});
    });
  });

  describe("replaceEmojis", () => {
    it("should preserve backwards compatibility with string ID arrays", () => {
      const emojiMap = {
        "😀": ["123456789"],
      };

      const result = replaceEmojis("Hello 😀 world", emojiMap);
      expect(result).toBe("Hello <:emoji:123456789> world");
    });

    it("should return original text if no emojis match", () => {
      const emojiMap = {
        "😀": ["123456789"],
      };

      const result = replaceEmojis("Hello world", emojiMap);
      expect(result).toBe("Hello world");
    });

    it("should replace multi-codepoint Unicode emojis accurately", () => {
      const emojiMap: Record<string, ResolvedCustomEmoji[]> = {
        "❤️": [{ id: "100000000000000001", name: "heart", animated: false }],
        "🔥": [{ id: "100000000000000002", name: "fire", animated: true }],
        "👍🏽": [
          { id: "100000000000000003", name: "thumbsup", animated: false },
        ],
        "🤦‍♂️": [
          { id: "100000000000000004", name: "facepalm", animated: false },
        ],
      };

      expect(replaceEmojis("Love ❤️ this", emojiMap)).toBe(
        "Love <:heart:100000000000000001> this",
      );
      expect(replaceEmojis("Combo ❤️🔥!", emojiMap)).toBe(
        "Combo <:heart:100000000000000001><a:fire:100000000000000002>!",
      );
      expect(replaceEmojis("Nice 👍🏽 bro 🤦‍♂️", emojiMap)).toBe(
        "Nice <:thumbsup:100000000000000003> bro <:facepalm:100000000000000004>",
      );
    });

    it("should format animated and unnamed resolved custom emojis", () => {
      const emojiMap: Record<string, ResolvedCustomEmoji[]> = {
        "🎉": [{ id: "555555555555555555", name: "party", animated: true }],
        "⭐": [{ id: "666666666666666666", animated: true }],
      };

      expect(replaceEmojis("Celebrate 🎉 ⭐", emojiMap)).toBe(
        "Celebrate <a:party:555555555555555555> <a:emoji:666666666666666666>",
      );
    });

    it("should match emojis with or without variation selector-16 (U+FE0F)", () => {
      const emojiMap: Record<string, ResolvedCustomEmoji[]> = {
        "❤️": [{ id: "700000000000000001", name: "heart", animated: false }],
        "☠": [{ id: "700000000000000002", name: "skull", animated: false }],
      };

      // Text without U+FE0F matches map key with U+FE0F
      expect(replaceEmojis("Love \u2764 this", emojiMap)).toBe(
        "Love <:heart:700000000000000001> this",
      );
      // Text with U+FE0F matches map key without U+FE0F
      expect(replaceEmojis("Dead \u2620\uFE0F lol", emojiMap)).toBe(
        "Dead <:skull:700000000000000002> lol",
      );
    });
  });

  describe("splitEndingEmojis", () => {
    it("should split legacy underscore custom ending emojis from text", () => {
      const text = "Great job! <:_:123456789>";
      const result = splitEndingEmojis(text);
      expect(result).toHaveLength(2);
      expect(result[0]).toBe("Great job! ");
      expect(result[1]).toBe("<:_:123456789>");
    });

    it("should split named static and animated custom ending emojis", () => {
      const animated = splitEndingEmojis("Let's go <a:party_parrot:987654321>");
      expect(animated).toEqual(["Let's go ", "<a:party_parrot:987654321>"]);

      const namedStatic = splitEndingEmojis("Nice work <:pepe_ok:112233445>!");
      expect(namedStatic).toEqual(["Nice work !", "<:pepe_ok:112233445>"]);
    });

    it("should split multiple consecutive custom ending emojis", () => {
      const text = "Double hype <a:fire:111><:heart:222>";
      const result = splitEndingEmojis(text);
      expect(result).toEqual(["Double hype ", "<a:fire:111><:heart:222>"]);
    });

    it("should return original text in single-element array if no custom ending emoji exists", () => {
      const text = "Great job!";
      const result = splitEndingEmojis(text);
      expect(result).toEqual(["Great job!"]);
    });
  });
});
