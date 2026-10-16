import type {
  ChatInputCommandInteraction,
  Client,
  VoiceState,
} from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../../config";
import { getVoiceManager } from "../../services/voice/voice-manager";
import { VoiceCompanionCapability } from "../voice-companion-capability";

vi.mock("../../services/voice/voice-manager", () => {
  const mockManager = {
    handleVoiceStateUpdate: vi.fn(),
    destroyAll: vi.fn(),
  };
  return {
    getVoiceManager: vi.fn(() => mockManager),
  };
});

describe("VoiceCompanionCapability", () => {
  let capability: VoiceCompanionCapability;
  const mockClient = {} as unknown as Client;
  const mockConfig = {} as unknown as Config;

  beforeEach(() => {
    vi.clearAllMocks();
    capability = new VoiceCompanionCapability();
  });

  it("should have correct id and name", () => {
    expect(capability.id).toBe("voice-companion");
    expect(capability.name).toBe("Voice Companion");
  });

  it("should initialize VoiceManager on init", () => {
    capability.init(mockClient, mockConfig);
    expect(getVoiceManager).toHaveBeenCalled();
  });

  it("should forward voiceStateUpdate to VoiceManager when enabled", async () => {
    const oldState = {} as VoiceState;
    const newState = {} as VoiceState;
    const guildConfig = {
      replyChannelIds: [],
      ignoredChannelIds: [],
      respondToMentions: false,
      voiceCompanion: { enabled: true },
    };

    await capability.handleVoiceStateUpdate(oldState, newState, guildConfig);
    const manager = getVoiceManager();
    expect(manager.handleVoiceStateUpdate).toHaveBeenCalledWith(
      oldState,
      newState,
    );
  });

  it("should ignore voiceStateUpdate when disabled in guild config", async () => {
    const oldState = {} as VoiceState;
    const newState = {} as VoiceState;
    const guildConfig = {
      replyChannelIds: [],
      ignoredChannelIds: [],
      respondToMentions: false,
      voiceCompanion: { enabled: false },
    };

    await capability.handleVoiceStateUpdate(oldState, newState, guildConfig);
    const manager = getVoiceManager();
    expect(manager.handleVoiceStateUpdate).not.toHaveBeenCalled();
  });

  it("should reply with disabled message when voice command invoked but capability disabled", async () => {
    const mockReply = vi.fn();
    const interaction = {
      isChatInputCommand: () => true,
      commandName: "voice",
      replied: false,
      deferred: false,
      reply: mockReply,
    } as unknown as ChatInputCommandInteraction;

    const guildConfig = {
      replyChannelIds: [],
      ignoredChannelIds: [],
      respondToMentions: false,
      voiceCompanion: { enabled: false },
    };

    await capability.handleInteraction(interaction, guildConfig);
    expect(mockReply).toHaveBeenCalledWith({
      content: "Voice Companion capability is disabled in this server.",
      ephemeral: true,
    });
  });

  it("should do nothing if interaction was already replied or deferred", async () => {
    const mockReply = vi.fn();
    const interaction = {
      isChatInputCommand: () => true,
      commandName: "voice",
      replied: true,
      deferred: false,
      reply: mockReply,
    } as unknown as ChatInputCommandInteraction;

    const guildConfig = {
      replyChannelIds: [],
      ignoredChannelIds: [],
      respondToMentions: false,
      voiceCompanion: { enabled: false },
    };

    await capability.handleInteraction(interaction, guildConfig);
    expect(mockReply).not.toHaveBeenCalled();
  });

  it("should clean up all active sessions on destroy", () => {
    capability.destroy();
    const manager = getVoiceManager();
    expect(manager.destroyAll).toHaveBeenCalledTimes(1);
  });
});
