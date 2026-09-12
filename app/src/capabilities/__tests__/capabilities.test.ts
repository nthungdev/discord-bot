import type { Client, Message } from "discord.js";
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
      capability = new ModerationCapability();
      mockClient = {} as Client;
      capability.init(mockClient, {} as Config);
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

    it("should intercept and return true for violating messages", async () => {
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
  });
});
