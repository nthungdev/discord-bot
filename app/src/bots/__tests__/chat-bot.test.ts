import { beforeEach, describe, expect, it, vi } from "vitest";
import { chatbotActions, store } from "../../store";
import ChatBot from ".././chat-bot";

vi.mock("discord.js", async () => {
  const actual =
    await vi.importActual<typeof import("discord.js")>("discord.js");
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

  it("should identify dismissal keywords", async () => {
    const { isDismissalKeyword } = await import("../chat-bot");
    expect(isDismissalKeyword("not you bot")).toBe(true);
    expect(isDismissalKeyword("shut up bot")).toBe(true);
    expect(isDismissalKeyword("shh")).toBe(true);
    expect(isDismissalKeyword("be quiet bot")).toBe(true);
    expect(isDismissalKeyword("What is the weather today?")).toBe(false);
  });

  it("should format ambient channel snapshot from recent messages", async () => {
    const { fetchAmbientChannelSnapshot } = await import("../chat-bot");
    const mockChannel = {
      isTextBased: () => true,
      messages: {
        fetch: vi.fn().mockResolvedValue({
          size: 2,
          toJSON: () => [
            {
              createdAt: new Date("2026-09-11T10:14:02Z"),
              author: { username: "alice", displayName: "AliceDev" },
              member: { nickname: "AliceDev" },
              cleanContent: "Here is an error log",
            },
            {
              createdAt: new Date("2026-09-11T10:14:15Z"),
              author: { username: "bob", displayName: "BobTester" },
              member: { nickname: "BobTester" },
              cleanContent: "Can you help fix that?",
            },
          ],
        }),
      },
    };

    const snapshot = await fetchAmbientChannelSnapshot(
      mockChannel as unknown as Parameters<
        typeof fetchAmbientChannelSnapshot
      >[0],
      "msg-123",
      5,
    );

    expect(snapshot).toContain(
      "--- Recent Channel Activity (for context reference only) ---",
    );
    expect(snapshot).toContain('@alice (AliceDev): "Here is an error log"');
    expect(snapshot).toContain('@bob (BobTester): "Can you help fix that?"');
    expect(snapshot).toContain("--- End Recent Channel Activity ---");
  });
});
