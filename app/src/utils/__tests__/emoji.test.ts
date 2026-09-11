import { describe, it, expect } from "vitest";
import { replaceEmojis, splitEndingEmojis } from "./emoji";

describe("emoji utils", () => {
  describe("replaceEmojis", () => {
    it("should replace matching emojis with custom formatted emojis", () => {
      const emojiMap = {
        "😀": ["123456789"],
      };

      const result = replaceEmojis("Hello 😀 world", emojiMap);
      expect(result).toBe("Hello <:_:\x3123456789> world");
    });

    it("should return original text if no emojis match", () => {
      const emojiMap = {
        "😀": ["123456789"],
      };

      const result = replaceEmojis("Hello world", emojiMap);
      expect(result).toBe("Hello world");
    });
  });

  describe("splitEndingEmojis", () => {
    it("should split custom ending emojis from text", () => {
      const text = "Great job! <:_:\x3123456789>";
      const result = splitEndingEmojis(text);
      expect(result).toHaveLength(2);
      expect(result[0]).toBe("Great job! ");
      expect(result[1]).toBe("<:_:\x3123456789>");
    });

    it("should return original text in single-element array if no custom ending emoji exists", () => {
      const text = "Great job!";
      const result = splitEndingEmojis(text);
      expect(result).toEqual(["Great job!"]);
    });
  });
});
