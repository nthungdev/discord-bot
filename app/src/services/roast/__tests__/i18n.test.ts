import { describe, expect, it } from "vitest";
import {
  formatDuration,
  INTENSITY_INSTRUCTIONS,
  INTENSITY_LABELS,
  ROAST_MESSAGES,
  resolveRoastLocale,
} from "../i18n";
import { RoastIntensity } from "../types";

describe("Roast i18n and Localization", () => {
  describe("resolveRoastLocale", () => {
    it("should resolve Vietnamese from user locale", () => {
      expect(resolveRoastLocale({ locale: "vi" })).toBe("vi");
      expect(resolveRoastLocale({ locale: "vi-VN" })).toBe("vi");
    });

    it("should resolve English from user locale", () => {
      expect(resolveRoastLocale({ locale: "en-US" })).toBe("en-US");
      expect(resolveRoastLocale({ locale: "en-GB" })).toBe("en-US");
    });

    it("should fall back to guild locale if user locale is unsupported", () => {
      expect(resolveRoastLocale({ locale: "ja", guildLocale: "en-US" })).toBe(
        "en-US",
      );
      expect(resolveRoastLocale({ locale: "fr", guildLocale: "vi" })).toBe(
        "vi",
      );
    });

    it("should fall back to guild config defaultLocale if guild and user locales are unsupported", () => {
      expect(
        resolveRoastLocale(
          { locale: "ja", guildLocale: "de" },
          // @ts-expect-error partial config
          { roast: { defaultLocale: "en-US" } },
        ),
      ).toBe("en-US");

      expect(
        resolveRoastLocale(
          { locale: "ja", guildLocale: "de" },
          // @ts-expect-error partial config
          { roast: { defaultLocale: "vi" } },
        ),
      ).toBe("vi");
    });

    it("should default to 'vi' as platform default", () => {
      expect(resolveRoastLocale()).toBe("vi");
      expect(resolveRoastLocale({ locale: "es", guildLocale: "es" })).toBe(
        "vi",
      );
    });
  });

  describe("formatDuration", () => {
    it("should format seconds correctly in Vietnamese", () => {
      expect(formatDuration(45, "vi")).toBe("45s");
      expect(formatDuration(60, "vi")).toBe("1p");
      expect(formatDuration(222, "vi")).toBe("3p 42s");
    });

    it("should format seconds correctly in English", () => {
      expect(formatDuration(45, "en-US")).toBe("45s");
      expect(formatDuration(60, "en-US")).toBe("1m");
      expect(formatDuration(222, "en-US")).toBe("3m 42s");
    });
  });

  describe("ROAST_MESSAGES", () => {
    it("should generate proper Vietnamese and English headers", () => {
      expect(ROAST_MESSAGES.vi.header("12345")).toBe(
        "🔥 **Slavegon chan <@12345>**",
      );
      expect(ROAST_MESSAGES["en-US"].header("12345")).toBe(
        "🔥 **Slavegon's Roast on <@12345>**",
      );
    });

    it("should generate proper Vietnamese and English footers with topic", () => {
      expect(ROAST_MESSAGES.vi.footer("999", "Cực gắt", "duyệt code")).toBe(
        "*(Yêu cầu bởi <@999> · Mức độ: Cực gắt · Chủ đề: duyệt code)*",
      );

      expect(
        ROAST_MESSAGES["en-US"].footer("999", "Savage", "code review"),
      ).toBe(
        "*(Requested by <@999> · Intensity: Savage · Topic: code review)*",
      );
    });

    it("should generate proper footers without topic", () => {
      expect(ROAST_MESSAGES.vi.footer("999", "Vừa phải", null)).toBe(
        "*(Yêu cầu bởi <@999> · Mức độ: Vừa phải)*",
      );
      expect(ROAST_MESSAGES["en-US"].footer("999", "Medium", null)).toBe(
        "*(Requested by <@999> · Intensity: Medium)*",
      );
    });

    it("should provide correct intensity labels", () => {
      expect(INTENSITY_LABELS.vi[RoastIntensity.Mild]).toBe("Nhẹ nhàng");
      expect(INTENSITY_LABELS.vi[RoastIntensity.Medium]).toBe("Vừa phải");
      expect(INTENSITY_LABELS.vi[RoastIntensity.Savage]).toBe("Cực gắt");

      expect(INTENSITY_LABELS["en-US"][RoastIntensity.Mild]).toBe("Mild");
      expect(INTENSITY_LABELS["en-US"][RoastIntensity.Medium]).toBe("Medium");
      expect(INTENSITY_LABELS["en-US"][RoastIntensity.Savage]).toBe("Savage");
    });

    it("should provide intensity instructions for both locales", () => {
      expect(INTENSITY_INSTRUCTIONS.vi[RoastIntensity.Savage]).toContain(
        "Cực gắt",
      );
      expect(INTENSITY_INSTRUCTIONS["en-US"][RoastIntensity.Savage]).toContain(
        "Savage",
      );
    });
  });
});
