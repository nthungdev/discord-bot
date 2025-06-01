import { Guild, Message, MessageType } from "discord.js";
import { AxiosError } from "axios";
import client from ".";
import {
  addMessageBuffer,
  addMessageHistory,
  clearMessageBuffer,
  selectChatbotState,
  selectMessageHistory,
  setLastMemberFetch,
} from "../features/chatbot";
import { store } from "../store";
// import { generateContent } from '../ai'
import { AiPrompt, DiscordMessage } from "../types";
import { splitEndingEmojis } from "../utils/emoji";
import { generateChatMessageWithGenAi, getGenAi } from "../utils/genAi";

const BOT_REPLY_DELAY = 5000; // 5s
const MEMBER_FETCH_AGE = 24 * 60 * 60 * 1000; // 1 day in milliseconds

/** Fetch up-to-date member list to cache */
const validateServerMembersCache = async (guild: Guild) => {
  const { lastMemberFetch } = selectChatbotState(store.getState());
  if (!lastMemberFetch || lastMemberFetch + MEMBER_FETCH_AGE < Date.now()) {
    await guild.members.fetch();
    setLastMemberFetch(Date.now() + MEMBER_FETCH_AGE);
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
    const { messageHistory, messageBuffer } = selectChatbotState(
      store.getState(),
    );

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
        message.guild,
      );

      console.log({
        user: textWithUsername,
        bot: content,
      });

      store.dispatch(clearMessageBuffer(channel.id));

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
        addMessageHistory({
          channelId: channel.id,
          userMessage: text,
          botMessage: content || "?",
        }),
      );

      // debug
      console.log(
        `history size: ${
          selectMessageHistory(store.getState())[channel.id].length
        }`,
      );
    } catch (error) {
      console.error("Error generateContent");
      if (error instanceof AxiosError) {
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

export const handleChatbot =
  ({
    allowedServers = [],
    freeChannels = [],
  }: {
    allowedServers?: string[];
    freeChannels?: string[];
  } = {}) =>
  async (message: Message<boolean>) => {
    // skip handling this message when:
    if (
      // incoming message not coming from allowed channels
      !allowedServers.includes(message.guildId || "") ||
      // message from the bot itself
      message.author.id === client.user!.id ||
      // // has attachment (haven't supported yet)
      // message.attachments.size !== 0 ||
      // has sticker (handling stickers not supported)
      message.stickers.size !== 0 ||
      // not a supported message type
      ![MessageType.Default, MessageType.Reply].includes(
        Number(message.type.toString()),
      ) ||
      // the bot is not being mentioned when channel requires so
      (!freeChannels.includes(message.channelId) &&
        !message.mentions.members?.has(client.user!.id)) ||
      // is a DM message (DM not supported)
      message.guild === null
    ) {
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
      addMessageBuffer({
        message: discordMessage,
        channelId: message.channelId,
      }),
    );

    clearMessageTimeout(message.channelId);
    setMessageTimeout({
      channelId: message.channelId,
      timeout: setTimeout(() => handleMessageTimeout(message), BOT_REPLY_DELAY),
    });

    return;
  };
