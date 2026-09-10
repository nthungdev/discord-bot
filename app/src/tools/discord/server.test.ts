import { describe, it, expect, vi } from "vitest";
import {
  discordGetServerInfoTool,
  discordGetServerOwnerTool,
} from "./server";
import { ToolExecutionContext } from "../types";

describe("Discord Server Tools", () => {
  const mockGuild = {
    id: "guild-123",
    name: "Test Guild",
    description: "A cool server",
    memberCount: 42,
    ownerId: "owner-999",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    premiumTier: 2,
    premiumSubscriptionCount: 7,
    roles: { cache: { size: 5 } },
    channels: { cache: { size: 10 } },
    fetchOwner: vi.fn().mockResolvedValue({
      id: "owner-999",
      user: {
        username: "superowner",
        displayName: "Super Owner",
      },
      nickname: "Captain",
      joinedAt: new Date("2024-01-01T00:00:00Z"),
    }),
  };

  const contextWithGuild: ToolExecutionContext = {
    botId: "bot-1",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    guild: mockGuild as any,
  };

  const contextWithoutGuild: ToolExecutionContext = {
    botId: "bot-1",
    guild: null,
  };

  describe("discord_get_server_info", () => {
    it("should report availability correctly", () => {
      expect(discordGetServerInfoTool.isAvailable?.(contextWithGuild)).toBe(true);
      expect(discordGetServerInfoTool.isAvailable?.(contextWithoutGuild)).toBe(false);
    });

    it("should return server metadata when executed", async () => {
      const result = await discordGetServerInfoTool.execute({}, contextWithGuild);
      expect(result).toEqual({
        id: "guild-123",
        name: "Test Guild",
        description: "A cool server",
        memberCount: 42,
        ownerId: "owner-999",
        createdAt: "2024-01-01T00:00:00.000Z",
        boostLevel: 2,
        premiumSubscriptionCount: 7,
        rolesCount: 5,
        channelsCount: 10,
      });
    });

    it("should throw error if guild is missing in execution", async () => {
      await expect(
        discordGetServerInfoTool.execute({}, contextWithoutGuild),
      ).rejects.toThrow("No Discord guild context available.");
    });
  });

  describe("discord_get_server_owner", () => {
    it("should fetch and return owner info", async () => {
      const result = await discordGetServerOwnerTool.execute({}, contextWithGuild);
      expect(mockGuild.fetchOwner).toHaveBeenCalled();
      expect(result).toEqual({
        ownerId: "owner-999",
        username: "superowner",
        displayName: "Super Owner",
        nickname: "Captain",
        joinedAt: "2024-01-01T00:00:00.000Z",
      });
    });

    it("should throw error if guild is missing in execution", async () => {
      await expect(
        discordGetServerOwnerTool.execute({}, contextWithoutGuild),
      ).rejects.toThrow("No Discord guild context available.");
    });
  });
});
