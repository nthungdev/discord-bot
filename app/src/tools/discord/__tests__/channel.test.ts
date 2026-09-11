import { ChannelType } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { ToolExecutionContext } from "../../types";
import {
  discordGetChannelInfoTool,
  discordGetChannelMembersTool,
  discordListChannelsTool,
} from ".././channel";

describe("Discord Channel Tools", () => {
  const channelGeneral = {
    id: "chan-1",
    name: "general",
    type: ChannelType.GuildText,
    parentId: "cat-1",
    position: 1,
    topic: "General discussions",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    nsfw: false,
    rateLimitPerUser: 0,
    isTextBased: () => true,
  };

  const channelVoice = {
    id: "chan-2",
    name: "Lounge",
    type: ChannelType.GuildVoice,
    parentId: "cat-1",
    position: 2,
    topic: null,
    createdAt: new Date("2024-01-02T00:00:00Z"),
    nsfw: false,
    rateLimitPerUser: 0,
    isTextBased: () => false,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelMap = new Map<string, any>([
    ["chan-1", channelGeneral],
    ["chan-2", channelVoice],
  ]);

  const mockGuild = {
    channels: {
      fetch: vi.fn().mockImplementation((id?: string) => {
        if (id) return Promise.resolve(channelMap.get(id) ?? null);
        return Promise.resolve(channelMap);
      }),
    },
  };

  const context: ToolExecutionContext = {
    botId: "bot-1",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    guild: mockGuild as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    channel: channelGeneral as any,
  };

  describe("discord_list_channels", () => {
    it("should list all channels by default", async () => {
      const result = await discordListChannelsTool.execute({}, context);
      expect(result.channels).toHaveLength(2);
      expect(result.channels[0]).toEqual({
        id: "chan-1",
        name: "general",
        type: "GuildText",
        parentId: "cat-1",
        position: 1,
      });
    });

    it("should filter text channels only", async () => {
      const result = await discordListChannelsTool.execute(
        { type: "text" },
        context,
      );
      expect(result.channels).toHaveLength(1);
      expect(result.channels[0].id).toBe("chan-1");
    });
  });

  describe("discord_get_channel_info", () => {
    it("should return info of current channel if no name or ID is provided", async () => {
      const result = await discordGetChannelInfoTool.execute({}, context);
      expect(result).toEqual({
        id: "chan-1",
        name: "general",
        type: "GuildText",
        topic: "General discussions",
        createdAt: "2024-01-01T00:00:00.000Z",
        nsfw: false,
        rateLimitPerUser: 0,
      });
    });

    it("should return info when queried by channel name", async () => {
      const result = await discordGetChannelInfoTool.execute(
        { channelIdOrName: "#general" },
        context,
      );
      expect(result.id).toBe("chan-1");
    });

    it("should throw error when channel is not found", async () => {
      await expect(
        discordGetChannelInfoTool.execute(
          { channelIdOrName: "secret-room" },
          context,
        ),
      ).rejects.toThrow("could not be found");
    });
  });

  describe("discord_get_channel_members", () => {
    const memberUser = {
      id: "user-1",
      user: { username: "alice", displayName: "Alice", bot: false },
      displayName: "Alice",
      nickname: null,
      roles: { cache: [{ id: "r1", name: "Member" }] },
    };

    const memberBot = {
      id: "user-2",
      user: { username: "botty", displayName: "Botty", bot: true },
      displayName: "Botty",
      nickname: "Bot Assistant",
      roles: { cache: [{ id: "r2", name: "Bot Role" }] },
    };

    const channelWithMembers = {
      id: "chan-1",
      name: "general",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      members: new Map<string, any>([
        ["user-1", memberUser],
        ["user-2", memberBot],
      ]),
    };

    const memberContext: ToolExecutionContext = {
      botId: "bot-1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      channel: channelWithMembers as any,
    };

    it("should return all members in the channel", async () => {
      const result = await discordGetChannelMembersTool.execute(
        {},
        memberContext,
      );
      expect(result.count).toBe(2);
      expect(result.channelName).toBe("general");
      expect(result.members[0]).toMatchObject({
        id: "user-1",
        username: "alice",
        isBot: false,
      });
      expect(result.members[1]).toMatchObject({
        id: "user-2",
        username: "botty",
        isBot: true,
      });
    });

    it("should filter for bots only when botsOnly is true", async () => {
      const result = await discordGetChannelMembersTool.execute(
        { botsOnly: true },
        memberContext,
      );
      expect(result.count).toBe(1);
      expect(result.members[0].username).toBe("botty");
    });
  });
});
