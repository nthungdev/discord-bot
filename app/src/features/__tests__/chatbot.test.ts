import { describe, it, expect } from "vitest";
import { createChatbotSlice } from "./chatbot";
import type { DiscordMessage } from "../types";

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
      messageBuffer: {},
    });
  });

  it("should add a message to the buffer", () => {
    const message = createSampleDiscordMessage();

    const nextState = reducer(
      undefined,
      actions.addMessageBuffer({ channelId: "channel-1", message }),
    );

    expect(nextState.messageBuffer["channel-1"]).toEqual([message]);
  });

  it("should clear the message buffer for a specific channel", () => {
    const message = createSampleDiscordMessage();
    const initialState = {
      messageHistory: {},
      messageBuffer: {
        "channel-1": [message],
      },
    };

    const nextState = reducer(
      initialState,
      actions.clearMessageBuffer("channel-1"),
    );

    expect(nextState.messageBuffer["channel-1"]).toEqual([]);
  });

  it("should add user and bot message pair to message history", () => {
    const nextState = reducer(
      undefined,
      actions.addMessageHistory({
        channelId: "channel-1",
        userMessage: "Hello bot",
        botMessage: "Hello human",
      }),
    );

    expect(nextState.messageHistory["channel-1"]).toEqual([
      { author: "user", content: "Hello bot" },
      { author: "bot", content: "Hello human" },
    ]);
  });

  it("should clear all message history and buffer on clearAll", () => {
    const populatedState = {
      messageHistory: {
        "channel-1": [{ author: "user" as const, content: "hi" }],
      },
      messageBuffer: {
        "channel-1": [createSampleDiscordMessage({ content: "hi" })],
      },
    };

    const clearedState = reducer(populatedState, actions.clearAll());
    expect(clearedState.messageHistory).toEqual({});
    expect(clearedState.messageBuffer).toEqual({});
  });
});
