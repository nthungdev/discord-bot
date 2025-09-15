import {
  Client,
  GatewayIntentBits,
  Guild,
  Interaction,
  Message,
  MessageType,
  userMention,
} from "discord.js";
import BaseBot, { BaseBotConfig } from "./base-bot";
import { getAnswer } from "../utils/wordle";
import { generateChatMessageWithGenAi, getGenAi } from "../utils/genAi";
import { policeBotActions, store } from "../store";
import { AiPrompt, DiscordMessage } from "../types";
import { splitEndingEmojis } from "../utils/emoji";
import { isAxiosError } from "axios";

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
    const { messageHistory, messageBuffer } = store.getState().chatbot;

    // get the messages from the user who last messaged
    const lastMessage = messageBuffer[channel.id].at(-1);
    if (!lastMessage) {
      console.log("No message in message buffer");
      return;
    }

    const messages: DiscordMessage[] = messageBuffer[channel.id]
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
      return acc.replaceAll(`@${mention.nickname}`, `@${mention.username}`);
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
      const genAi = getGenAi({ guildId: message.guildId });
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
          store.getState().chatbot.messageHistory[channel.id].length
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

interface Violation {
  reason: string;
  terms: string[];
}

const censorCharacter = "▓";

/**
 * Support regex for terms with accented characters and spaces
 */
function buildRegexFromTerms(terms: string[]) {
  const escapedTerms = terms.map((term) => {
    // Escape special regex characters, and normalize spaces
    const escaped = term
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+");
    return `(?<!\\p{L})${escaped}(?!\\p{L})`;
  });

  return new RegExp(escapedTerms.join("|"), "giu"); // g = global, i = ignore case, u = Unicode
}

export default class PoliceBot extends BaseBot {
  protected client: Client;

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

  private async getWordleAnswers() {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
    });

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // en-CA returns YYYY-MM-DD format
    const todayString = formatter.format(today);
    const yesterdayString = formatter.format(yesterday);
    const tomorrowString = formatter.format(tomorrow);

    const todayAnswer = await getAnswer(todayString);
    const yesterdayAnswer = await getAnswer(yesterdayString);
    const tomorrowAnswer = await getAnswer(tomorrowString);
    return [todayAnswer, yesterdayAnswer, tomorrowAnswer].filter(
      (a) => a !== null
    );
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
        this.handleViolatedMessage(message, violations);
      }

      // TODO reply to mentioned messages
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
    const censoredMessage = this.censorMessage(message.content, violations);

    await message.channel.sendTyping();

    const comment = await this.generateViolationComment(
      message.guild,
      violations.map((v) => v.reason),
      message.content
    );

    // The bot might quote the original message, so we need to censor it as well
    const censoredComment = this.censorMessage(comment, violations);

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
    await message.channel.send(this.getRandomPoliceGif());
  }

  private async analyzeMessageContent(message: string) {
    const bans = [
      {
        reason: `từ ngữ phân biệt chủng tộc tới người da đen`,
        terms: ["nig", "nigger", "niggers"],
      },
      {
        reason: `dùng từ cấm`,
        terms: ["3 que"],
      },
      {
        reason: `dùng từ bậy`,
        terms: [
          "faggot",
          "fuck",
          "shit",
          "bitch",
          "bitches",
          "asshole",
          "assholes",
          "ass hole",
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
          "loz",
          "cai lon",
          "lon tao",
          "cặc",
          "con cac",
        ],
      },
    ];

    const wordleAnswers = await this.getWordleAnswers();

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

  private censorMessage(message: string, violations: Violation[]) {
    let consoredMessage = message;
    for (const { terms } of violations) {
      for (const term of terms) {
        const regex = buildRegexFromTerms([term]);
        consoredMessage = consoredMessage.replaceAll(
          regex,
          censorCharacter.repeat(term.length)
        );
      }
    }
    return consoredMessage;
  }

  private getRandomPoliceGif() {
    const gifs = [
      "https://tenor.com/view/catpopo-gif-14363104828101683866",
      "https://tenor.com/view/cops-police-sirens-catching-crminals-what-you-gonna-do-gif-22472645",
      "https://tenor.com/view/pepe-gif-4322712730189377072",
      "https://tenor.com/view/eric-police-respect-respect-my-authority-south-park-gif-24479349",
      "https://tenor.com/view/super-tr-gif-18865790",
      "https://tenor.com/view/cop-police-popo-policeman-law-gif-17603106871416626477",
      "https://tenor.com/view/pokemon-squirtle-sunglasses-deal-with-it-gif-5634922",
      "https://tenor.com/view/dolerp-dole-department-of-law-enforcement-doj-five-m-gif-23229685",
      "https://tenor.com/view/shock-anime-akibas-trip-akibastrip-cop-gif-14686985010886003011",
      "https://tenor.com/view/police-costume-angel-vsfs-victorias-secret-victorias-secret-fasion-show-gif-13764354",
      "https://tenor.com/view/anime-order-is-the-rabbit-gif-9154127",
      "https://tenor.com/view/fbi-kana-gif-7441334008951759059",
      "https://tenor.com/view/police-anime-police-keisatsu-freeze-stop-it-gif-21413596",
      "https://tenor.com/view/handcuffs-brave-police-j-decker-arrested-anime-gif-17728544",
      "https://tenor.com/view/girls-frontline-handcuffs-animated-chibi-police-gif-17783252",
      "https://tenor.com/view/mai-sakurajima-gif-9999869741454015552",
      "https://tenor.com/view/anime-funny-hand-jail-crime-gif-8523482",
      "https://tenor.com/view/capoo-bugcat-cute-arrest-illegal-gif-26565715",
      "https://tenor.com/view/cat-gif-24925438",
      "https://tenor.com/view/police-peachu-pechu-afsar-gomu-peachu-gif-4643007441015917766",
      "https://tenor.com/view/handcuff-handcuffs-crime-criminal-illegal-gif-17983892065688760108",
      "https://tenor.com/view/peepo-police-gif-19704800",
      "https://tenor.com/view/stickers-bear-police-bear-siren-crawling-gif-15585735",
      "https://tenor.com/view/borzoi-siren-dawg-with-the-light-on-him-sailorzoop-dog-gif-2844905554045249724",
      "https://tenor.com/view/cat-fbi-fbi-open-up-gif-293416153668306594",
      "https://tenor.com/view/fbi-calling-telephone-dialing-tom-and-jerry-gif-17581243",
      "https://tenor.com/view/fbi-gif-19574432"
    ];
    const randomIndex = Math.floor(Math.random() * gifs.length);
    return gifs[randomIndex];
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
      systemInstruction: `Bạn là Popogon. Bạn là một police bot. Bạn đảm bảo mọi người trong Discord server tuân thủ luật. Bạn nói chuyện bằng tiếng Việt. Bạn châm biếm, hài hước, và mỉa mai. Bạn gọi người khác là sir và gọi bản thân là tôi. Bạn nói chuyện ngắn gọn nhưng xúc tích. Bạn không lập lại từ cấm của người khác. Bạn chỉ dùng emoji ở cuối cùng.`,
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
