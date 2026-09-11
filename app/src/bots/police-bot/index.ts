import { isAxiosError } from "axios";
import {
  Client,
  GatewayIntentBits,
  type Guild,
  type Interaction,
  type Message,
  MessageType,
  userMention,
} from "discord.js";
import type { BotGuildConfig } from "../../config/types";
import { getMemoryService } from "../../services/memory";
import { policeBotActions, store } from "../../store";
import { getToolRegistry } from "../../tools/registry";
import type { ToolDefinition, ToolExecutionContext } from "../../tools/types";
import type { AiPrompt, DiscordMessage, UserActorInfo } from "../../types";
import { splitEndingEmojis } from "../../utils/emoji";
import { generateChatMessageWithGenAi, getGenAi } from "../../utils/genAi";
import BaseBot, { type BaseBotConfig } from "./../base-bot";
import { detectRacistViolations } from "./detector";
import type { Violation } from "./types";
import {
  buildRegexFromTerms,
  censorMessage,
  getRandomPoliceGif,
  getWordleAnswers,
} from "./utils";

const DEFAULT_BOT_REPLY_DELAY = 5000; // 5s default
const MEMBER_FETCH_AGE = 24 * 60 * 60 * 1000; // 1 day in milliseconds

/** Fetch up-to-date member list to cache */
const validateServerMembersCache = async (guild: Guild) => {
  const { lastMemberFetch } = store.getState().policeBot;
  if (!lastMemberFetch || lastMemberFetch + MEMBER_FETCH_AGE < Date.now()) {
    await guild.members.fetch();
    store.dispatch(
      policeBotActions.setLastMemberFetch(Date.now() + MEMBER_FETCH_AGE),
    );
  }
};

// not recommended to store non-serialized objects in redux store,
// hence this is what we have
const messageTimeout: Record<string, NodeJS.Timeout> = {};
const setMessageTimeout = ({
  channelId,
  timeout,
}: {
  channelId: string;
  timeout: NodeJS.Timeout;
}) => {
  messageTimeout[channelId] = timeout;
};
const clearMessageTimeout = (channelId: string) => {
  clearTimeout(messageTimeout[channelId]);
};

const handleMessageTimeout = async (
  message: Message<boolean>,
  botId: string,
  guildConfig?: BotGuildConfig,
) => {
  console.log(`---handleMessageTimeout---`);

  try {
    if (!message.channel.isSendable()) {
      return;
    }

    await message.channel.sendTyping();

    const channelId = message.channelId;
    const userId = message.author.id;
    const channelBatches =
      store.getState().policeBot.userMessageBatches[channelId];
    const userBatch = channelBatches?.[userId];

    if (!userBatch || userBatch.messages.length === 0) {
      console.log("No message in user message buffer");
      return;
    }

    const messages = userBatch.messages;
    const lastMessage = messages[messages.length - 1];

    const text = messages
      .map((msg) => {
        const authorQuote = `${msg.authorUsername} says ${msg.cleanContent}`;
        if (msg.reference) {
          return `In reply to @${msg.reference.authorUsername} saying "${msg.reference.cleanContent}", ${authorQuote}`;
        }
        return authorQuote;
      })
      .join("\n");

    const messageMentions = messages.flatMap((m) => m.mentions);
    const textWithUsername = messageMentions.reduce((acc, mention) => {
      return acc.replaceAll(`@${mention.nickname}`, mention.nickname);
    }, text);

    const files = [
      ...messages.flatMap((m) => m.attachments),
      ...messages.flatMap((m) => m.reference?.attachments ?? []),
    ];

    const history = await getMemoryService().getHistory(botId, channelId);

    const enableDiscordTools = Boolean(guildConfig?.tools?.discord);
    const enableGoogleSearch = Boolean(guildConfig?.tools?.googleSearch);

    let tools: ToolDefinition[] | undefined;
    let toolContext: ToolExecutionContext | undefined;

    if (enableDiscordTools) {
      toolContext = {
        botId,
        client: message.client,
        guild: message.guild,
        channel: message.channel,
        messageId: message.id,
        author: {
          id: lastMessage.authorId,
          username: lastMessage.authorUsername,
          displayName: lastMessage.authorDisplayName,
        },
      };
      tools = await getToolRegistry().getAvailableTools(toolContext);
    }

    const prompt = {
      text: textWithUsername,
      files,
      history,
      tools,
      toolContext,
      enableGoogleSearch,
    } as AiPrompt;

    try {
      const genAi = getGenAi({
        apiKey: process.env.AI_API_KEY,
        guildId: message.guildId,
        systemInstruction: guildConfig?.systemInstruction,
      });
      await genAi.init();
      const { content, data } = await generateChatMessageWithGenAi(
        genAi,
        prompt,
        message.guild?.members.cache.toJSON().map((m) => ({
          id: m.id,
          nickname: m.nickname ?? m.displayName,
          username: m.user.username,
        })) || [],
        message.guild,
      );

      store.dispatch(policeBotActions.clearUserBatch({ channelId, userId }));

      if (content === "") {
        console.log({ data: JSON.stringify(data) });
      }

      const [finalMessage, endingEmoji] = splitEndingEmojis(content);

      await message.channel.send(finalMessage || "?");
      if (endingEmoji) {
        await message.channel.sendTyping();
        await message.channel.send(endingEmoji);
      }

      const actor: UserActorInfo = {
        userId: lastMessage.authorId,
        username: lastMessage.authorUsername,
        displayName: lastMessage.authorDisplayName,
      };

      await getMemoryService().addTurn(
        botId,
        channelId,
        text,
        content || "?",
        actor,
        message.guildId ?? undefined,
        "policeBot",
      );

      // debug
      console.log(`history updated for botId: ${botId}, channel: ${channelId}`);
    } catch (error) {
      console.error("Error generateContent");
      if (isAxiosError(error)) {
        console.error({
          name: error.name,
          message: error.message,
          error: error.toJSON(),
        });
      } else {
        console.error({ error });
      }
    }
  } catch (error: unknown) {
    console.error("Error handleMessageTimeout", error);
  }
};

