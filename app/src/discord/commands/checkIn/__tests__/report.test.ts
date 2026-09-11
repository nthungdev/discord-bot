import { describe, it, expect, vi } from "vitest";
import { data, execute } from "./report";
import { createMockInteraction } from "../../../../tests/fixtures/discord";
import * as checkInUtils from "../utilities/checkIn";

vi.mock("../utilities/checkIn", () => ({
  countCheckInsInChannel: vi.fn().mockResolvedValue([["user-1", { count: 5, longestStreak: 3 }]]),
  formatCheckInLeaderboard: vi.fn().mockReturnValue("Leaderboard Summary Report"),
  getPreviousMonthStart: vi.fn().mockReturnValue(new Date()),
  getPreviousMonthEnd: vi.fn().mockReturnValue(new Date()),
  getCurrentMonthStart: vi.fn().mockReturnValue(new Date()),
}));

describe("checkin-report command", () => {
  it("should have valid command metadata", () => {
    expect(data.name).toBe("checkin-report");
  });

  it("should display report options and handle current month selection", async () => {
    const confirmationMock = {
      customId: "current-month",
      deferUpdate: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    };

    const interaction = createMockInteraction({
      reply: vi.fn().mockResolvedValue({
        awaitMessageComponent: vi.fn().mockResolvedValue(confirmationMock),
      }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(checkInUtils.countCheckInsInChannel).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Leaderboard Summary Report",
      components: [],
    });
  });

  it("should handle cancel action", async () => {
    const confirmationMock = {
      customId: "cancel",
      deferUpdate: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    };

    const interaction = createMockInteraction({
      reply: vi.fn().mockResolvedValue({
        awaitMessageComponent: vi.fn().mockResolvedValue(confirmationMock),
      }),
    });

    await execute(interaction);

    expect(confirmationMock.update).toHaveBeenCalledWith({
      content: "Huỷ tạo báo cáo",
      components: [],
    });
  });
});
