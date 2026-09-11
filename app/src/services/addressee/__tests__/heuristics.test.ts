import type { Message } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  createMockChannel,
  createMockMessage,
  createMockUser,
} from "../../../../tests/fixtures/discord";
import {
  evaluateTier1Heuristics,
  isAddressedToOtherUser,
  isBotAuthor,
  isBotOwnedThread,
  isChannelOptedOut,
  isChannelSilenced,
  isDirectReplyToBot,
  isExplicitBotMention,
  isVocativeAddressing,
  startsWithCommandPrefix,
} from "../heuristics";

describe("Addressee Tier 1 Deterministic Heuristics", () => {
  const botUserId = "bot-123";

  it("should detect bot author", () => {
    const userMsg = createMockMessage({
      author: createMockUser({ bot: false }),
    });
    const botMsg = createMockMessage({ author: createMockUser({ bot: true }) });

    expect(isBotAuthor(userMsg)).toBe(false);
    expect(isBotAuthor(botMsg)).toBe(true);
  });

  it("should detect opted-out channels via ignored list and topic tag", () => {
    const regularChannel = createMockChannel({ id: "chan-1" });
    const optedOutChannel = createMockChannel({
      id: "chan-2",
      topic: "Welcome! [no-bot] Please do not ping bot here",
    });

    const msg1 = createMockMessage({
      channel: regularChannel,
      channelId: "chan-1",
    });
    const msg2 = createMockMessage({
      channel: optedOutChannel,
      channelId: "chan-2",
    });

    const guildConfig = {
      replyChannelIds: [],
      ignoredChannelIds: ["ignored-chan"],
      respondToMentions: true,
    };

    expect(isChannelOptedOut(msg1, guildConfig)).toBe(false);
    expect(isChannelOptedOut(msg2, guildConfig)).toBe(true);
    expect(
      isChannelOptedOut(
        createMockMessage({ channelId: "ignored-chan" }),
        guildConfig,
      ),
    ).toBe(true);
  });

  it("should detect active channel silence cooldown", () => {
    const now = 5000;
    expect(isChannelSilenced(6000, now)).toBe(true);
    expect(isChannelSilenced(4000, now)).toBe(false);
    expect(isChannelSilenced(undefined, now)).toBe(false);
  });

  it("should detect command prefixes", () => {
    expect(startsWithCommandPrefix("!help")).toBe(true);
    expect(startsWithCommandPrefix("/ping")).toBe(true);
    expect(startsWithCommandPrefix("$balance")).toBe(true);
    expect(startsWithCommandPrefix("~music")).toBe(true);
    expect(startsWithCommandPrefix("Hello world")).toBe(false);
  });

  it("should detect when message is addressed to other user", () => {
    const humanRefMsg = createMockMessage({
      author: createMockUser({ id: "user-456" }),
    });
    const botRefMsg = createMockMessage({
      author: createMockUser({ id: botUserId }),
    });

    const regularMsg = createMockMessage();
    expect(isAddressedToOtherUser(regularMsg, humanRefMsg, botUserId)).toBe(
      true,
    );
    expect(isAddressedToOtherUser(regularMsg, botRefMsg, botUserId)).toBe(
      false,
    );
  });

  it("should detect bot-owned thread", () => {
    const threadChannel = {
      ...createMockChannel(),
      isThread: () => true,
      ownerId: botUserId,
    } as unknown as Message["channel"];

    const nonThreadChannel = {
      ...createMockChannel(),
      isThread: () => false,
      ownerId: botUserId,
    } as unknown as Message["channel"];

    expect(
      isBotOwnedThread(
        createMockMessage({ channel: threadChannel }),
        botUserId,
      ),
    ).toBe(true);
    expect(
      isBotOwnedThread(
        createMockMessage({ channel: nonThreadChannel }),
        botUserId,
      ),
    ).toBe(false);
  });

  it("should detect explicit bot mention", () => {
    const msgWithMention = createMockMessage({
      mentions: {
        users: {
          has: (id: string) => id === botUserId,
          toJSON: () => [{ id: botUserId }],
        },
      },
    });
    const msgWithoutMention = createMockMessage({
      mentions: {
        users: {
          has: () => false,
          toJSON: () => [],
        },
      },
    });

    expect(isExplicitBotMention(msgWithMention, botUserId)).toBe(true);
    expect(isExplicitBotMention(msgWithoutMention, botUserId)).toBe(false);
  });

  it("should detect direct reply to bot", () => {
    const botMsg = createMockMessage({
      author: createMockUser({ id: botUserId }),
    });
    const userMsg = createMockMessage({
      author: createMockUser({ id: "user-999" }),
    });

    expect(isDirectReplyToBot(botMsg, botUserId)).toBe(true);
    expect(isDirectReplyToBot(userMsg, botUserId)).toBe(false);
  });

  it("should detect vocative addressing", () => {
    expect(isVocativeAddressing("Hey bot, what is 2+2?")).toBe(true);
    expect(isVocativeAddressing("bot tell me a joke")).toBe(true);
    expect(isVocativeAddressing("Hello Jarvis help me", "Jarvis")).toBe(true);
    expect(isVocativeAddressing("Jarvis, what's new?", "Jarvis")).toBe(true);
    expect(isVocativeAddressing("Is this a good day?")).toBe(false);
  });

  it("should evaluate tier 1 heuristics pipeline completely", () => {
    const baseMsg = createMockMessage({
      content: "hey bot explain typescript",
    });
    const result = evaluateTier1Heuristics({
      message: baseMsg,
      botUserId,
      botName: "Jarvis",
    });

    expect(result).toEqual({
      decision: "respond",
      tier: "tier1_deterministic",
      reason: "vocative_name",
      confidence: 1.0,
    });
  });
});
