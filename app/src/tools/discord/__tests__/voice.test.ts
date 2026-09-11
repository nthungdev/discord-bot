import { ChannelType } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { ToolExecutionContext } from "../../types";
import { discordGetVoiceChannelStateTool } from ".././voice";

describe("discord_get_voice_channel_state", () => {
  const memberAlice = {
    id: "user-1",
    user: { username: "alice", displayName: "Alice" },
    displayName: "Alice",
    nickname: null,
    voice: {
      mute: false,
      selfMute: true,
      deaf: false,
      selfDeaf: false,
      streaming: true,
    },
  };

  const memberBob = {
    id: "user-2",
    user: { username: "bob", displayName: "Bob" },
    displayName: "Bob",
    nickname: "Bobby",
    voice: {
      mute: false,
      selfMute: false,
      deaf: false,
      selfDeaf: false,
      streaming: false,
    },
  };

  const channelVoice = {
    id: "vc-1",
    name: "Gaming Room",
    type: ChannelType.GuildVoice,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    members: new Map<string, any>([
      ["user-1", memberAlice],
      ["user-2", memberBob],
    ]),
  };

  const channelEmptyVoice = {
    id: "vc-2",
    name: "AFK",
    type: ChannelType.GuildVoice,
    members: new Map(),
  };

  const channelText = {
    id: "text-1",
    name: "general",
    type: ChannelType.GuildText,
  };

  const mockGuild = {
    channels: {
      fetch: vi.fn().mockResolvedValue(
        new Map([
          ["vc-1", channelVoice],
          ["vc-2", channelEmptyVoice],
          ["text-1", channelText],
        ]),
      ),
    },
  };

  const context: ToolExecutionContext = {
    botId: "bot-1",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    guild: mockGuild as any,
  };

  it("should return active voice channels and connected members", async () => {
    const result = await discordGetVoiceChannelStateTool.execute({}, context);
    expect(result.totalConnected).toBe(2);
    expect(result.voiceChannels).toHaveLength(1);
    expect(result.voiceChannels[0]).toMatchObject({
      id: "vc-1",
      name: "Gaming Room",
      memberCount: 2,
    });
    expect(result.voiceChannels[0].members[0]).toMatchObject({
      id: "user-1",
      username: "alice",
      isMuted: true,
      isStreaming: true,
    });
  });

  it("should filter for a specific voice channel by name", async () => {
    const result = await discordGetVoiceChannelStateTool.execute(
      { channelIdOrName: "Gaming Room" },
      context,
    );
    expect(result.totalConnected).toBe(2);
    expect(result.voiceChannels[0].id).toBe("vc-1");
  });
});
