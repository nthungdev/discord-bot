import { describe, it, expect, vi, beforeEach } from "vitest";
import ChatBot from "./chat-bot";
import { store, chatbotActions } from "../store";

vi.mock("discord.js", async () => {
  const actual = await vi.importActual<typeof import("discord.js")>("discord.js");
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
    login = vi.fn().mockResolvedValue("token");
  }
  return {
    ...actual,
    Client: MockClient,
  };
});

describe("ChatBot", () => {
  const botConfig = {
    id: "chatBot",
    token: "test-token",
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

  it("should instantiate ChatBot with given config", () => {
    const chatBot = new ChatBot(botConfig);
    expect(chatBot.id).toBe("chatBot");
  });

  it("should load commands successfully", async () => {
    const chatBot = new ChatBot(botConfig);
    await expect(chatBot.loadCommands()).resolves.not.toThrow();
  });
});
