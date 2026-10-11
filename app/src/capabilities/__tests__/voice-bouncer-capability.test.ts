import type {
  Client,
  User,
  UserPrimaryGuild,
  VoiceBasedChannel,
  VoiceState,
} from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../../config";
import type { BotGuildConfig } from "../../config/types";
import {
  DEFAULT_VOICE_BOUNCE_DISCONNECT_REASON,
  isChannelProtectedByBouncer,
  isMemberExemptByRole,
  isMemberGuildTagCompliant,
  VoiceBouncerCapability,
  WARNING_AUTO_DELETE_DELAY_MS,
} from "../voice-bouncer-capability";

describe("VoiceBouncerCapability", () => {
  let capability: VoiceBouncerCapability;

  beforeEach(() => {
    vi.useFakeTimers();
    capability = new VoiceBouncerCapability();
    capability.init({} as Client, {} as Config);
  });

  afterEach(() => {
    capability.destroy();
    vi.useRealTimers();
  });

  describe("Helper Functions", () => {
    describe("isMemberGuildTagCompliant", () => {
      it("should return false when primaryGuild is null or undefined", () => {
        expect(isMemberGuildTagCompliant(null, "guild-1")).toBe(false);
        expect(isMemberGuildTagCompliant(undefined, "guild-1")).toBe(false);
      });

      it("should return false when identityEnabled is false", () => {
        const primaryGuild: UserPrimaryGuild = {
          identityGuildId: "guild-1",
          identityEnabled: false,
          tag: "TAG",
          badge: "hash123",
        };
        expect(isMemberGuildTagCompliant(primaryGuild, "guild-1")).toBe(false);
      });

      it("should return false when identityGuildId does not match target guildId", () => {
        const primaryGuild: UserPrimaryGuild = {
          identityGuildId: "guild-other",
          identityEnabled: true,
          tag: "TAG",
          badge: "hash123",
        };
        expect(isMemberGuildTagCompliant(primaryGuild, "guild-1")).toBe(false);
      });

      it("should return true when identityGuildId matches target guildId and identity is enabled", () => {
        const primaryGuild: UserPrimaryGuild = {
          identityGuildId: "guild-1",
          identityEnabled: true,
          tag: "TAG",
          badge: "hash123",
        };
        expect(isMemberGuildTagCompliant(primaryGuild, "guild-1")).toBe(true);
      });

      it("should return true when identityEnabled is null/undefined (default active)", () => {
        const primaryGuild: UserPrimaryGuild = {
          identityGuildId: "guild-1",
          identityEnabled: null,
          tag: "TAG",
          badge: null,
        };
        expect(isMemberGuildTagCompliant(primaryGuild, "guild-1")).toBe(true);
      });
    });

    describe("isMemberExemptByRole", () => {
      it("should return false when exempt list is empty", () => {
        expect(isMemberExemptByRole(["role-1", "role-2"], [])).toBe(false);
      });

      it("should return true when member has an exempt role", () => {
        expect(
          isMemberExemptByRole(
            ["role-1", "role-vip"],
            ["role-mod", "role-vip"],
          ),
        ).toBe(true);
      });

      it("should return false when member has no exempt roles", () => {
        expect(
          isMemberExemptByRole(["role-1", "role-2"], ["role-mod", "role-vip"]),
        ).toBe(false);
      });
    });

    describe("isChannelProtectedByBouncer", () => {
      it("should return true when channelId is in protected list", () => {
        expect(
          isChannelProtectedByBouncer("vc-1", null, ["vc-1", "vc-2"], []),
        ).toBe(true);
      });

      it("should return true when parentCategoryId is in protected category list", () => {
        expect(
          isChannelProtectedByBouncer("vc-99", "cat-1", [], ["cat-1"]),
        ).toBe(true);
      });

      it("should return false when neither channel nor category is protected", () => {
        expect(
          isChannelProtectedByBouncer("vc-99", "cat-2", ["vc-1"], ["cat-1"]),
        ).toBe(false);
      });
    });
  });

  describe("resolveUserPrimaryGuild", () => {
    it("should return primaryGuild directly if already populated on user", async () => {
      const primaryGuild: UserPrimaryGuild = {
        identityGuildId: "guild-1",
        identityEnabled: true,
        tag: "TAG",
        badge: null,
      };
      const mockUser = {
        id: "user-1",
        primaryGuild,
      } as unknown as User;

      const result = await capability.resolveUserPrimaryGuild(mockUser);
      expect(result).toEqual(primaryGuild);
    });

    it("should fetch user from Discord REST API when primaryGuild is missing", async () => {
      const fetchedPrimaryGuild: UserPrimaryGuild = {
        identityGuildId: "guild-1",
        identityEnabled: true,
        tag: "TAG",
        badge: "badge-hash",
      };
      const mockFetch = vi.fn().mockResolvedValue({
        primaryGuild: fetchedPrimaryGuild,
      });
      const mockUser = {
        id: "user-2",
        primaryGuild: null,
        fetch: mockFetch,
      } as unknown as User;

      const result = await capability.resolveUserPrimaryGuild(mockUser);
      expect(mockFetch).toHaveBeenCalled();
      expect(result).toEqual(fetchedPrimaryGuild);
    });

    it("should serve subsequent requests from cache within TTL", async () => {
      const primaryGuild: UserPrimaryGuild = {
        identityGuildId: "guild-1",
        identityEnabled: true,
        tag: "TAG",
        badge: null,
      };
      const mockFetch = vi.fn().mockResolvedValue({ primaryGuild });
      const mockUser = {
        id: "user-3",
        primaryGuild: null,
        fetch: mockFetch,
      } as unknown as User;

      const now = 1_000_000;
      await capability.resolveUserPrimaryGuild(mockUser, now);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Call again 10s later (within 60s TTL)
      await capability.resolveUserPrimaryGuild(mockUser, now + 10_000);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("Bounce Rate Limiting", () => {
    it("should allow bursts up to threshold and rate limit thereafter within the same guild", () => {
      const now = 100_000;
      expect(capability.isBounceRateLimited("guild-1", "user-1", now)).toBe(
        false,
      );
      expect(
        capability.isBounceRateLimited("guild-1", "user-1", now + 1000),
      ).toBe(false);
      expect(
        capability.isBounceRateLimited("guild-1", "user-1", now + 2000),
      ).toBe(false);
      // 4th attempt in window triggers rate limit
      expect(
        capability.isBounceRateLimited("guild-1", "user-1", now + 3000),
      ).toBe(true);

      // After 30s window expires, counter resets
      expect(
        capability.isBounceRateLimited("guild-1", "user-1", now + 35_000),
      ).toBe(false);
    });

    it("should isolate rate limits across different guilds for the same user", () => {
      const now = 100_000;
      expect(capability.isBounceRateLimited("guild-1", "user-1", now)).toBe(
        false,
      );
      expect(
        capability.isBounceRateLimited("guild-1", "user-1", now + 1000),
      ).toBe(false);
      expect(
        capability.isBounceRateLimited("guild-1", "user-1", now + 2000),
      ).toBe(false);
      expect(
        capability.isBounceRateLimited("guild-1", "user-1", now + 3000),
      ).toBe(true);

      // Different guild is not affected
      expect(
        capability.isBounceRateLimited("guild-2", "user-1", now + 3000),
      ).toBe(false);
    });

    it("should sweep expired history entries to avoid memory growth", () => {
      const now = 100_000;
      capability.isBounceRateLimited("guild-1", "user-stale", now);
      // Advance past window
      capability.isBounceRateLimited("guild-1", "user-fresh", now + 35_000);
      // user-stale should be swept out
      expect(
        capability.isBounceRateLimited("guild-1", "user-stale", now + 36_000),
      ).toBe(false);
    });

    it("should clear history and pending timers on destroy()", () => {
      const now = 100_000;
      capability.isBounceRateLimited("guild-1", "user-1", now);
      capability.destroy();
      expect(capability.isBounceRateLimited("guild-1", "user-1", now)).toBe(
        false,
      );
    });
  });

  describe("handleVoiceStateUpdate", () => {
    const guildConfig: BotGuildConfig = {
      replyChannelIds: [],
      ignoredChannelIds: [],
      respondToMentions: false,
      voiceBouncer: {
        enabled: true,
        tagOnlyVoiceChannelIds: ["vc-protected"],
        exemptRoleIds: ["role-booster"],
      },
    };

    it("should do nothing when voiceBouncer is disabled", async () => {
      const mockDisconnect = vi.fn();
      const disabledConfig: BotGuildConfig = {
        ...guildConfig,
        voiceBouncer: { enabled: false },
      };

      const newState = {
        channelId: "vc-protected",
        disconnect: mockDisconnect,
      } as unknown as VoiceState;

      await capability.handleVoiceStateUpdate(
        {} as VoiceState,
        newState,
        disabledConfig,
      );

      expect(mockDisconnect).not.toHaveBeenCalled();
    });

    it("should do nothing when user disconnects from voice", async () => {
      const mockDisconnect = vi.fn();
      const newState = {
        channelId: null,
        disconnect: mockDisconnect,
      } as unknown as VoiceState;

      await capability.handleVoiceStateUpdate(
        { channelId: "vc-1" } as VoiceState,
        newState,
        guildConfig,
      );

      expect(mockDisconnect).not.toHaveBeenCalled();
    });

    it("should do nothing when user toggles mute/deafen without changing channel", async () => {
      const mockDisconnect = vi.fn();
      const state = {
        channelId: "vc-protected",
        disconnect: mockDisconnect,
      } as unknown as VoiceState;

      await capability.handleVoiceStateUpdate(state, state, guildConfig);
      expect(mockDisconnect).not.toHaveBeenCalled();
    });

    it("should do nothing when joining an unprotected channel", async () => {
      const mockDisconnect = vi.fn();
      const newState = {
        channelId: "vc-public",
        channel: { parentId: "cat-public" },
        disconnect: mockDisconnect,
      } as unknown as VoiceState;

      await capability.handleVoiceStateUpdate(
        {} as VoiceState,
        newState,
        guildConfig,
      );

      expect(mockDisconnect).not.toHaveBeenCalled();
    });

    it("should do nothing when member is a bot", async () => {
      const mockDisconnect = vi.fn();
      const newState = {
        channelId: "vc-protected",
        channel: { parentId: null },
        member: {
          user: { bot: true },
          roles: { cache: new Map() },
        },
        disconnect: mockDisconnect,
      } as unknown as VoiceState;

      await capability.handleVoiceStateUpdate(
        {} as VoiceState,
        newState,
        guildConfig,
      );

      expect(mockDisconnect).not.toHaveBeenCalled();
    });

    it("should do nothing when member has an exempt role", async () => {
      const mockDisconnect = vi.fn();
      const newState = {
        channelId: "vc-protected",
        channel: { parentId: null },
        guild: { id: "guild-1" },
        member: {
          id: "user-booster",
          displayName: "Untagged Booster",
          user: { bot: false, username: "booster", primaryGuild: null },
          roles: { cache: new Map([["role-booster", {}]]) },
          guild: { id: "guild-1" },
        },
        disconnect: mockDisconnect,
      } as unknown as VoiceState;

      await capability.handleVoiceStateUpdate(
        {} as VoiceState,
        newState,
        guildConfig,
      );

      expect(mockDisconnect).not.toHaveBeenCalled();
    });

    it("should do nothing when member has equipped matching server tag", async () => {
      const mockDisconnect = vi.fn();
      const newState = {
        channelId: "vc-protected",
        channel: { parentId: null },
        guild: { id: "guild-1" },
        member: {
          id: "user-tagged",
          displayName: "Proud Member",
          user: {
            id: "user-tagged",
            bot: false,
            username: "proud_member",
            primaryGuild: {
              identityGuildId: "guild-1",
              identityEnabled: true,
              tag: "OMA",
              badge: "badge-123",
            },
          },
          roles: { cache: new Map() },
          guild: { id: "guild-1" },
        },
        disconnect: mockDisconnect,
      } as unknown as VoiceState;

      await capability.handleVoiceStateUpdate(
        {} as VoiceState,
        newState,
        guildConfig,
      );

      expect(mockDisconnect).not.toHaveBeenCalled();
    });

    it("should disconnect non-compliant member without server tag, send warning, and auto-delete warning message after delay", async () => {
      const mockDisconnect = vi.fn().mockResolvedValue(undefined);
      const mockDelete = vi.fn().mockResolvedValue(undefined);
      const mockSend = vi.fn().mockResolvedValue({ delete: mockDelete });

      const mockChannel = {
        parentId: null,
        isSendable: () => true,
        send: mockSend,
      } as unknown as VoiceBasedChannel;

      const newState = {
        channelId: "vc-protected",
        channel: mockChannel,
        guild: { id: "guild-1" },
        member: {
          id: "user-intruder",
          displayName: "Untagged Member",
          user: {
            id: "user-intruder",
            bot: false,
            username: "untagged",
            primaryGuild: null,
            fetch: vi.fn().mockResolvedValue({ primaryGuild: null }),
          },
          roles: { cache: new Map() },
          guild: { id: "guild-1" },
        },
        disconnect: mockDisconnect,
      } as unknown as VoiceState;

      await capability.handleVoiceStateUpdate(
        {} as VoiceState,
        newState,
        guildConfig,
      );

      expect(mockDisconnect).toHaveBeenCalledWith(
        DEFAULT_VOICE_BOUNCE_DISCONNECT_REASON,
      );
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("⚠️ **[Voice Bouncer]**"),
        }),
      );

      // Warning message should not be deleted before delay
      expect(mockDelete).not.toHaveBeenCalled();

      // Advance timers to trigger auto-delete
      vi.advanceTimersByTime(WARNING_AUTO_DELETE_DELAY_MS);
      expect(mockDelete).toHaveBeenCalled();
    });

    it("should relocate non-compliant member to fallbackChannelId when action is 'move'", async () => {
      const mockSetChannel = vi.fn().mockResolvedValue(undefined);
      const mockDisconnect = vi.fn();
      const moveConfig: BotGuildConfig = {
        ...guildConfig,
        voiceBouncer: {
          ...guildConfig.voiceBouncer,
          action: "move",
          fallbackChannelId: "vc-lounge",
        },
      };

      const newState = {
        channelId: "vc-protected",
        channel: { parentId: null, isSendable: () => false },
        guild: { id: "guild-1" },
        member: {
          id: "user-intruder",
          displayName: "Other Tag",
          user: {
            id: "user-intruder",
            bot: false,
            username: "other_tag",
            primaryGuild: {
              identityGuildId: "other-guild",
              identityEnabled: true,
              tag: "OTHER",
              badge: null,
            },
          },
          roles: { cache: new Map() },
          guild: { id: "guild-1" },
        },
        setChannel: mockSetChannel,
        disconnect: mockDisconnect,
      } as unknown as VoiceState;

      await capability.handleVoiceStateUpdate(
        {} as VoiceState,
        newState,
        moveConfig,
      );

      expect(mockSetChannel).toHaveBeenCalledWith(
        "vc-lounge",
        expect.any(String),
      );
      expect(mockDisconnect).not.toHaveBeenCalled();
    });

    it("should fallback to disconnect when relocation to fallbackChannelId throws", async () => {
      const mockSetChannel = vi
        .fn()
        .mockRejectedValue(new Error("Permission denied"));
      const mockDisconnect = vi.fn().mockResolvedValue(undefined);
      const moveConfig: BotGuildConfig = {
        ...guildConfig,
        voiceBouncer: {
          ...guildConfig.voiceBouncer,
          action: "move",
          fallbackChannelId: "vc-lounge",
        },
      };

      const newState = {
        channelId: "vc-protected",
        channel: { parentId: null, isSendable: () => false },
        guild: { id: "guild-1" },
        member: {
          id: "user-intruder",
          displayName: "No Tag",
          user: {
            id: "user-intruder",
            bot: false,
            username: "no_tag",
            primaryGuild: null,
            fetch: vi.fn().mockResolvedValue({ primaryGuild: null }),
          },
          roles: { cache: new Map() },
          guild: { id: "guild-1" },
        },
        setChannel: mockSetChannel,
        disconnect: mockDisconnect,
      } as unknown as VoiceState;

      await capability.handleVoiceStateUpdate(
        {} as VoiceState,
        newState,
        moveConfig,
      );

      expect(mockSetChannel).toHaveBeenCalledWith(
        "vc-lounge",
        expect.any(String),
      );
      expect(mockDisconnect).toHaveBeenCalledWith(
        DEFAULT_VOICE_BOUNCE_DISCONNECT_REASON,
      );
    });
  });
});
