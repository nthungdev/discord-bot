import { describe, it, expect, vi } from "vitest";
import BaseBot, { BaseBotConfig } from "./base-bot";
import { Client, Message } from "discord.js";
import { createMockMessage } from "../../tests/fixtures/discord";

class TestBot extends BaseBot {
  client: Client;

  constructor(config: BaseBotConfig) {
    super(config);
    this.client = {
      user: { id: "bot-123", tag: "TestBot#0001" },
      on: vi.fn().mockReturnThis(),
      once: vi.fn().mockImplementation((event, cb) => {
        if (event === "ready") {
          cb({ user: { tag: "TestBot#0001" } });
        }
        return this.client;
      }),
      login: vi.fn().mockResolvedValue("token"),
    } as unknown as Client;
  }

  async handleNewMessage(message: Message): Promise<void> {
    if (message.channel.isSendable()) {
      await message.channel.send("handled");
    }
  }

  async handleNewInteraction(): Promise<void> {}

  // Expose protected methods for testing
  public testGetGuildConfig(guildId?: string | null) {
    return this.getGuildConfig(guildId);
  }

  public testShouldHandleMessage(message: Message) {
    return this.shouldHandleMessage(message);
  }

  public testShouldReplyToMessage(message: Message) {
    return this.shouldReplyToMessage(message);
  }
}

describe("BaseBot", () => {
  const config: BaseBotConfig = {
    id: "testBot",
    token: "fake-token",
    botConfig: {
      guilds: {
        "guild-1": {
          replyChannelIds: ["channel-1"],
          ignoredChannelIds: ["channel-ignored"],
          respondToMentions: true,
        },
      },
    },
  };

  it("should get guild config when guild exists in config", () => {
    const bot = new TestBot(config);
    const guildConfig = bot.testGetGuildConfig("guild-1");
    expect(guildConfig).toEqual({
      replyChannelIds: ["channel-1"],
      ignoredChannelIds: ["channel-ignored"],
      respondToMentions: true,
    });
  });

  it("should return undefined for unconfigured guild", () => {
    const bot = new TestBot(config);
    expect(bot.testGetGuildConfig("unconfigured")).toBeUndefined();
    expect(bot.testGetGuildConfig(null)).toBeUndefined();
  });

  it("should correctly determine if message should be handled", () => {
    const bot = new TestBot(config);

    const validMessage = createMockMessage({
      guildId: "guild-1",
      channelId: "channel-1",
      inGuild: () => true,
    });
    expect(bot.testShouldHandleMessage(validMessage)).toBe(true);

    const ignoredMessage = createMockMessage({
      guildId: "guild-1",
      channelId: "channel-ignored",
      inGuild: () => true,
    });
    expect(bot.testShouldHandleMessage(ignoredMessage)).toBe(false);

    const nonGuildMessage = createMockMessage({
      inGuild: () => false,
    });
    expect(bot.testShouldHandleMessage(nonGuildMessage)).toBe(false);
  });

  it("should correctly determine if message should be replied to", () => {
    const bot = new TestBot(config);

    const replyChannelMessage = createMockMessage({
      guildId: "guild-1",
      channelId: "channel-1",
      inGuild: () => true,
    });
    expect(bot.testShouldReplyToMessage(replyChannelMessage)).toBe(true);

    const nonReplyChannelMessage = createMockMessage({
      guildId: "guild-1",
      channelId: "channel-2",
      inGuild: () => true,
    });
    expect(bot.testShouldReplyToMessage(nonReplyChannelMessage)).toBe(false);
  });

  it("should register message and interaction listeners", () => {
    const bot = new TestBot(config);
    bot.listenToNewMessages();
    bot.listenToNewInteractions();

    expect(bot.client.on).toHaveBeenCalledWith("messageCreate", expect.any(Function));
    expect(bot.client.on).toHaveBeenCalledWith("interactionCreate", expect.any(Function));
  });

  it("should login successfully", async () => {
    const bot = new TestBot(config);
    await expect(bot.login()).resolves.not.toThrow();
  });
});
