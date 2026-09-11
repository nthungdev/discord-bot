import { describe, it, expect, vi } from "vitest";
import {
  getPreviousMonthStart,
  getPreviousMonthEnd,
  getCurrentMonthStart,
  formatCheckInLeaderboard,
} from "./checkIn";
import { Config, ConfigParameter } from "../../../config";

describe("checkIn utilities", () => {
  it("should calculate correct date boundaries", () => {
    const prevStart = getPreviousMonthStart();
    const prevEnd = getPreviousMonthEnd();
    const currentStart = getCurrentMonthStart();

    expect(prevStart).toBeInstanceOf(Date);
    expect(prevEnd).toBeInstanceOf(Date);
    expect(currentStart).toBeInstanceOf(Date);
    expect(currentStart.getDate()).toBe(1);
    expect(prevStart.getDate()).toBe(1);
  });

  it("should format empty leaderboard as empty string", () => {
    const result = formatCheckInLeaderboard(new Date(), new Date(), []);
    expect(result).toBe("");
  });

  it("should format populated leaderboard", () => {
    vi.spyOn(Config.prototype, "getConfigValue").mockImplementation((param) => {
      if (param === ConfigParameter.checkInLeaderboard) {
        return "Báo cáo: {longestStreakUser} {totalCheckIns} {streaks} {counts}";
      }
      return "" as never;
    });

    const sampleLeaderboard = [
      [
        "123456",
        {
          count: 5,
          messages: ["did exercise"],
          longestStreak: 3,
          lastCheckIn: new Date(),
          currentStreak: 2,
          username: "alice",
        },
      ],
    ] as Parameters<typeof formatCheckInLeaderboard>[2];

    const result = formatCheckInLeaderboard(
      new Date(2026, 7, 1),
      new Date(2026, 7, 31),
      sampleLeaderboard,
    );

    expect(result).toContain("<@123456>");
    expect(result).toContain("5");
  });
});