export default class PoliceBot extends BaseBot {
  protected client: Client<true>;

  constructor(config: BaseBotConfig) {
    super(config);
    this.client = new Client({
      intents: [
        // TODO make sure to only use the intents needed
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessages,
      ],
    });
    this.handleNewMessage = this.handleNewMessage.bind(this);
  }

  protected handleNewInteraction(interaction: Interaction): Promise<void> {
    console.log(interaction.applicationId);
    throw new Error("Method not implemented.");
  }

  protected async handleNewMessage(message: Message<boolean>) {
    try {
      if (message.author.bot) return;

      if (!this.shouldHandleMessage(message)) return;

      if (!message.channel.isSendable()) {
        console.log("Channel is not sendable, skipping message handling");
        return;
      }

      // not a supported message type
      if (![MessageType.Default, MessageType.Reply].includes(message.type))
        return;

      // has attachment (haven't supported yet)
      // message.attachments.size !== 0 ||
      // has sticker (handling stickers not supported)
      if (message.stickers.size !== 0) return;

      const violations = await this.analyzeMessageContent(message.content);

      if (violations.length > 0) {
        await this.handleViolatedMessage(message, violations);
        return;
      }

      if (this.shouldReplyToMessage(message)) {
        await this.replyToMessage(message);
      }
    } catch (error) {
      console.log("Error handling new message in PoliceBot", error);
    }
  }

