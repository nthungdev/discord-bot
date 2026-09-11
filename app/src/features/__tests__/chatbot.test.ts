import { describe, expect, it } from "vitest";
import type { DiscordMessage } from "../../types";
import { createChatbotSlice, PRUNED_HISTORY_LENGTH } from "../chatbot";

describe("chatbot feature slice", () => {
  const slice = createChatbotSlice("testChatbot");
  const { reducer, actions } = slice;

  const createSampleDiscordMessage = (
    overrides?: Partial<DiscordMessage>,
  ): DiscordMessage => ({
    authorId: "user-1",
    authorDisplayName: "Alice",
    authorUsername: "alice",
    content: "Hello",
    cleanContent: "Hello",
    mentions: [],
    attachments: [],
    ...overrides,
  });

  it("should return the initial state", () => {
    const state = reducer(undefined, { type: "UNKNOWN" });
    expect(state).toEqual({
      messageHistory: {},
      userMessageBatches: {},
      activeUserSessions: {},
      channelSilenceCooldowns: {},
    });
  });

  it("should append a message to a user batch", () => {
    const message = createSampleDiscordMessage();
    const timestamp = 1000;

    const nextState = reducer(
      undefined,
      actions.appendUserMessage({
        channelId: "channel-1",
        userId: "user-1",
        authorUsername: "alice",
        authorDisplayName: "Alice",
        message,
        timestamp,
      }),
    );

    expect(nextState.userMessageBatches["channel-1"]["user-1"]).toEqual({
      userId: "user-1",
      authorUsername: "alice",
      authorDisplayName: "Alice",
      messages: [message],
      firstMessageTimestamp: timestamp,
      lastMessageTimestamp: timestamp,
      isProcessing: false,
    });
  });

  it("should accumulate multiple messages for the same user in a channel", () => {
    const message1 = createSampleDiscordMessage({ content: "Part 1" });
    const message2 = createSampleDiscordMessage({ content: "Part 2" });

    let state = reducer(
      undefined,
      actions.appendUserMessage({
        channelId: "channel-1",
        userId: "user-1",
        authorUsername: "alice",
        authorDisplayName: "Alice",
        message: message1,
        timestamp: 1000,
      }),
    );

    state = reducer(
      state,
      actions.appendUserMessage({
        channelId: "channel-1",
        userId: "user-1",
        authorUsername: "alice",
        authorDisplayName: "Alice Updated",
        message: message2,
        timestamp: 2000,
      }),
    );

    const batch = state.userMessageBatches["channel-1"]["user-1"];
    expect(batch.messages).toEqual([message1, message2]);
    expect(batch.firstMessageTimestamp).toBe(1000);
    expect(batch.lastMessageTimestamp).toBe(2000);
    expect(batch.authorDisplayName).toBe("Alice Updated");
  });

  it("should clear the user batch for a specific user in a channel", () => {
    const message = createSampleDiscordMessage();
    const stateWithBatch = reducer(
      undefined,
      actions.appendUserMessage({
        channelId: "channel-1",
        userId: "user-1",
        authorUsername: "alice",
        authorDisplayName: "Alice",
        message,
      }),
    );

    const nextState = reducer(
      stateWithBatch,
      actions.clearUserBatch({ channelId: "channel-1", userId: "user-1" }),
    );

    expect(nextState.userMessageBatches["channel-1"]["user-1"]).toBeUndefined();
  });

  it("should clear all batches in a channel", () => {
    let state = reducer(
      undefined,
      actions.appendUserMessage({
        channelId: "channel-1",
        userId: "user-1",
        authorUsername: "alice",
        authorDisplayName: "Alice",
        message: createSampleDiscordMessage(),
      }),
    );
    state = reducer(
      state,
      actions.appendUserMessage({
        channelId: "channel-1",
        userId: "user-2",
        authorUsername: "bob",
        authorDisplayName: "Bob",
        message: createSampleDiscordMessage({ authorId: "user-2" }),
      }),
    );

    const nextState = reducer(state, actions.clearChannelBatches("channel-1"));
    expect(nextState.userMessageBatches["channel-1"]).toBeUndefined();
  });

  it("should set user batch processing state", () => {
    const stateWithBatch = reducer(
      undefined,
      actions.appendUserMessage({
        channelId: "channel-1",
        userId: "user-1",
        authorUsername: "alice",
        authorDisplayName: "Alice",
        message: createSampleDiscordMessage(),
      }),
    );

    const processingState = reducer(
      stateWithBatch,
      actions.setUserBatchProcessing({
        channelId: "channel-1",
        userId: "user-1",
        isProcessing: true,
      }),
    );
    expect(
      processingState.userMessageBatches["channel-1"]["user-1"].isProcessing,
    ).toBe(true);
  });

  it("should record active user sessions", () => {
    const nextState = reducer(
      undefined,
      actions.recordUserActivity({
        channelId: "channel-1",
        userId: "user-1",
        timestamp: 5000,
      }),
    );

    expect(nextState.activeUserSessions["channel-1"]["user-1"]).toBe(5000);
  });

  it("should handle channel silence cooldowns", () => {
    const now = 10000;
    const durationMinutes = 5;
    const expectedExpiry = now + durationMinutes * 60 * 1000;

    const silencedState = reducer(
      undefined,
      actions.silenceChannel({
        channelId: "channel-1",
        untilTimestamp: expectedExpiry,
      }),
    );

    expect(silencedState.channelSilenceCooldowns["channel-1"]).toBe(
      expectedExpiry,
    );

    const clearedState = reducer(
      silencedState,
      actions.clearChannelSilence("channel-1"),
    );
    expect(clearedState.channelSilenceCooldowns["channel-1"]).toBeUndefined();
  });

  it("should clear expired cooldowns", () => {
    const initialState = {
      messageHistory: {},
      userMessageBatches: {},
      activeUserSessions: {},
      channelSilenceCooldowns: {
        "expired-channel": 1000,
        "active-channel": 5000,
      },
    };

    const nextState = reducer(
      initialState,
      actions.clearExpiredCooldowns({ now: 3000 }),
    );

    expect(
      nextState.channelSilenceCooldowns["expired-channel"],
    ).toBeUndefined();
    expect(nextState.channelSilenceCooldowns["active-channel"]).toBe(5000);
  });

  it("should add user and bot message pair to message history and prune when exceeding max", () => {
    let state = reducer(undefined, { type: "UNKNOWN" });

    for (let i = 0; i < 25; i++) {
      state = reducer(
        state,
        actions.addMessageHistory({
          channelId: "channel-1",
          userMessage: `User message ${i}`,
          botMessage: `Bot message ${i}`,
        }),
      );
    }

    expect(state.messageHistory["channel-1"].length).toBe(
      PRUNED_HISTORY_LENGTH + 8,
    );
  });

  it("should clear all state on clearAll", () => {
    const populatedState = {
      messageHistory: {
        "channel-1": [{ author: "user" as const, content: "hi" }],
      },
      userMessageBatches: {
        "channel-1": {
          "user-1": {
            userId: "user-1",
            authorUsername: "alice",
            authorDisplayName: "Alice",
            messages: [createSampleDiscordMessage({ content: "hi" })],
            firstMessageTimestamp: 100,
            lastMessageTimestamp: 100,
            isProcessing: false,
          },
        },
      },
      activeUserSessions: {
        "channel-1": { "user-1": 100 },
      },
      channelSilenceCooldowns: {
        "channel-1": 200,
      },
    };

    const clearedState = reducer(populatedState, actions.clearAll());
    expect(clearedState.messageHistory).toEqual({});
    expect(clearedState.userMessageBatches).toEqual({});
    expect(clearedState.activeUserSessions).toEqual({});
    expect(clearedState.channelSilenceCooldowns).toEqual({});
  });
});
