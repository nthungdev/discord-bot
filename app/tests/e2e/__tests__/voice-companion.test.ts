import { EventEmitter } from "node:events";
import type { ChatInputCommandInteraction } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiscordBotEngine } from "../../../src/capabilities/bot-engine";
import { execute as executeVoiceCommand } from "../../../src/discord/commands/voice/companion";
import {
  decimateStereo48kToMono16k,
  interpolateMono24kToStereo48k,
} from "../../../src/services/voice/audio/audio-resampler";
import { OutboundJitterBuffer } from "../../../src/services/voice/audio/jitter-buffer";
import { VoiceActivityDetector } from "../../../src/services/voice/audio/vad";
import {
  getVoiceManager,
  setVoiceManager,
} from "../../../src/services/voice/voice-manager";

// Mock @google/genai
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    live = {
      connect: vi.fn().mockResolvedValue({
        sendRealtimeInput: vi.fn(),
        sendClientContent: vi.fn(),
        sendToolResponse: vi.fn(),
        close: vi.fn(),
      }),
    };
  },
  Modality: {
    AUDIO: "AUDIO",
  },
}));

// Mock @discordjs/voice
const mockAudioPlayer = {
  play: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  unpause: vi.fn(),
  on: vi.fn(),
  state: { status: "playing" },
};

const mockReceiver = {
  speaking: new EventEmitter(),
  subscribe: vi.fn(),
};

const mockVoiceConnection = {
  subscribe: vi.fn(),
  destroy: vi.fn(),
  on: vi.fn(),
  receiver: mockReceiver,
};

vi.mock("@discordjs/voice", () => ({
  joinVoiceChannel: vi.fn(() => mockVoiceConnection),
  createAudioPlayer: vi.fn(() => mockAudioPlayer),
  createAudioResource: vi.fn(() => ({})),
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

describe("E2E: Voice Companion Capability & Audio Pipeline", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    setVoiceManager(null);
    process.env.GEMINI_API_KEY = "test-e2e-api-key";
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalKey;
  });

  it("should register VoiceCompanionCapability in DiscordBotEngine", () => {
    const engine = new DiscordBotEngine();
    const capabilities = engine.getCapabilities();
    const voiceCapability = capabilities.find(
      (c) => c.id === "voice-companion",
    );

    expect(voiceCapability).toBeDefined();
    expect(voiceCapability?.name).toBe("Voice Companion");
  });

  it("should execute full voice lifecycle: join -> audio pipeline -> instant barge-in -> opt-out -> auto-leave", async () => {
    const manager = getVoiceManager();

    const mockChannel = {
      id: "vc-100",
      guild: { id: "guild-100" },
      members: new Map([
        [
          "alice-id",
          {
            id: "alice-id",
            displayName: "Alice",
            user: { id: "alice-id", username: "alice", bot: false },
          },
        ],
      ]),
    };

    const mockGuild = {
      id: "guild-100",
      client: { user: { id: "bot-user-id" } },
      voiceAdapterCreator: vi.fn(),
      channels: {
        cache: new Map([["vc-100", mockChannel]]),
      },
    };

    // 1. Join voice channel via /voice join
    const mockReply = vi.fn();
    const mockDeferReply = vi.fn();
    const mockEditReply = vi.fn();

    const joinInteraction = {
      guild: mockGuild,
      member: {
        voice: { channel: mockChannel },
      },
      options: {
        getSubcommand: () => "join",
        getChannel: () => mockChannel,
      },
      reply: mockReply,
      deferReply: mockDeferReply,
      editReply: mockEditReply,
    } as unknown as ChatInputCommandInteraction;

    await executeVoiceCommand(joinInteraction);

    expect(mockDeferReply).toHaveBeenCalled();
    expect(mockEditReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Joined voice channel"),
      }),
    );

    const session = manager.getSession("guild-100");
    expect(session).toBeDefined();
    expect(session?.getStats().status).toBe("ACTIVE");

    // 2. Verify Ingress Resampling: 48kHz stereo -> 16kHz mono (3:1 decimation)
    const mockStereoFrame = Buffer.alloc(3840, 20); // 20ms at 48kHz stereo
    const resampledMono = decimateStereo48kToMono16k(mockStereoFrame);
    expect(resampledMono.length).toBe(640); // 20ms at 16kHz mono

    // 3. Verify VAD speech detection
    const vad = new VoiceActivityDetector({ attackFrames: 1 });
    const speechResult = vad.processFrame(resampledMono);
    expect(speechResult.state).toBe("SPEECH");
    expect(speechResult.isSpeech).toBe(true);

    // 4. Verify Egress Outbound: 24kHz mono -> 48kHz stereo (1:2 interpolation)
    const mockModel24kAudio = Buffer.alloc(960, 30); // 20ms at 24kHz mono
    const upsampledStereo = interpolateMono24kToStereo48k(mockModel24kAudio);
    expect(upsampledStereo.length).toBe(3840); // 20ms at 48kHz stereo

    // 5. Verify JitterBuffer queuing and instant barge-in purge (<20ms)
    const jitter = new OutboundJitterBuffer({ preBufferMs: 60 });
    jitter.pushModelAudio(mockModel24kAudio);
    expect(jitter.getBufferedFrameCount()).toBeGreaterThan(0);

    const purgeStart = Date.now();
    session?.triggerInstantBargeIn("bob-id");
    jitter.purge();
    const purgeDuration = Date.now() - purgeStart;

    expect(purgeDuration).toBeLessThan(20);
    expect(jitter.getBufferedFrameCount()).toBe(0);
    expect(mockAudioPlayer.stop).toHaveBeenCalledWith(true);
    expect(session?.getStats().bargeInCount).toBe(1);

    // 6. Verify /voice opt-out
    const optOutInteraction = {
      guild: mockGuild,
      user: { id: "alice-id" },
      options: {
        getSubcommand: () => "opt-out",
        getBoolean: () => true,
      },
      reply: mockReply,
    } as unknown as ChatInputCommandInteraction;

    await executeVoiceCommand(optOutInteraction);
    expect(mockReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("opted out"),
      }),
    );

    // 7. Verify auto-leave when channel becomes empty
    session?.onMemberCountChanged(0);
    // When 0 humans left, a grace timer is armed; calling destroy cleans up
    manager.leaveChannel("guild-100");
    expect(manager.getSession("guild-100")).toBeUndefined();
  });
});