  private async replyToMessage(message: Message<boolean>) {
    if (!message.inGuild()) {
      return;
    }

    let refMessage: Message<boolean> | null = null;
    if (message.reference !== null) {
      refMessage = await message.channel.messages.fetch(
        message.reference.messageId!,
      );
    }

    await validateServerMembersCache(message.guild);
    const guildMember = message.guild.members.cache.get(message.author.id);
    const discordMessage: DiscordMessage = {
      authorId: message.author.id,
      content: message.content,
      authorUsername: message.author.username,
      authorDisplayName: guildMember?.nickname ?? message.author.displayName,
      cleanContent: message.cleanContent,
      reference: !refMessage
        ? undefined
        : {
            authorUsername: refMessage.author.username,
            content: refMessage.content,
            cleanContent: refMessage.cleanContent,
            attachments: refMessage.attachments
              .toJSON()
              .filter((a) => a.contentType !== null)
              .map((a) => ({
                uri: a.url,
                mimeType: a.contentType!,
              })),
          },
      mentions: message.mentions.users.toJSON().map((u) => ({
        id: u.id,
        nickname:
          message.guild?.members.cache.get(u.id)?.nickname ?? u.displayName,
        username: u.username,
      })),
      attachments: message.attachments
        .toJSON()
        .filter((a) => a.contentType !== null)
        .map((a) => ({
          uri: a.url,
          mimeType: a.contentType!,
        })),
    };

    store.dispatch(
      policeBotActions.appendUserMessage({
        channelId: message.channelId,
        userId: message.author.id,
        authorUsername: message.author.username,
        authorDisplayName: guildMember?.nickname ?? message.author.displayName,
        message: discordMessage,
      }),
    );

    const guildConfig = this.getGuildConfig(message.guildId);
    const replyDelay = guildConfig?.replyDelay ?? DEFAULT_BOT_REPLY_DELAY;

    clearMessageTimeout(message.channelId);
    setMessageTimeout({
      channelId: message.channelId,
      timeout: setTimeout(
        () => handleMessageTimeout(message, this.id, guildConfig),
        replyDelay,
      ),
    });
  }

  private async handleViolatedMessage(
    message: Message<boolean>,
    violations: Violation[],
  ) {
    if (!message.inGuild()) {
      return;
    }

    const censoredMessage = censorMessage(message.content, violations);

    await message.channel.sendTyping();

    const comment = await this.generateViolationComment(
      message.guild,
      violations.map((v) => v.reason),
      message.content,
    );

    // The bot might quote the original message, so we need to censor it as well
    const censoredComment = censorMessage(comment, violations);

    const quotedContent = `${userMention(message.author.id)} said:
${censoredMessage
  .split("\n")
  .map((line) => `> ${line}`)
  .join("\n")}`;
    console.log({ censoredMessage, quotedContent, violations });
    await message.reply(quotedContent);
    await Promise.all([
      await message.delete(),
      await message.channel.send(censoredComment),
    ]);
    await message.channel.send(getRandomPoliceGif());
  }

  private async analyzeMessageContent(message: string) {
    const violations: Violation[] = [...detectRacistViolations(message)];

    // Future ban categories preserved for reference:
    // {
    //   reason: `dùng từ cấm`,
    //   terms: ["3 que"],
    // },
    // {
    //   reason: `dùng từ bậy`,
    //   terms: [
    //     /s+h+(i|j)+t+/,
    //     /b+(i|j)+t+c+h+(e+s+)*/,
    //     /f+u+c*k+/,
    //     /a+s+\s*h+(o|0)+l+e+s*/,
    //     "faggot",
    //     "dit me",
    //     "địt mẹ",
    //     "du me",
    //     "đụ mẹ",
    //     "ditme",
    //     "đĩ",
    //     "điếm",
    //     "dit con me",
    //     "địt con mẹ",
    //     "địt con đĩ",
    //     "địt con điếm",
    //     "du ma",
    //     "đụ má",
    //     "chó đẻ",
    //     "chó đái",
    //     "chó chết",
    //     "lồn",
    //     /l+(o|0)+z+/,
    //     "cai lon",
    //     "lon tao",
    //     "cặc",
    //     "con cac",
    //   ],
    // },

    const wordleAnswers = await getWordleAnswers();

    if (wordleAnswers.length) {
      const regex = buildRegexFromTerms(wordleAnswers);
      const matches = [...message.matchAll(regex)];
      if (matches.length > 0) {
        violations.push({
          reason: "spoil wordle answer",
          terms: [...new Set(matches.map((m) => m[0]))],
        });
      }
    }

    return violations;
  }

  private async generateViolationComment(
    guild: Guild,
    violations: string[],
    originalMessage: string,
  ) {
    const violationString = violations.join(", ");
    const promptText = `What would you say to a user who violated: ${violationString}? They said: ${originalMessage}`;

    console.log(promptText);

    const guildConfig = this.getGuildConfig(guild.id);

    const genAi = getGenAi({
      apiKey: process.env.AI_API_KEY,
      guildId: guild.id,
      systemInstruction: guildConfig?.systemInstruction,
      membersInstruction: " ",
    });
    await genAi.init();
    const { content } = await generateChatMessageWithGenAi(
      genAi,
      { text: promptText },
      [],
      guild,
    );
    return content;
  }
}
