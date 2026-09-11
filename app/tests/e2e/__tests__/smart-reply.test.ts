import { beforeEach, describe, expect, it, vi } from "vitest";
import ChatBot, { clearAllBatchTimers } from "../../../src/bots/chat-bot";
import { getAddresseeService } from "../../../src/services/addressee";
import { chatbotActions, store } from "../../../src/store";
import { createMockMessage, createMockUser } from "../../fixtures/discord";

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

    emit(event: string, ...args: unknown[]) {
      this.listeners[event]?.forEach((handler) => {
        handler(...args);
      });
    }

    login = vi.fn().mockResolvedValue("token");
  }

  return {
    ...actual,
    Client: MockClient,
  };
});

describe("E2E: Smart Reply End-to-End Suite", () => {
  const botUserId = "bot-123";
  const botConfig = {
    id: "chatBot",
    token: "fake-token",
    botConfig: {
      guilds: {
        "guild-123": {
          botName: "Jarvis",
          replyChannelIds: ["channel-123"],
          ignoredChannelIds: ["ignored-channel"],
          respondToMentions: true,
          smartReply: {
            enabled: true,
            mode: "ambient_intent" as const,
            ambientConfidenceThreshold: 0.75,
            debounceMs: 50,
            maxDebounceMs: 200,
            silenceDurationMinutes: 5,
            ambientRateLimitSeconds: 60,
          },
        },
      },
    },
  };

  beforeEach(() => {
    clearAllBatchTimers();
    store.dispatch(chatbotActions.clearAll());
    vi.restoreAllMocks();
  });

  it("Scenario A: Multi-User Rapid Interleaving isolates per-user queues and prevents buffer overwrites", async () => {
    const chatBot = new ChatBot(botConfig);
    chatBot.listenToNewMessages();

    const client = (
      chatBot as unknown as {
        client: { emit: (event: string, arg: unknown) => void };
      }
    ).client;

    const userAlice = createMockUser({ id: "user-alice", username: "alice" });
    const userBob = createMockUser({ id: "user-bob", username: "bob" });

    const msgAlice1 = createMockMessage({
      id: "msg-a1",
      author: userAlice,
      guildId: "guild-123",
      channelId: "channel-123",
      content: "Hello from Alice part 1",
      cleanContent: "Hello from Alice part 1",
      inGuild: () => true,
    });

    const msgBob = createMockMessage({
      id: "msg-b1",
      author: userBob,
      guildId: "guild-123",
      channelId: "channel-123",
      content: "Hello from Bob",
      cleanContent: "Hello from Bob",
      inGuild: () => true,
    });

    const msgAlice2 = createMockMessage({
      id: "msg-a2",
      author: userAlice,
      guildId: "guild-123",
      channelId: "channel-123",
      content: "Hello from Alice part 2",
      cleanContent: "Hello from Alice part 2",
      inGuild: () => true,
    });

    // Simulate rapid interleaving in channel-123
    client.emit("messageCreate", msgAlice1);
    client.emit("messageCreate", msgBob);
    client.emit("messageCreate", msgAlice2);

    await vi.waitFor(() => {
      const state = store.getState().chatbot;
      const channelBatches = state.userMessageBatches["channel-123"];
      expect(channelBatches).toBeDefined();

      const aliceBatch = channelBatches?.["user-alice"];
      const bobBatch = channelBatches?.["user-bob"];

      expect(aliceBatch).toBeDefined();
      expect(bobBatch).toBeDefined();

      expect(aliceBatch?.messages.length).toBe(2);
      expect(aliceBatch?.messages[0].content).toBe("Hello from Alice part 1");
      expect(aliceBatch?.messages[1].content).toBe("Hello from Alice part 2");

      expect(bobBatch?.messages.length).toBe(1);
      expect(bobBatch?.messages[0].content).toBe("Hello from Bob");
    });
  });

  it("Scenario B: Keyword dismissal silences the channel and sets silence cooldown", async () => {
    const chatBot = new ChatBot(botConfig);
    chatBot.listenToNewMessages();

    const client = (
      chatBot as unknown as {
        client: { emit: (event: string, arg: unknown) => void };
      }
    ).client;

    const user = createMockUser({ id: "user-alice", username: "alice" });
    const dismissalMsg = createMockMessage({
      id: "msg-dismissal",
      author: user,
      guildId: "guild-123",
      channelId: "channel-123",
      content: "not you bot, be quiet",
      cleanContent: "not you bot, be quiet",
      inGuild: () => true,
    });

    client.emit("messageCreate", dismissalMsg);

    await vi.waitFor(() => {
      const state = store.getState().chatbot;
      const silencedUntil = state.channelSilenceCooldowns["channel-123"];
      expect(silencedUntil).toBeDefined();
      expect(silencedUntil).toBeGreaterThan(Date.now());
      expect(dismissalMsg.react).toHaveBeenCalledWith("🤫");
    });
  });

  it("Scenario C: Reaction snooze silences the channel on negative reaction emoji", async () => {
    const chatBot = new ChatBot(botConfig);
    const client = (
      chatBot as unknown as {
        client: {
          emit: (event: string, reaction: unknown, user: unknown) => void;
        };
      }
    ).client;

    const mockReaction = {
      emoji: { name: "🤫" },
      message: {
        channelId: "channel-123",
        guildId: "guild-123",
      },
    };
    const mockUser = { bot: false };

    client.emit("messageReactionAdd", mockReaction, mockUser);

    await vi.waitFor(() => {
      const state = store.getState().chatbot;
      const silencedUntil = state.channelSilenceCooldowns["channel-123"];
      expect(silencedUntil).toBeDefined();
      expect(silencedUntil).toBeGreaterThan(Date.now());
    });
  });

  it("Scenario D: Explicit mentions bypass active silence cooldown", async () => {
    // 1. Manually silence channel-123 for 10 minutes
    store.dispatch(
      chatbotActions.silenceChannel({
        channelId: "channel-123",
        durationMinutes: 10,
      }),
    );

    const service = getAddresseeService();
    const regularMessage = createMockMessage({
      id: "msg-regular",
      content: "What is the weather today?",
    });

    const regularDecision = await service.resolveAddressee({
      message: regularMessage,
      botUserId,
      channelSilencedUntil:
        store.getState().chatbot.channelSilenceCooldowns["channel-123"],
    });
    expect(regularDecision.decision).toBe("ignore");
    expect(regularDecision.reason).toBe("channel_silenced");

    // 2. Explicit mention should still return respond
    const mentionMessage = createMockMessage({
      id: "msg-mention",
      content: "<@bot-123> help me please",
      mentions: {
        users: {
          has: (id: string) => id === botUserId,
          toJSON: () => [{ id: botUserId }],
        },
      },
    });

    const mentionDecision = await service.resolveAddressee({
      message: mentionMessage,
      botUserId,
      channelSilencedUntil:
        store.getState().chatbot.channelSilenceCooldowns["channel-123"],
    });
    expect(mentionDecision.decision).toBe("respond");
    expect(mentionDecision.reason).toBe("explicit_mention");
  });
});
