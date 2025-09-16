import {
  Client,
  GatewayIntentBits,
  Guild,
  Interaction,
  Message,
  MessageType,
  userMention,
} from "discord.js";
import BaseBot, { BaseBotConfig } from "./../base-bot";
import { generateChatMessageWithGenAi, getGenAi } from "../../utils/genAi";
import { policeBotActions, store } from "../../store";
import { AiPrompt, DiscordMessage } from "../../types";
import { splitEndingEmojis } from "../../utils/emoji";
import { isAxiosError } from "axios";
import { Violation } from "./types";
import {
  buildRegexFromTerms,
  censorMessage,
  getRandomPoliceGif,
  getWordleAnswers,
} from "./utils";

const SYSTEM_INSTRUCTION = `Bạn là Popogon. Bạn là một police bot. Bạn đảm bảo mọi người trong Discord server tuân thủ luật, ngoại từ bản thân bạn. Bạn nói chuyện bằng tiếng Việt. Bạn châm biếm, hài hước, và mỉa mai. Bạn gọi người khác là sir và gọi bản thân là tôi. Bạn nói chuyện ngắn gọn nhưng xúc tích. Bạn không lập lại từ cấm của người khác. Bạn không ngần ngại mắng người khác. Bạn phạt người bị report làm việc sai trái. Bạn chỉ dùng emoji ở cuối cùng.`;
const BOT_REPLY_DELAY = 5000; // 5s
const MEMBER_FETCH_AGE = 24 * 60 * 60 * 1000; // 1 day in milliseconds

