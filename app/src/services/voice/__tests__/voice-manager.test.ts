import type { BaseGuildVoiceChannel, Guild, VoiceState } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceManager } from "../voice-manager";

vi.mock("../voice-session", () => {
  return {
    VoiceSession: class {
      guildId: string;
      channelId: string;
      constructor(config: { guildId: string; channelId: string }) {
        this.guildId = config.guildId;
        this.channelId = config.channelId;
      }
      start = vi.fn().mockResolvedValue(undefined);
      destroy = vi.fn();
      pause = vi.fn();
      resume = vi.fn();
      setOptOut = vi.fn();
      registerMember = vi.fn();
      onMemberCountChanged = vi.fn();
      on = vi.fn();
      getStats = vi.fn().mockReturnValue({
        guildId: "guild-1",
        channelId: "channel-1",
        status: "ACTIVE",
        uptimeSeconds: 120,
      });
    },
  };
});

describe("VoiceManager", () => {
  let manager: VoiceManager;
  const mockGuild = {
    id: "guild-1",
    client: { user: { id: "bot-id" } },
    channels: {
      cache: new Map(),
    },
  } as unknown as Guild;

  const mockChannel = {
    id: "channel-1",
    members: new Map(),
  } as unknown as BaseGuildVoiceChannel;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new VoiceManager();
  });

  it("should join channel and register active session", async () => {
    const session = await manager.joinChannel(mockGuild, mockChannel);
    expect(session.guildId).toBe("guild-1");
    expect(session.channelId).toBe("channel-1");

    expect(manager.getSession("guild-1")).toBe(session);
    expect(manager.getStats("guild-1")?.status).toBe("ACTIVE");
  });

  it("should reuse existing session if channel is unchanged", async () => {
    const session1 = await manager.joinChannel(mockGuild, mockChannel);
    const session2 = await manager.joinChannel(mockGuild, mockChannel);
    expect(session1).toBe(session2);
  });

  it("should destroy previous session when moving to different channel", async () => {
    const session1 = await manager.joinChannel(mockGuild, mockChannel);
    const mockChannel2 = {
      id: "channel-2",
    } as unknown as BaseGuildVoiceChannel;

    const session2 = await manager.joinChannel(mockGuild, mockChannel2);
    expect(session1.destroy).toHaveBeenCalledTimes(1);
    expect(session2.channelId).toBe("channel-2");
  });

  it("should leave channel and clean up session", async () => {
    await manager.joinChannel(mockGuild, mockChannel);
    expect(manager.getSession("guild-1")).toBeDefined();

    const result = manager.leaveChannel("guild-1");
    expect(result).toBe(true);
    expect(manager.getSession("guild-1")).toBeUndefined();
  });

  it("should delegate pause and resume to active session", async () => {
    const session = await manager.joinChannel(mockGuild, mockChannel);

    expect(manager.pauseSession("guild-1")).toBe(true);
    expect(session.pause).toHaveBeenCalledTimes(1);

    expect(manager.resumeSession("guild-1")).toBe(true);
    expect(session.resume).toHaveBeenCalledTimes(1);
  });

  it("should handle voiceStateUpdate when bot is disconnected from voice", async () => {
    const session = await manager.joinChannel(mockGuild, mockChannel);

    const oldState = {
      guild: mockGuild,
      channelId: "channel-1",
      id: "bot-id",
      member: { id: "bot-id" },
    } as unknown as VoiceState;

    const newState = {
      guild: mockGuild,
      channelId: null, // Disconnected
      id: "bot-id",
      member: { id: "bot-id" },
    } as unknown as VoiceState;

    manager.handleVoiceStateUpdate(oldState, newState);
    expect(session.destroy).toHaveBeenCalledTimes(1);
  });

  it("should handle voiceStateUpdate when bot is moved to a different channel by an admin", async () => {
    const session = await manager.joinChannel(mockGuild, mockChannel);

    const oldState = {
      guild: mockGuild,
      channelId: "channel-1",
      id: "bot-id",
    } as unknown as VoiceState;

    const newState = {
      guild: mockGuild,
      channelId: "channel-other",
      id: "bot-id",
    } as unknown as VoiceState;

    manager.handleVoiceStateUpdate(oldState, newState);
    expect(session.destroy).toHaveBeenCalledTimes(1);
  });

  it("should register member when a human joins the active voice channel", async () => {
    const session = (await manager.joinChannel(
      mockGuild,
      mockChannel,
    )) as unknown as { registerMember: ReturnType<typeof vi.fn> };

    const member = {
      id: "user-alice",
      user: { id: "user-alice", bot: false },
    };

    const oldState = {
      guild: mockGuild,
      channelId: null,
      id: "user-alice",
    } as unknown as VoiceState;

    const newState = {
      guild: mockGuild,
      channelId: "channel-1",
      id: "user-alice",
      member,
    } as unknown as VoiceState;

    manager.handleVoiceStateUpdate(oldState, newState);
    expect(session.registerMember).toHaveBeenCalledWith(member);
  });
});
