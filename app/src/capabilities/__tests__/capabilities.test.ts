import { type Client, Events, type Message } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../../config";
import { DiscordBotEngine } from "../bot-engine";
import { ModerationCapability } from "../moderation-capability";
import type { IBotCapability } from "../types";

describe("Capability System", () => {
  describe("ModerationCapability", () => {
    let capability: ModerationCapability;
    let mockClient: Client;

    beforeEach(() => {
      capability = new ModerationCapability({ enabled: true });
      mockClient = {} as Client;
      capability.init(mockClient, {} as Config);
    });

    it("should return undefined when capability is disabled", async () => {
      const disabledCap = new ModerationCapability({ enabled: false });
      const mockMessage = {
        author: { bot: false },
        guild: { id: "guild-123" },
        content: "nigger",
        channelId: "channel-123",
      } as unknown as Message;

      const result = await disabledCap.handleMessage(mockMessage);
      expect(result).toBeUndefined();
    });

    it("should return undefined for innocent messages", async () => {
      const mockMessage = {
        author: { bot: false },
        guild: { id: "guild-123" },
        content: "Hello everyone, have a nice day!",
        channelId: "channel-123",
      } as unknown as Message;

      const result = await capability.handleMessage(mockMessage);
      expect(result).toBeUndefined();
    });

    it("should intercept and return true for violating messages when enabled", async () => {
      const mockDelete = vi.fn().mockResolvedValue(undefined);
      const mockSend = vi.fn().mockResolvedValue(undefined);

      const mockMessage = {
        author: {
          id: "user-1",
          tag: "BadUser#0001",
          username: "BadUser",
          bot: false,
        },
        guild: { id: "guild-123" },
        content: "nigger", // Prohibited word defined in detector
        channelId: "channel-123",
        channel: {
          id: "channel-123",
          isSendable: () => true,
          send: mockSend,
        },
        deletable: true,
        delete: mockDelete,
      } as unknown as Message;

      const result = await capability.handleMessage(mockMessage);
      expect(result).toBe(true);
      expect(mockDelete).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe("DiscordBotEngine Pipeline", () => {
    it("should not register ModerationCapability by default when police capabilities are turned off", () => {
      const mockClient = {
        on: vi.fn(),
        once: vi.fn(),
      } as unknown as Client;

      const prevEnv = process.env.ENABLE_POLICE_CAPABILITY;
      delete process.env.ENABLE_POLICE_CAPABILITY;

      const engine = new DiscordBotEngine(mockClient);
      const capabilityIds = engine.getCapabilities().map((c) => c.id);

      expect(capabilityIds).not.toContain("moderation");
      expect(capabilityIds).toContain("chat");
      expect(capabilityIds).toContain("roles");

      process.env.ENABLE_POLICE_CAPABILITY = prevEnv;
    });

    it("should register ModerationCapability when ENABLE_POLICE_CAPABILITY is 'true'", () => {
      const mockClient = {
        on: vi.fn(),
        once: vi.fn(),
      } as unknown as Client;

      const prevEnv = process.env.ENABLE_POLICE_CAPABILITY;
      process.env.ENABLE_POLICE_CAPABILITY = "true";

      const engine = new DiscordBotEngine(mockClient);
      const capabilityIds = engine.getCapabilities().map((c) => c.id);

      expect(capabilityIds).toContain("moderation");
      expect(capabilityIds).toContain("chat");
      expect(capabilityIds).toContain("roles");

      if (prevEnv !== undefined) {
        process.env.ENABLE_POLICE_CAPABILITY = prevEnv;
      } else {
        delete process.env.ENABLE_POLICE_CAPABILITY;
      }
    });

    it("should halt pipeline propagation when first capability intercepts", async () => {
      const mockClient = {
        on: vi.fn(),
        once: vi.fn(),
        login: vi.fn().mockResolvedValue("token"),
        isReady: () => true,
        ws: { ping: 25 },
        guilds: { cache: new Map() },
        user: { tag: "TestBot#0001", displayAvatarURL: () => "http://avatar" },
      } as unknown as Client;

      const engine = new DiscordBotEngine(mockClient);

      const cap1: IBotCapability = {
        id: "cap1",
        name: "Cap 1",
        init: vi.fn(),
        handleMessage: vi.fn().mockResolvedValue(true), // Intercepts!
      };

      const cap2: IBotCapability = {
        id: "cap2",
        name: "Cap 2",
        init: vi.fn(),
        handleMessage: vi.fn().mockResolvedValue(undefined),
      };

      engine.registerCapability(cap1);
      engine.registerCapability(cap2);

      expect(engine.getCapabilities().length).toBeGreaterThanOrEqual(2);
    });

    it("should bind engine client events only once even when started and restarted", async () => {
      const mockClient = {
        on: vi.fn(),
        once: vi.fn(),
        login: vi.fn().mockResolvedValue("token"),
        destroy: vi.fn(),
        isReady: () => true,
        ws: { ping: 25 },
        guilds: { cache: new Map() },
        user: { tag: "TestBot#0001", displayAvatarURL: () => "http://avatar" },
      } as unknown as Client;

      const engine = new DiscordBotEngine(mockClient);
      await engine.start("test-token");

      const memberAddBefore = vi
        .mocked(mockClient.on)
        .mock.calls.filter(([event]) => event === Events.GuildMemberAdd).length;
      expect(memberAddBefore).toBe(1);

      // Restart engine
      await engine.restart();

      const memberAddAfter = vi
        .mocked(mockClient.on)
        .mock.calls.filter(([event]) => event === Events.GuildMemberAdd).length;
      expect(memberAddAfter).toBe(1);
    });

    it("should clean up and rebind client event listeners cleanly across start -> destroy -> start lifecycle", async () => {
      type ListenerFn = (...args: unknown[]) => void;
      const listeners: Record<string, ListenerFn[]> = {};
      const mockClient = {
        on: vi.fn((event: string, fn: ListenerFn) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(fn);
          return mockClient;
        }),
        once: vi.fn((event: string, fn: ListenerFn) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(fn);
          return mockClient;
        }),
        off: vi.fn((event: string, fn: ListenerFn) => {
          if (listeners[event]) {
            listeners[event] = listeners[event].filter((cb) => cb !== fn);
          }
          return mockClient;
        }),
        login: vi.fn().mockResolvedValue("token"),
        destroy: vi.fn(),
        isReady: () => true,
        ws: { ping: 25 },
        guilds: { cache: new Map() },
        user: { tag: "TestBot#0001", displayAvatarURL: () => "http://avatar" },
      } as unknown as Client;

      const engine = new DiscordBotEngine(mockClient);

      await engine.start("test-token");
      expect(listeners[Events.GuildMemberAdd]?.length).toBe(1);

      await engine.destroy();
      expect(mockClient.off).toHaveBeenCalled();
      expect(listeners[Events.GuildMemberAdd]?.length).toBe(0);

      await engine.start("test-token");
      expect(listeners[Events.GuildMemberAdd]?.length).toBe(1);
    });

    it("should dispatch reaction add and remove events to capabilities", async () => {
      type ListenerFn = (...args: unknown[]) => void;
      const listeners: Record<string, ListenerFn[]> = {};
      const mockClient = {
        on: vi.fn((event: string, fn: ListenerFn) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(fn);
          return mockClient;
        }),
        once: vi.fn((event: string, fn: ListenerFn) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(fn);
          return mockClient;
        }),
        off: vi.fn(),
        login: vi.fn().mockResolvedValue("token"),
        destroy: vi.fn(),
        isReady: () => true,
        ws: { ping: 25 },
        guilds: { cache: new Map() },
        user: { tag: "TestBot#0001", displayAvatarURL: () => "http://avatar" },
      } as unknown as Client;

      const engine = new DiscordBotEngine(mockClient);

      const reactionCap: IBotCapability = {
        id: "reaction-cap",
        name: "Reaction Capability",
        init: vi.fn(),
        handleReactionAdd: vi.fn().mockResolvedValue(undefined),
        handleReactionRemove: vi.fn().mockResolvedValue(undefined),
      };

      engine.registerCapability(reactionCap);
      await engine.start("test-token");

      expect(
        listeners[Events.MessageReactionAdd]?.length,
      ).toBeGreaterThanOrEqual(1);
      expect(listeners[Events.MessageReactionRemove]?.length).toBe(1);

      const mockReaction = {
        emoji: { name: "🔴" },
        message: { partial: false, guildId: "guild-1", id: "msg-1" },
      };
      const mockUser = { id: "user-1", bot: false };

      // Dispatch reaction add using engine's bound listener
      const reactionAddListeners = listeners[Events.MessageReactionAdd];
      const engineReactionAdd =
        reactionAddListeners?.[reactionAddListeners.length - 1];
      expect(engineReactionAdd).toBeDefined();
      if (engineReactionAdd) {
        await engineReactionAdd(mockReaction, mockUser);
      }
      expect(reactionCap.handleReactionAdd).toHaveBeenCalledWith(
        mockReaction,
        mockUser,
      );

      // Dispatch reaction remove using engine's bound listener
      const engineReactionRemove = listeners[Events.MessageReactionRemove]?.[0];
      expect(engineReactionRemove).toBeDefined();
      if (engineReactionRemove) {
        await engineReactionRemove(mockReaction, mockUser);
      }
      expect(reactionCap.handleReactionRemove).toHaveBeenCalledWith(
        mockReaction,
        mockUser,
      );
    });
  });
});
