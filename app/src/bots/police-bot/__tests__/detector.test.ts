import { describe, expect, it } from "vitest";
import { buildRegexFromTerms, detectRacistViolations } from ".././detector";

describe("PoliceBot Racist Detector", () => {
  const testRegex = (regex: RegExp, text: string) => {
    regex.lastIndex = 0;
    return regex.test(text);
  };

  describe("createFlexiblePattern & buildRegexFromTerms", () => {
    it("should match exact terms case-insensitively", () => {
      const regex = buildRegexFromTerms(["nigger", "mọi đen"]);
      expect(testRegex(regex, "You are a nigger")).toBe(true);
      expect(testRegex(regex, "YOU ARE A NIGGER")).toBe(true);
      expect(testRegex(regex, "đồ mọi đen")).toBe(true);
      expect(testRegex(regex, "ĐỒ MỌI ĐEN")).toBe(true);
    });

    it("should match repeated characters", () => {
      const regex = buildRegexFromTerms(["nigger", "mọi đen"]);
      expect(testRegex(regex, "niiiigggggeeeerrrr")).toBe(true);
      expect(testRegex(regex, "mooiiiii đeeennn")).toBe(true);
    });

    it("should match characters separated by punctuation or spaces", () => {
      const regex = buildRegexFromTerms(["nigger", "mọi đen", "nigga"]);
      expect(testRegex(regex, "n.i.g.g.e.r")).toBe(true);
      expect(testRegex(regex, "n-i-g-g-a")).toBe(true);
      expect(testRegex(regex, "n_i_g_g_e_r")).toBe(true);
      expect(testRegex(regex, "n i g g e r")).toBe(true);
      expect(testRegex(regex, "m.o.i d.e.n")).toBe(true);
    });

    it("should match leetspeak substitutions", () => {
      const regex = buildRegexFromTerms(["nigger", "nigga"]);
      expect(testRegex(regex, "n1gg3r")).toBe(true);
      expect(testRegex(regex, "n!gg3r")).toBe(true);
      expect(testRegex(regex, "n1gga")).toBe(true);
    });
  });

  describe("English Racist Terms Detection", () => {
    it("should detect anti-Black slurs", () => {
      const texts = [
        "Hey nigger what are you doing",
        "Stop being a nigga",
        "Look at those negroes",
        "He called him a coon",
        "what a darky",
        "dirty jigaboo",
        "you tarbaby",
      ];

      for (const text of texts) {
        const violations = detectRacistViolations(text);
        expect(violations.length).toBeGreaterThan(0);
        expect(violations[0].reason).toBe("từ ngữ phân biệt chủng tộc");
      }
    });

    it("should detect anti-Asian slurs", () => {
      const texts = [
        "He is a chink",
        "dirty chinks in the game",
        "chinky eyes",
        "get out gook",
        "shut up slant eye",
        "stupid zipperhead",
        "defeat the jap soldier",
        "ching chong language",
      ];

      for (const text of texts) {
        const violations = detectRacistViolations(text);
        expect(violations.length).toBeGreaterThan(0);
      }
    });

    it("should detect anti-Hispanic and other racial slurs", () => {
      const texts = [
        "go back spic",
        "spick immigrant",
        "illegal wetback",
        "lazy beaner",
        "dirty kike",
        "get out raghead",
        "towelhead terrorist",
        "stupid paki",
      ];

      for (const text of texts) {
        const violations = detectRacistViolations(text);
        expect(violations.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Vietnamese Racist & Regional Hate Slurs Detection", () => {
    it("should detect accented Vietnamese racial slurs", () => {
      const texts = [
        "thằng mọi đen này",
        "lũ mọi da đen",
        "bọn mọi rợ",
        "đồ mọi miên",
        "bọn mọi hồi",
        "thằng mọi",
        "con mọi",
        "đồ mọi",
        "lũ mọi",
        "khỉ mọi",
        "đồ da đen bẩn thỉu",
      ];

      for (const text of texts) {
        const violations = detectRacistViolations(text);
        expect(violations.length).toBeGreaterThan(0);
        expect(violations[0].reason).toBe("từ ngữ phân biệt chủng tộc");
      }
    });

    it("should detect unaccented Vietnamese racial slurs", () => {
      const texts = [
        "thang moi den",
        "lu moi da den",
        "bon moi ro",
        "do moi mien",
        "bon moi hoi",
        "thang moi",
        "con moi",
        "do moi",
        "lu moi",
        "khi moi",
      ];

      for (const text of texts) {
        const violations = detectRacistViolations(text);
        expect(violations.length).toBeGreaterThan(0);
      }
    });

    it("should detect regional hate slurs in Vietnamese (accented & unaccented)", () => {
      const texts = [
        "đồ bắc kỳ chó",
        "do bac ky cho",
        "bọn bắc kì chó",
        "tụi bắc cầy",
        "tui bac cay",
        "đồ nam kỳ chó",
        "do nam ky cho",
        "bọn nam cầy",
        "tui nam cay",
        "bucky chó",
        "parky chó",
        "bake chó",
        "namke chó",
        "đồ tàu khựa",
        "bon tau khua",
        "tụi khựa",
        "bọn ba tàu",
      ];

      for (const text of texts) {
        const violations = detectRacistViolations(text);
        expect(violations.length).toBeGreaterThan(0);
      }
    });
  });

  describe("False Positive Prevention (The Scunthorpe problem)", () => {
    it("should NOT flag innocent common Vietnamese words containing 'mọi'", () => {
      const innocentTexts = [
        "Chào mọi người",
        "Chúc mọi người một ngày tốt lành",
        "Mọi lúc mọi nơi",
        "Mọi chuyện rồi sẽ ổn thôi",
        "Chúng ta cùng đến mọi nhà",
        "Cảm ơn mọi người rất nhiều",
        "mọi thứ đều ổn",
      ];

      for (const text of innocentTexts) {
        const violations = detectRacistViolations(text);
        expect(violations).toEqual([]);
      }
    });

    it("should NOT flag innocent English words containing substrings of slurs", () => {
      const innocentTexts = [
        "I am traveling to Nigeria next week",
        "The Republic of Niger is in West Africa",
        "Have a good night",
        "The knight rode into battle",
        "Do not snicker at him",
        "Please do not denigrate others",
        "I love traveling to Japan",
        "Japanese food is delicious",
        "I added jalapeno to my taco",
        "He acted in a suspicious manner",
        "His despicable behavior was noted",
        "I love spicy food and spice blends",
        "I found a great cookbook recipe",
        "Halloween was spooky",
        "The goalkeeper saved the ball",
        "A cute raccoon was outside",
        "The caterpillar made a cocoon",
        "The economy is recovering",
      ];

      for (const text of innocentTexts) {
        const violations = detectRacistViolations(text);
        expect(violations).toEqual([]);
      }
    });
  });

  describe("Edge cases & Input Handling", () => {
    it("should return empty array for empty or invalid input", () => {
      // @ts-expect-error testing invalid inputs
      expect(detectRacistViolations(null)).toEqual([]);
      // @ts-expect-error testing invalid inputs
      expect(detectRacistViolations(undefined)).toEqual([]);
      expect(detectRacistViolations("")).toEqual([]);
      expect(detectRacistViolations("   ")).toEqual([]);
    });

    it("should deduplicate matched terms", () => {
      const violations = detectRacistViolations("nigger nigger nigger");
      expect(violations.length).toBe(1);
      expect(violations[0].terms).toEqual(["nigger"]);
    });
  });
});
