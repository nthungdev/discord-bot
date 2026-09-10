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
import { AiPrompt, AppCommand, DiscordMessage, UserActorInfo } from "../types";
import { generateChatMessageWithGenAi, getGenAi } from "../utils/genAi";
import { getMemoryService } from "../services/memory";
import { splitEndingEmojis } from "../utils/emoji";
import { isAxiosError } from "axios";
import { parseCommands } from "../discord/helpers";
import { ToolDefinition, ToolExecutionContext } from "../tools/types";
import { getToolRegistry } from "../tools/registry";
import { BotGuildConfig } from "../config/types";

const DEFAULT_BOT_REPLY_DELAY = 5000; // 5s default
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

const handleMessageTimeout = async (
  message: Message<boolean>,
  botId: string,
  guildConfig?: BotGuildConfig
) => {
  console.log(`---handleMessageTimeout---`);

  if (!message.channel.isSendable()) {
    return;
  }

  // Capture the narrowed sendable channel so the interval callback retains
  // the correct type (isSendable narrowing doesn't propagate into closures).
  const sendableChannel = message.channel;

  // Discord's typing indicator expires after ~10s, so refresh it every 8s.
  // try/finally guarantees the interval is always cleared on exit.
  await sendableChannel.sendTyping();
  const typingInterval = setInterval(() => {
    sendableChannel.sendTyping().catch(() => {});
  }, 8000);

  try {
    const { channel } = message;
    const { messageBuffer } = store.getState().chatbot;

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

    const history = await getMemoryService().getHistory(botId, channel.id);

    const enableDiscordTools = Boolean(guildConfig?.tools?.discord);
    const enableGoogleSearch = Boolean(guildConfig?.tools?.googleSearch);

    let tools: ToolDefinition[] | undefined = undefined;
    let toolContext: ToolExecutionContext | undefined = undefined;

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

    console.log(`promptText: ${prompt.text}`);

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

      // save conversation into persistent memory
      const actor: UserActorInfo = {
        userId: lastMessage.authorId,
        username: lastMessage.authorUsername,
        displayName: lastMessage.authorDisplayName,
      };

      await getMemoryService().addTurn(
        botId,
        channel.id,
        text,
        content || "?",
        actor,
        message.guildId ?? undefined,
        "chatBot"
      );

      // debug
      console.log(`history updated for botId: ${botId}, channel: ${channel.id}`);
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
  } finally {
    clearInterval(typingInterval);
  }
};

export default class ChatBot extends BaseBot {
  protected client: Client;
  config: BaseBotConfig;
  private commands = new Collection<string, AppCommand>();

  constructor(config: BaseBotConfig) {
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

    if (!this.shouldReplyToMessage(message))
      return;

    if (!message.inGuild()) return;

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

    const guildConfig = this.getGuildConfig(message.guildId);
    const replyDelay = guildConfig?.replyDelay ?? DEFAULT_BOT_REPLY_DELAY;

    clearMessageTimeout(message.channelId);
    setMessageTimeout({
      channelId: message.channelId,
      timeout: setTimeout(
        () => handleMessageTimeout(message, this.id, guildConfig),
        replyDelay
      ),
    });
  }
}
