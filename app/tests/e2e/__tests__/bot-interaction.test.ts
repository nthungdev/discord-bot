import { describe, it, expect, vi, beforeEach } from "vitest";
import ChatBot from "../../src/bots/chat-bot";
import { store, chatbotActions } from "../../src/store";
import {
  createMockInteraction,
  createMockMessage,
} from "../fixtures/discord";

// Mock discord.js Client with a class constructor
vi.mock("discord.js", async () => {
  const actual = await vi.importActual<typeof import("discord.js")>(
    "discord.js",
  );

  class MockClient {
    user = { id: "bot-123", tag: "TestBot#0001" };
    channels = { cache: new Map() };
    guilds = { cache: new Map() };
    listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

    on(event: string, handler: (...args: unknown[]) => void) {
      this.listeners[event] = this.listeners[event] || [];
      this.listeners[event].push(handler);
      return this;
    }

    once(event: string, handler: (...args: unknown[]) => void) {
      this.listeners[event] = this.listeners[event] || [];
      this.listeners[event].push(handler);
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      this.listeners[event]?.forEach((handler) => handler(...args));
    }

    login = vi.fn().mockResolvedValue("token");
  }

  return {
    ...actual,
    Client: MockClient,
  };
});

describe("E2E: Bot Lifecycle & Interaction", () => {
  const botConfig = {
    id: "testChatBot",
    token: "fake-token",
    botConfig: {
      guilds: {
        "guild-123": {
          replyChannelIds: ["channel-123"],
          ignoredChannelIds: [],
          respondToMentions: true,
        },
      },
    },
  };

  beforeEach(() => {
    store.dispatch(chatbotActions.clearAll());
  });

  it("should initialize bot, register event listeners, and handle simulated message events", async () => {
    const chatBot = new ChatBot(botConfig);
    chatBot.listenToNewMessages();

    const clientInstance = (
      chatBot as unknown as {
        client: { emit: (event: string, arg: unknown) => void };
      }
    ).client;

    const mockMessage = createMockMessage({
      guildId: "guild-123",
      channelId: "channel-123",
      content: "Hello chatbot",
      inGuild: () => true,
    });

    // Simulate incoming messageCreate event
    clientInstance.emit("messageCreate", mockMessage);

    // Wait for async message handling to complete and update Redux state
    await vi.waitFor(() => {
      const state = store.getState().chatbot;
      expect(state.messageBuffer["channel-123"]).toBeDefined();
      expect(state.messageBuffer["channel-123"]?.[0]?.content).toBe(
        "Hello chatbot",
      );
    });
  });

  it("should handle slash command interactions gracefully", async () => {
    const chatBot = new ChatBot(botConfig);
    chatBot.listenToNewInteractions();

    const clientInstance = (
      chatBot as unknown as {
        client: { emit: (event: string, arg: unknown) => void };
      }
    ).client;

    const mockInteraction = createMockInteraction({
      guildId: "guild-123",
      commandName: "ping",
    });

    // Simulate incoming interactionCreate event
    clientInstance.emit("interactionCreate", mockInteraction);

    // Interaction received without unhandled exception
    expect(mockInteraction.isChatInputCommand).toHaveBeenCalled();
  });
});
