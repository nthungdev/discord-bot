import { describe, it, expect, vi } from "vitest";
import {
  censorMessage,
  buildRegexFromTerms,
  getRandomPoliceGif,
  getWordleAnswers,
} from "./utils";
import * as wordleUtils from "../../utils/wordle";

describe("police-bot utils", () => {
  describe("getRandomPoliceGif", () => {
    it("should return a string containing a tenor gif url", () => {
      const gif = getRandomPoliceGif();
      expect(typeof gif).toBe("string");
      expect(gif).toContain("tenor.com");
    });
  });

  describe("buildRegexFromTerms", () => {
    it("should match terms accurately with unicode and ignore-case flags", () => {
      const regex1 = buildRegexFromTerms(["badword"]);
      expect(regex1.test("This is a badword here")).toBe(true);

      const regex2 = buildRegexFromTerms([/custom\d+/]);
      expect(regex2.test("This is a custom123 here")).toBe(true);

      const regex3 = buildRegexFromTerms(["badword"]);
      expect(regex3.test("Clean sentence")).toBe(false);
    });
  });

  describe("censorMessage", () => {
    it("should censor matching violation terms with solid block character", () => {
      const violations = [
        {
          reason: "bad word",
          terms: ["badword"],
        },
      ];

      const result = censorMessage("You are a badword", violations);
      expect(result).toBe("You are a ▓▓▓▓▓▓▓");
    });
  });

  describe("getWordleAnswers", () => {
    it("should fetch wordle solutions for today, yesterday, and tomorrow", async () => {
      vi.spyOn(wordleUtils, "getAnswer").mockResolvedValue("REACT");

      const answers = await getWordleAnswers();
      expect(answers).toEqual(["REACT", "REACT", "REACT"]);
    });
  });
});
