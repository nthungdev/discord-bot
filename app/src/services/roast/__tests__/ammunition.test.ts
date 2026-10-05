import { describe, expect, it } from "vitest";
import {
  buildAmmunitionPrompt,
  calculateTenure,
  extractCurrentActivity,
  extractTopRoles,
  sanitizeMessageContent,
} from "../ammunition";
import { RoastIntensity, type RoastRequest } from "../types";

describe("Roast Ammunition Pipeline", () => {
  describe("calculateTenure", () => {
    it("should handle unknown joinedAt", () => {
      expect(calculateTenure(null, "vi")).toBe("không rõ");
      expect(calculateTenure(undefined, "en-US")).toBe("unknown");
    });

    it("should format tenure under 1 day", () => {
      const now = new Date();
      expect(calculateTenure(now, "vi")).toBe("mới vào hôm nay");
      expect(calculateTenure(now, "en-US")).toBe("just joined today");
    });

    it("should format tenure under 30 days", () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      expect(calculateTenure(tenDaysAgo, "vi")).toBe("mới vào 10 ngày");
      expect(calculateTenure(tenDaysAgo, "en-US")).toBe("joined 10 days ago");
    });

    it("should format tenure under 365 days", () => {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      expect(calculateTenure(ninetyDaysAgo, "vi")).toBe(
        "vào server được 3 tháng",
      );
      expect(calculateTenure(ninetyDaysAgo, "en-US")).toBe(
        "in server for 3 months",
      );
    });

    it("should format tenure over 1 year", () => {
      const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);
      expect(calculateTenure(twoYearsAgo, "vi")).toBe(
        "thành viên kỳ cựu 2.0 năm",
      );
      expect(calculateTenure(twoYearsAgo, "en-US")).toBe(
        "veteran member of 2.0 years",
      );
    });
  });

  describe("sanitizeMessageContent", () => {
    it("should strip URLs", () => {
      const raw =
        "Look at this https://malicious.link/payload and https://google.com for more info";
      expect(sanitizeMessageContent(raw)).toBe(
        "Look at this and for more info",
      );
    });

    it("should strip user and channel mentions", () => {
      const raw = "Hey <@12345> check <#98765> and <@&11111>";
      expect(sanitizeMessageContent(raw)).toBe("Hey check and");
    });

    it("should truncate long messages", () => {
      const longMsg = "a".repeat(200);
      const sanitized = sanitizeMessageContent(longMsg, 150);
      expect(sanitized.length).toBe(153); // 150 chars + "..."
      expect(sanitized.endsWith("...")).toBe(true);
    });
  });

  describe("extractTopRoles", () => {
    it("should filter @everyone and admin roles and limit to 3", () => {
      const mockMember = {
        roles: {
          cache: [
            { name: "@everyone", permissions: { has: () => false } },
            { name: "Admin", permissions: { has: () => true } },
            { name: "Viper Main", permissions: { has: () => false } },
            { name: "Frontend Dev", permissions: { has: () => false } },
            { name: "Night Owl", permissions: { has: () => false } },
            { name: "Extra Role", permissions: { has: () => false } },
          ],
        },
      };

      // @ts-expect-error partial mock
      const roles = extractTopRoles(mockMember, 3);
      expect(roles).toEqual(["Viper Main", "Frontend Dev", "Night Owl"]);
    });
  });

  describe("extractCurrentActivity", () => {
    it("should extract activity name and state", () => {
      const mockMember = {
        presence: {
          activities: [
            { name: "League of Legends", state: "In Game (Ranked)" },
          ],
        },
      };

      // @ts-expect-error partial mock
      expect(extractCurrentActivity(mockMember)).toBe(
        "League of Legends (In Game (Ranked))",
      );
    });

    it("should return null if no activities", () => {
      const mockMember = {
        presence: {
          activities: [],
        },
      };

      // @ts-expect-error partial mock
      expect(extractCurrentActivity(mockMember)).toBe(null);
    });
  });

  describe("buildAmmunitionPrompt", () => {
    const mockRequest: RoastRequest = {
      guildId: "guild-1",
      channelId: "chan-1",
      locale: "vi",
      caller: { id: "caller-1", username: "alice", displayName: "Alice" },
      target: {
        id: "target-1",
        username: "bob",
        displayName: "Bob",
        joinedAt: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000),
        roles: ["Gamer", "Dev"],
        activity: "Valorant",
      },
      intensity: RoastIntensity.Savage,
      topic: "feed 0/10",
    };

    it("should build structured Vietnamese ammunition prompt", () => {
      const prompt = buildAmmunitionPrompt(mockRequest, [
        "hello team",
        "i missed",
      ]);
      expect(prompt).toContain(
        "Mục tiêu: Bob (tên tài khoản: bob, Discord ID: target-1)",
      );
      expect(prompt).toContain("Vai trò nổi bật: Gamer, Dev");
      expect(prompt).toContain("Hoạt động / Game đang chơi: Valorant");
      expect(prompt).toContain('1. "hello team"');
      expect(prompt).toContain(
        'Chủ đề / Phốt cụ thể cần chan (ưu tiên cao): "feed 0/10"',
      );
      expect(prompt).toContain("<@target-1>");
    });

    it("should build structured English ammunition prompt", () => {
      const enRequest = { ...mockRequest, locale: "en-US" as const };
      const prompt = buildAmmunitionPrompt(enRequest, ["hello team"]);
      expect(prompt).toContain(
        "Target: Bob (username: bob, Discord ID: target-1)",
      );
      expect(prompt).toContain("Prominent roles: Gamer, Dev");
      expect(prompt).toContain(
        'Specific focus topic / blunder (high priority): "feed 0/10"',
      );
      expect(prompt).toContain("<@target-1>");
    });

    it("should handle inactive target with zero messages gracefully", () => {
      const prompt = buildAmmunitionPrompt(mockRequest, []);
      expect(prompt).toContain(
        "Mục tiêu không có tin nhắn gần đây nào trong kênh này",
      );
    });
  });
});
