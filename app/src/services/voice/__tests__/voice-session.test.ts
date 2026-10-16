import { EventEmitter } from "node:events";
import type { BaseGuildVoiceChannel, Guild, GuildMember } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IStreamingGenAiSession } from "../streaming/types";
import { VoiceSession } from "../voice-session";

const mockAudioPlayer = {
  play: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  unpause: vi.fn(),
  on: vi.fn(),
  state: { status: "idle" },
};

const mockSpeaking = Object.assign(new EventEmitter(), {
  users: new Map<string, number>(),
});

const mockVoiceConnection = {
  subscribe: vi.fn(),
  destroy: vi.fn(),
  on: vi.fn(),
  receiver: {
    speaking: mockSpeaking,
    subscribe: vi.fn(),
  },
};

vi.mock("@discordjs/voice", () => ({
  joinVoiceChannel: vi.fn(() => mockVoiceConnection),
  createAudioPlayer: vi.fn(() => mockAudioPlayer),
  createAudioResource: vi.fn(() => ({})),
  entersState: vi.fn().mockResolvedValue(undefined),
  AudioPlayerStatus: {
    Idle: "idle",
    Playing: "playing",
    Paused: "paused",
  },
  VoiceConnectionStatus: {
    Ready: "ready",
    Disconnected: "disconnected",
  },
  NoSubscriberBehavior: {
    Play: "play",
  },
  StreamType: {
    Raw: "raw",
  },
  EndBehaviorType: {
    AfterSilence: "afterSilence",
  },
}));

class MockStreamingSession
  extends EventEmitter
  implements IStreamingGenAiSession
{
  connect = vi.fn().mockResolvedValue(undefined);
  sendAudioChunk = vi.fn();
  sendClientContent = vi.fn();
  sendToolResponse = vi.fn();
  close = vi.fn().mockResolvedValue(undefined);
  isConnected = vi.fn().mockReturnValue(true);
}