/** Fetch up-to-date member list to cache */
const validateServerMembersCache = async (guild: Guild) => {
  const { lastMemberFetch } = store.getState().policeBot;
  if (!lastMemberFetch || lastMemberFetch + MEMBER_FETCH_AGE < Date.now()) {
    await guild.members.fetch();
    store.dispatch(
      policeBotActions.setLastMemberFetch(Date.now() + MEMBER_FETCH_AGE)
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

const handleMessageTimeout = async (message: Message<boolean>) => {
  console.log(`---handleMessageTimeout---`);

  try {
    if (!message.channel.isSendable()) {
      return;
    }

    await message.channel.sendTyping();

    const { channel } = message;
    const { messageHistory, messageBuffer } = store.getState().policeBot;

    // get the messages from the user who last messaged
    const lastMessage = messageBuffer[channel.id]?.at(-1);
    if (!lastMessage) {
      console.log("No message in message buffer");
      return;
    }

    const messages: DiscordMessage[] = (messageBuffer[channel.id] ?? [])
      .filter((m) => m.authorId === lastMessage.authorId)
      .toReversed();

    const text = messages
      .reduce((acc, message) => {
        const authorQuote = `${message.authorUsername} says ${message.cleanContent}`;
        if (message.reference) {
          return [
            ...acc,
            // TODO parse and replace nicknames in reference with usernames
            `In reply to @${message.reference.authorUsername} saying "${message.reference.cleanContent}", ${authorQuote}`,
          ];
        } else {
          return [...acc, authorQuote];
        }
      }, [] as string[])
      .join("\n");

    const messageMentions = messages.flatMap((m) => m.mentions);
    // replace nicknames in prompt with username so that the model returns back with references to username
    // then username is replaced with formatted mentions in the final message
    const textWithUsername = messageMentions.reduce((acc, mention) => {
      // return acc.replaceAll(`@${mention.nickname}`, `@${mention.username}`);
      return acc.replaceAll(`@${mention.nickname}`, mention.nickname);
    }, text);

    const files = [
      ...messages.flatMap((m) => m.attachments),
      ...messages.flatMap((m) => m.reference?.attachments ?? []),
    ];

    const prompt = {
      text: textWithUsername,
      files,
      history: messageHistory[channel.id] || [],
    } as AiPrompt;

    console.log(`promptText: ${prompt.text}`);

    try {
      const genAi = getGenAi({
        guildId: message.guildId,
        systemInstruction: SYSTEM_INSTRUCTION,
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
        message.guild
      );

      console.log({
        user: textWithUsername,
        bot: content,
      });

      store.dispatch(policeBotActions.clearMessageBuffer(channel.id));

      if (content === "") {
        console.log({ data: JSON.stringify(data) });
      }

      const [finalMessage, endingEmoji] = splitEndingEmojis(content);

      // TODO is this a good answer when model doesn't have a reply?
      await channel.send(finalMessage || "?");
      if (endingEmoji) {
        await channel.sendTyping();
        await channel.send(endingEmoji);
      }

      // save conversation into history
      store.dispatch(
        policeBotActions.addMessageHistory({
          channelId: channel.id,
          userMessage: text,
          botMessage: content || "?",
        })
      );

      // debug
      console.log(
        `history size: ${
          store.getState().policeBot.messageHistory[channel.id].length
        }`
      );
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

      if (!message.inGuild()) return;

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

      if (message.mentions.members?.has(this.client.user!.id)) {
        await this.replyToMessage(message);
      }
    } catch (error) {
      console.log("Error handling new message in PoliceBot", error);
    }
  }

  private async replyToMessage(message: Message<true>) {
    let refMessage: Message<boolean> | null = null;
    if (message.reference !== null) {
      refMessage = await message.channel.messages.fetch(
        message.reference.messageId!
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
      policeBotActions.addMessageBuffer({
        message: discordMessage,
        channelId: message.channelId,
      })
    );

    clearMessageTimeout(message.channelId);
    setMessageTimeout({
      channelId: message.channelId,
      timeout: setTimeout(() => handleMessageTimeout(message), BOT_REPLY_DELAY),
    });
  }

  private async handleViolatedMessage(
    message: Message<true>,
    violations: Violation[]
  ) {
    const censoredMessage = censorMessage(message.content, violations);

    await message.channel.sendTyping();

    const comment = await this.generateViolationComment(
      message.guild,
      violations.map((v) => v.reason),
      message.content
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
    const bans = [
      {
        reason: `từ ngữ phân biệt chủng tộc tới người da đen`,
        terms: [/n+i+g+e+r+s*/, /n+i+g+a*r*s*/],
      },
      {
        reason: `dùng từ cấm`,
        terms: ["3 que"],
      },
      {
        reason: `dùng từ bậy`,
        terms: [
          /s+h+(i|j)+t+/,
          /b+(i|j)+t+c+h+(e+s+)*/,
          /f+u+c*k+/,
          /a+s+\s*h+(o|0)+l+e+s*/,
          "faggot",
          "dit me",
          "địt mẹ",
          "du me",
          "đụ mẹ",
          "ditme",
          "đĩ",
          "điếm",
          "dit con me",
          "địt con mẹ",
          "địt con đĩ",
          "địt con điếm",
          "du ma",
          "đụ má",
          "chó đẻ",
          "chó đái",
          "chó chết",
          "lồn",
          /l+(o|0)+z+/,
          "cai lon",
          "lon tao",
          "cặc",
          "con cac",
        ],
      },
    ];

    const wordleAnswers = await getWordleAnswers();

    if (wordleAnswers.length) {
      bans.push({
        reason: "spoil wordle answer",
        terms: wordleAnswers,
      });
    }

    const violations: Violation[] = [];
    for (const { reason, terms } of bans) {
      const violatedTerms = [];
      const regex = buildRegexFromTerms(terms);
      const matches = [...message.matchAll(regex)];
      if (matches.length === 0) continue;
      violatedTerms.push(...matches.map((m) => m[0]));
      violations.push({
        reason,
        terms: violatedTerms,
      });
    }

    return violations;
  }

  private async generateViolationComment(
    guild: Guild,
    violations: string[],
    originalMessage: string
  ) {
    const violationString = violations.join(", ");
    const promptText = `What would you say to a user who violated: ${violationString}? They said: ${originalMessage}`;

    console.log(promptText);

    const genAi = getGenAi({
      guildId: guild.id,
      systemInstruction: SYSTEM_INSTRUCTION,
      membersInstruction: " ",
    });
    await genAi.init();
    const { content } = await generateChatMessageWithGenAi(
      genAi,
      { text: promptText },
      [],
      guild
    );
    return content;
  }
}
