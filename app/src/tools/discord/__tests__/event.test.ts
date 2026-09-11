import { describe, expect, it, vi } from "vitest";
import type { ToolExecutionContext } from "../../types";
import { discordGetScheduledEventsTool } from ".././event";

describe("discord_get_scheduled_events", () => {
  const mockEvent = {
    id: "event-1",
    name: "Community Game Night",
    description: "Playing Palworld together!",
    scheduledStartAt: new Date("2026-09-12T20:00:00Z"),
    scheduledEndAt: new Date("2026-09-12T23:00:00Z"),
    status: 1, // Scheduled
    userCount: 15,
    channelId: "voice-1",
    creator: {
      id: "u-creator",
      username: "bluegon",
    },
  };

  const mockGuild = {
    scheduledEvents: {
      fetch: vi.fn().mockResolvedValue(new Map([["event-1", mockEvent]])),
    },
  };

  const context: ToolExecutionContext = {
    botId: "bot-1",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    guild: mockGuild as any,
  };

  it("should fetch scheduled events on the server", async () => {
    const result = await discordGetScheduledEventsTool.execute({}, context);
    expect(result.count).toBe(1);
    expect(result.events[0]).toMatchObject({
      id: "event-1",
      name: "Community Game Night",
      description: "Playing Palworld together!",
      userCount: 15,
      creator: {
        username: "bluegon",
      },
    });
  });
});