describe("VoiceSession", () => {
  let mockLiveSession: MockStreamingSession;
  const mockGuild = {
    id: "guild-1",
    voiceAdapterCreator: vi.fn(),
    client: {
      user: { id: "bot-user-1" },
    },
  } as unknown as Guild;

  const mockChannel = {
    id: "channel-1",
    members: new Map(),
  } as unknown as BaseGuildVoiceChannel;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLiveSession = new MockStreamingSession();
  });

  it("should initialize with IDLE status and correct guild/channel identifiers", () => {
    const session = new VoiceSession(
      { guildId: "guild-1", channelId: "channel-1" },
      mockLiveSession,
    );

    const stats = session.getStats();
    expect(stats.guildId).toBe("guild-1");
    expect(stats.channelId).toBe("channel-1");
    expect(stats.status).toBe("IDLE");
  });

  it("should transition to ACTIVE when started successfully", async () => {
    const session = new VoiceSession(
      { guildId: "guild-1", channelId: "channel-1" },
      mockLiveSession,
    );

    await session.start(mockGuild, mockChannel);
    expect(session.getStats().status).toBe("ACTIVE");
    expect(mockLiveSession.connect).toHaveBeenCalledTimes(1);
    expect(mockVoiceConnection.subscribe).toHaveBeenCalledWith(mockAudioPlayer);
  });

  it("should trigger instant barge-in and purge audio player (<20ms)", async () => {
    const session = new VoiceSession(
      { guildId: "guild-1", channelId: "channel-1" },
      mockLiveSession,
    );
    await session.start(mockGuild, mockChannel);

    session.triggerInstantBargeIn("user-speaker-1");
    expect(mockAudioPlayer.stop).toHaveBeenCalledWith(true);
    expect(session.getStats().bargeInCount).toBe(1);
    expect(mockLiveSession.sendClientContent).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          parts: [{ text: "[Interrupted by speaker]" }],
        }),
      ]),
      false,
    );
  });

  it("should pause and resume session playback", async () => {
    const session = new VoiceSession(
      { guildId: "guild-1", channelId: "channel-1" },
      mockLiveSession,
    );
    await session.start(mockGuild, mockChannel);

    session.pause();
    expect(session.getStats().status).toBe("PAUSED");
    expect(mockAudioPlayer.pause).toHaveBeenCalledTimes(1);

    session.resume();
    expect(session.getStats().status).toBe("ACTIVE");
    expect(mockAudioPlayer.unpause).toHaveBeenCalledTimes(1);
  });

  it("should clean up resources on destroy", async () => {
    const session = new VoiceSession(
      { guildId: "guild-1", channelId: "channel-1" },
      mockLiveSession,
    );
    await session.start(mockGuild, mockChannel);

    session.destroy();
    expect(session.getStats().status).toBe("DISCONNECTED");
    expect(mockAudioPlayer.stop).toHaveBeenCalledWith(true);
    expect(mockVoiceConnection.destroy).toHaveBeenCalledTimes(1);
    expect(mockLiveSession.close).toHaveBeenCalledTimes(1);
  });

  it("should create fresh jitter buffer for subsequent speech turns", async () => {
    const session = new VoiceSession(
      { guildId: "guild-1", channelId: "channel-1" },
      mockLiveSession,
    );
    await session.start(mockGuild, mockChannel);

    // Turn 1
    mockLiveSession.emit("audio", Buffer.alloc(960, 20));
    const firstJitter = session.getJitterBuffer();
    expect(firstJitter).not.toBeNull();

    // Turn 1 ends with barge-in
    session.triggerInstantBargeIn("user-1");
    expect(session.getJitterBuffer()).toBeNull();

    // In-flight audio chunks from the interrupted turn are suppressed
    mockLiveSession.emit("audio", Buffer.alloc(960, 25));
    expect(session.getJitterBuffer()).toBeNull();

    // Model confirms interruption or finishes turn
    mockLiveSession.emit("interrupted");

    // Turn 2 arrives
    mockLiveSession.emit("audio", Buffer.alloc(960, 30));
    const secondJitter = session.getJitterBuffer();
    expect(secondJitter).not.toBeNull();
    expect(secondJitter).not.toBe(firstJitter);
  });

  it("should dynamically register guild members with speaker tracker", async () => {
    const session = new VoiceSession(
      { guildId: "guild-1", channelId: "channel-1" },
      mockLiveSession,
    );
    await session.start(mockGuild, mockChannel);

    const newMember = {
      id: "new-user-1",
      displayName: "New Member",
      user: { id: "new-user-1", username: "newmember", bot: false },
    };

    session.registerMember(newMember as unknown as GuildMember);
    expect(session.getStats().activeSpeakersCount).toBe(1);
  });

  it("should destroy session when liveSession emits close event", async () => {
    const session = new VoiceSession(
      { guildId: "guild-1", channelId: "channel-1" },
      mockLiveSession,
    );
    await session.start(mockGuild, mockChannel);
    expect(session.getStats().status).toBe("ACTIVE");

    mockLiveSession.emit("close", 1000, "Normal closure");
    expect(session.getStats().status).toBe("DISCONNECTED");
  });

  it("should immediately clean up speaker stream and ignore frames when user opts out", async () => {
    const session = new VoiceSession(
      { guildId: "guild-1", channelId: "channel-1" },
      mockLiveSession,
    );
    await session.start(mockGuild, mockChannel);

    session.setOptOut("user-alice", true);
    expect(session.getStats().status).toBe("ACTIVE");

    // handleSpeakerStart should ignore opted out user
    session.handleSpeakerStart("user-alice");
    expect(mockVoiceConnection.receiver.subscribe).not.toHaveBeenCalledWith(
      "user-alice",
      expect.anything(),
    );
  });

  it("should configure addressed_only mode with specialized system instruction", async () => {
    const session = new VoiceSession(
      {
        guildId: "guild-1",
        channelId: "channel-1",
        participationMode: "addressed_only",
        systemInstruction: "Base prompt.",
      },
      mockLiveSession,
    );
    await session.start(mockGuild, mockChannel);

    expect(mockLiveSession.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInstruction: expect.stringContaining("addressed_only"),
      }),
    );
  });
});
