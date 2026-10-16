import type {
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  User,
} from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getVoiceManager } from "../../../../services/voice/voice-manager";
import { data, execute } from "../companion";

vi.mock("../../../../services/voice/voice-manager", () => {
  const mockManager = {
    joinChannel: vi.fn().mockResolvedValue({}),
    leaveChannel: vi.fn().mockReturnValue(true),
    pauseSession: vi.fn().mockReturnValue(true),
    resumeSession: vi.fn().mockReturnValue(true),
    optOutUser: vi.fn(),
    getStats: vi.fn().mockReturnValue({
      guildId: "guild-1",
      channelId: "vc-1",
      status: "ACTIVE",
      participationMode: "ambient",
      uptimeSeconds: 150,
      bargeInCount: 2,
      turnsCount: 5,
      packetsReceived: 200,
      packetsSent: 180,
      activeSpeakersCount: 3,
    }),
  };
  return {
    getVoiceManager: vi.fn(() => mockManager),
  };
});

vi.mock("../../../../config", () => ({
  Config: {
    getInstance: vi.fn().mockReturnValue({
      getBotGuildConfig: vi.fn().mockReturnValue({
        voiceCompanion: { enabled: true },
      }),
    }),
  },
  ConfigParameter: {
    bots: "bots",
  },
}));

describe("/voice Slash Command", () => {
  let mockInteraction: ChatInputCommandInteraction;
  const mockReply = vi.fn();
  const mockDeferReply = vi.fn();
  const mockEditReply = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockInteraction = {
      guild: {
        id: "guild-1",
      } as unknown as Guild,
      user: {
        id: "user-1",
      } as unknown as User,
      reply: mockReply,
      deferReply: mockDeferReply,
      editReply: mockEditReply,
      options: {
        getSubcommand: vi.fn(),
        getChannel: vi.fn(),
        getBoolean: vi.fn(),
      } as unknown as ChatInputCommandInteraction["options"],
    } as unknown as ChatInputCommandInteraction;
  });

  it("should define slash command data correctly", () => {
    expect(data.name).toBe("voice");
    expect(data.description).toBeDefined();
    expect(data.options.length).toBeGreaterThan(0);
  });

  it("should handle /voice join when user is in a voice channel", async () => {
    vi.mocked(mockInteraction.options?.getSubcommand)?.mockReturnValue("join");
    mockInteraction.member = {
      voice: { channel: { id: "vc-1" } },
    } as unknown as GuildMember;

    await execute(mockInteraction as ChatInputCommandInteraction);

    expect(mockDeferReply).toHaveBeenCalledTimes(1);
    expect(getVoiceManager().joinChannel).toHaveBeenCalled();
    expect(mockEditReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Joined voice channel"),
      }),
    );
  });

  it("should reject /voice join if caller is not in voice and no channel passed", async () => {
    vi.mocked(mockInteraction.options?.getSubcommand)?.mockReturnValue("join");
    mockInteraction.member = {
      voice: { channel: null },
    } as unknown as GuildMember;
    vi.mocked(mockInteraction.options?.getChannel)?.mockReturnValue(null);

    await execute(mockInteraction as ChatInputCommandInteraction);

    expect(mockReply).toHaveBeenCalledWith({
      content:
        "You must be in a voice channel or specify a `channel` option to join.",
      ephemeral: true,
    });
  });

  it("should handle /voice leave", async () => {
    vi.mocked(mockInteraction.options?.getSubcommand)?.mockReturnValue("leave");

    await execute(mockInteraction as ChatInputCommandInteraction);

    expect(getVoiceManager().leaveChannel).toHaveBeenCalledWith("guild-1");
    expect(mockReply).toHaveBeenCalledWith({
      content: "👋 Disconnected from voice channel.",
      ephemeral: true,
    });
  });

  it("should handle /voice pause and resume", async () => {
    vi.mocked(mockInteraction.options?.getSubcommand)?.mockReturnValue("pause");
    await execute(mockInteraction as ChatInputCommandInteraction);
    expect(getVoiceManager().pauseSession).toHaveBeenCalledWith("guild-1");

    vi.mocked(mockInteraction.options?.getSubcommand)?.mockReturnValue(
      "resume",
    );
    await execute(mockInteraction as ChatInputCommandInteraction);
    expect(getVoiceManager().resumeSession).toHaveBeenCalledWith("guild-1");
  });

  it("should handle /voice status", async () => {
    vi.mocked(mockInteraction.options?.getSubcommand)?.mockReturnValue(
      "status",
    );

    await execute(mockInteraction as ChatInputCommandInteraction);

    expect(getVoiceManager().getStats).toHaveBeenCalledWith("guild-1");
    expect(mockReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.any(Array),
      }),
    );
  });

  it("should handle /voice opt-out", async () => {
    vi.mocked(mockInteraction.options?.getSubcommand)?.mockReturnValue(
      "opt-out",
    );
    vi.mocked(mockInteraction.options?.getBoolean)?.mockReturnValue(true);

    await execute(mockInteraction as ChatInputCommandInteraction);

    expect(getVoiceManager().optOutUser).toHaveBeenCalledWith(
      "guild-1",
      "user-1",
      true,
    );
    expect(mockReply).toHaveBeenCalledWith({
      content: expect.stringContaining("opted out"),
      ephemeral: true,
    });
  });
});
