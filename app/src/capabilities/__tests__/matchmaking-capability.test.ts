import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  VoiceState,
} from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../../config";
import type { BotGuildConfig } from "../../config/types";
import {
  isMatchmakingInteraction,
  isMatchTeamVoiceChannel,
  MATCHMAKING_INTERACTION_PREFIX,
  MatchmakingCapability,
} from "../matchmaking-capability";

describe("MatchmakingCapability", () => {
  let capability: MatchmakingCapability;

  beforeEach(() => {
    capability = new MatchmakingCapability();
    capability.init({} as Client, {} as Config);
  });

  describe("Helper Functions", () => {
    describe("isMatchmakingInteraction", () => {
      it("should return true when customId starts with 10man_ prefix", () => {
        expect(
          isMatchmakingInteraction(`${MATCHMAKING_INTERACTION_PREFIX}join`),
        ).toBe(true);
        expect(isMatchmakingInteraction("10man_ban_ascent")).toBe(true);
      });

      it("should return false for unrelated customIds", () => {
        expect(isMatchmakingInteraction("role_button_123")).toBe(false);
        expect(isMatchmakingInteraction("help_menu")).toBe(false);
      });
    });

    describe("isMatchTeamVoiceChannel", () => {
      const config = {
        enabled: true,
        team1VoiceChannelId: "vc-team1",
        team2VoiceChannelId: "vc-team2",
      };

      it("should return false when config is undefined", () => {
        expect(isMatchTeamVoiceChannel("vc-team1", undefined)).toBe(false);
      });

      it("should return true when channelId matches team 1 or team 2", () => {
        expect(isMatchTeamVoiceChannel("vc-team1", config)).toBe(true);
        expect(isMatchTeamVoiceChannel("vc-team2", config)).toBe(true);
      });

      it("should return false when channelId is not a team channel", () => {
        expect(isMatchTeamVoiceChannel("vc-lobby", config)).toBe(false);
      });
    });
  });

  describe("handleInteraction", () => {
    const guildConfig: BotGuildConfig = {
      replyChannelIds: [],
      ignoredChannelIds: [],
      respondToMentions: false,
      matchmaking: {
        enabled: true,
        team1VoiceChannelId: "vc-team1",
        team2VoiceChannelId: "vc-team2",
      },
    };

    it("should do nothing when matchmaking is disabled in config", async () => {
      const mockReply = vi.fn();
      const interaction = {
        isButton: () => true,
        isStringSelectMenu: () => false,
        customId: "10man_join",
        user: { id: "user-1" },
        reply: mockReply,
      } as unknown as ButtonInteraction;

      const disabledConfig: BotGuildConfig = {
        ...guildConfig,
        matchmaking: { enabled: false },
      };

      await capability.handleInteraction(interaction, disabledConfig);
      expect(mockReply).not.toHaveBeenCalled();
    });

    it("should do nothing for non-component interactions", async () => {
      const mockReply = vi.fn();
      const interaction = {
        isButton: () => false,
        isStringSelectMenu: () => false,
        reply: mockReply,
      } as unknown as ChatInputCommandInteraction;

      await capability.handleInteraction(interaction, guildConfig);
      expect(mockReply).not.toHaveBeenCalled();
    });

    it("should do nothing for component interactions without matchmaking prefix", async () => {
      const mockReply = vi.fn();
      const interaction = {
        isButton: () => true,
        isStringSelectMenu: () => false,
        customId: "role_claim_123",
        user: { id: "user-1" },
        reply: mockReply,
      } as unknown as ButtonInteraction;

      await capability.handleInteraction(interaction, guildConfig);
      expect(mockReply).not.toHaveBeenCalled();
    });

    it("should handle and acknowledge matchmaking button interaction", async () => {
      const mockReply = vi.fn().mockResolvedValue(undefined);
      const interaction = {
        isButton: () => true,
        isStringSelectMenu: () => false,
        customId: "10man_join",
        user: { id: "user-1" },
        replied: false,
        deferred: false,
        reply: mockReply,
      } as unknown as ButtonInteraction;

      await capability.handleInteraction(interaction, guildConfig);
      expect(mockReply).toHaveBeenCalledWith(
        expect.objectContaining({
          ephemeral: true,
          content: expect.stringContaining("preview mode"),
        }),
      );
    });
  });

  describe("handleVoiceStateUpdate", () => {
    const guildConfig: BotGuildConfig = {
      replyChannelIds: [],
      ignoredChannelIds: [],
      respondToMentions: false,
      matchmaking: {
        enabled: true,
        team1VoiceChannelId: "vc-team1",
        team2VoiceChannelId: "vc-team2",
      },
    };

    it("should do nothing when matchmaking is disabled", async () => {
      const disabledConfig: BotGuildConfig = {
        ...guildConfig,
        matchmaking: { enabled: false },
      };

      const newState = { channelId: "vc-team1" } as VoiceState;
      await capability.handleVoiceStateUpdate(
        {} as VoiceState,
        newState,
        disabledConfig,
      );
    });

    it("should do nothing when channel does not change", async () => {
      const state = { channelId: "vc-team1" } as VoiceState;
      await capability.handleVoiceStateUpdate(state, state, guildConfig);
    });

    it("should do nothing when joining non-team voice channel", async () => {
      const newState = { channelId: "vc-general" } as VoiceState;
      await capability.handleVoiceStateUpdate(
        {} as VoiceState,
        newState,
        guildConfig,
      );
    });

    it("should ignore bot accounts joining team channel", async () => {
      const newState = {
        channelId: "vc-team1",
        member: { user: { bot: true } },
      } as unknown as VoiceState;

      await capability.handleVoiceStateUpdate(
        {} as VoiceState,
        newState,
        guildConfig,
      );
    });

    it("should evict unauthorized member to lobby when lobbyVoiceChannelId is configured", async () => {
      const mockSetChannel = vi.fn().mockResolvedValue(undefined);
      const mockDisconnect = vi.fn();
      const lobbyConfig: BotGuildConfig = {
        ...guildConfig,
        matchmaking: {
          ...guildConfig.matchmaking,
          lobbyVoiceChannelId: "vc-lobby",
        },
      };

      const newState = {
        channelId: "vc-team1",
        member: { id: "user-intruder", user: { bot: false } },
        setChannel: mockSetChannel,
        disconnect: mockDisconnect,
      } as unknown as VoiceState;

      await capability.handleVoiceStateUpdate(
        {} as VoiceState,
        newState,
        lobbyConfig,
      );

      expect(mockSetChannel).toHaveBeenCalledWith(
        "vc-lobby",
        expect.stringContaining("restricted"),
      );
      expect(mockDisconnect).not.toHaveBeenCalled();
    });

    it("should disconnect unauthorized member when no lobbyVoiceChannelId is configured", async () => {
      const mockDisconnect = vi.fn().mockResolvedValue(undefined);
      const newState = {
        channelId: "vc-team2",
        member: { id: "user-intruder", user: { bot: false } },
        disconnect: mockDisconnect,
      } as unknown as VoiceState;

      await capability.handleVoiceStateUpdate(
        {} as VoiceState,
        newState,
        guildConfig,
      );

      expect(mockDisconnect).toHaveBeenCalledWith(
        expect.stringContaining("restricted"),
      );
    });

    it("should catch and log error if eviction fails without throwing", async () => {
      const mockDisconnect = vi
        .fn()
        .mockRejectedValue(new Error("Discord API error"));
      const newState = {
        channelId: "vc-team1",
        member: { id: "user-intruder", user: { bot: false } },
        disconnect: mockDisconnect,
      } as unknown as VoiceState;

      await expect(
        capability.handleVoiceStateUpdate(
          {} as VoiceState,
          newState,
          guildConfig,
        ),
      ).resolves.not.toThrow();
    });
  });
});
