import {
  Client,
  Collection,
  GatewayIntentBits,
  Guild,
  Interaction,
  Message,
  MessageType,
} from "discord.js";
import BaseBot, { BaseBotConfig } from "./base-bot";
import { chatbotActions, store } from "../store";
import { AiPrompt, AppCommand, DiscordMessage } from "../types";
import { generateChatMessageWithGenAi, getGenAi } from "../utils/genAi";
import { splitEndingEmojis } from "../utils/emoji";
import { isAxiosError } from "axios";
import { parseCommands } from "../discord/helpers";

const BOT_REPLY_DELAY = 5000; // 5s
const MEMBER_FETCH_AGE = 24 * 60 * 60 * 1000; // 1 day in milliseconds

/** Fetch up-to-date member list to cache */
const validateServerMembersCache = async (guild: Guild) => {
  const { lastMemberFetch } = store.getState().chatbot;
  if (!lastMemberFetch || lastMemberFetch + MEMBER_FETCH_AGE < Date.now()) {
    await guild.members.fetch();
    store.dispatch(
      chatbotActions.setLastMemberFetch(Date.now() + MEMBER_FETCH_AGE)
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

      store.dispatch(chatbotActions.clearMessageBuffer(channel.id));

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
        chatbotActions.addMessageHistory({
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

interface ChatBotConfig extends BaseBotConfig {
  /** List of channel IDs where the bot is allowed to respond without being mentioning */
  freeChannelIds?: string[];
}

export default class ChatBot extends BaseBot {
  protected client: Client;
  config: ChatBotConfig;
  private commands = new Collection<string, AppCommand>();

  constructor(config: ChatBotConfig) {
    super(config);
    this.config = config;
    this.client = new Client({
      intents: [
        // TODO make sure to only use the intents needed
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessages,
      ],
    });
    this.handleNewMessage = this.handleNewMessage.bind(this);
  }

  async loadCommands() {
    const commandsToReg = await parseCommands();
    commandsToReg.forEach((command) => {
      this.commands.set(command.data.name, command);
    });
    console.log(`Loaded ${this.commands.size} commands.`);
  }

  protected async handleNewInteraction(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = this.commands.get(interaction.commandName);

    if (!command) {
      console.error(
        `No command matching ${interaction.commandName} was found.`
      );
      return;
    }

    try {
      await (command as AppCommand).execute(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "There was an error while executing this command!",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "There was an error while executing this command!",
          ephemeral: true,
        });
      }
    }
  }

  protected async handleNewMessage(message: Message<boolean>) {
    if (!message.channel.isSendable()) {
      console.log("Channel is not sendable, skipping message handling");
      return;
    }

    if (message.author.bot) return;

    // has attachment (haven't supported yet)
    // message.attachments.size !== 0 ||
    // has sticker (handling stickers not supported)
    if (message.stickers.size !== 0) return;

    // not a supported message type
    if (![MessageType.Default, MessageType.Reply].includes(message.type))
      return;

    if (!message.inGuild()) return;

    // the bot is not in free channels or being mentioned
    if (
      this.config.freeChannelIds &&
      !this.config.freeChannelIds.includes(message.channelId) &&
      !message.mentions.members?.has(this.client.user!.id)
    )
      return;

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
      chatbotActions.addMessageBuffer({
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
}
