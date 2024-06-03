import { Guild, Message } from 'discord.js'
import { AxiosError } from 'axios'
import client from '.'
import {
  addMessageBuffer,
  addMessageHistory,
  clearMessageBuffer,
  reduceMessageHistory,
  selectChatbotState,
  selectMessageHistory,
  setLastMemberFetch,
} from '../features/chatbot'
import { store } from '../store'
import { generate, generateContentREST, generateContent } from '../utils/ai'
import { DiscordMessage } from '../types'
import { replaceWithUserMentions } from './helpers'

const BOT_REPLY_DELAY = 5000 // 5s
const MEMBER_FETCH_AGE = 24 * 60 * 60 * 1000 // 1 day in milliseconds

/** Fetch up-to-date member list to cache */
const validateServerMembersCache = async (guild: Guild) => {
  const { lastMemberFetch } = selectChatbotState(store.getState())
  if (!lastMemberFetch || (lastMemberFetch + MEMBER_FETCH_AGE) < Date.now()) {
    await guild.members.fetch()
    setLastMemberFetch(Date.now() + MEMBER_FETCH_AGE)
  }
}

// not recommended to store non-serialized objects in redux store,
// hence this is what we have
const messageTimeout: Record<string, NodeJS.Timeout> = {}
const setMessageTimeout = ({
  channelId,
  timeout,
}: {
  channelId: string
  timeout: NodeJS.Timeout
}) => {
  messageTimeout[channelId] = timeout
}
const clearMessageTimeout = (channelId: string) => {
  clearTimeout(messageTimeout[channelId])
}

const handleMessageTimeout = async (message: Message<boolean>) => {
  const { channel } = message
  const { messageHistory, messageBuffer } = selectChatbotState(store.getState())

  // get the recent messages by the user who last messaged
  const messages: DiscordMessage[] = []
  for (const m of messageBuffer[channel.id].toReversed()) {
    if (messages.length !== 0 && m.authorId !== messages[0].authorId) {
      break
    } else {
      messages.unshift(m)
    }
  }

  const promptList = messages.map((m) => m.cleanContent)
  const prompt = `${messages[0].authorUsername} says: ${promptList.join(' ')}`

  const messageMentions = messages.flatMap(m => m.mentions)
  // replace nicknames in prompt with username so that the model returns back with references to username
  // then username is replaced with
  const promptWithUsername = messageMentions.reduce((acc, mention) => {
    return acc.replaceAll(`@${mention.nickname}`, `@${mention.username}`)
  }, prompt)


  try {
    // let { content, data } = await generateContentREST(
    //   promptWithUsername,
    //   messageHistory[channel.id]
    // )

    // let { content, data } = await generate(
    //   promptWithUsername,
    //   messageHistory[channel.id]
    // )

    let { content, data } = await generateContent(
      promptWithUsername,
      messageHistory[channel.id],
    )

    // replace @<username> in message with @<user id>
    let contentWithMentions = replaceWithUserMentions(
      content,
      message.guild?.members.cache.toJSON() ?? []
    )

    console.log({
      user: promptWithUsername,
      content,
      contentWithMentions
    })

    store.dispatch(clearMessageBuffer(channel.id))

    // return // debug

    if (content === '') {
      // TODO is this a good answer when model doesn't have a reply?
      content = '?'
      console.log({ data: JSON.stringify(data) })
    }

    await channel.send(contentWithMentions ?? content)

    // save conversation into history
    store.dispatch(
      addMessageHistory({
        channelId: channel.id,
        userMessage: prompt,
        botMessage: content,
      })
    )

    // cut down message history if needed
    if (selectMessageHistory(store.getState())[channel.id].length > 40)
      store.dispatch(
        reduceMessageHistory({
          by: 14,
          channelId: channel.id,
        })
      )

    // debug
    console.log({
      history: selectMessageHistory(store.getState())[channel.id].length,
    })
  } catch (error) {
    console.error('Error generateContent ', typeof error)
    if (error instanceof AxiosError) {
      console.error({
        message: error.message,
        name: error.name,
        error: error.toJSON(),
      })
    } else {
      console.error({ error })
    }
  }
}

export const handleChatbot =
  ({
    allowedServers = [],
    freeChannels = [],
  }: {
    allowedServers?: string[]
    freeChannels?: string[]
  } = {}) =>
    async (message: Message<boolean>) => {
      // skip handling this message when:
      if (
        // incoming message not coming from allowed channels
        !allowedServers.includes(message.guildId || '') ||
        // message from the bot itself
        message.author.id === client.user!.id ||
        // has attachment (haven't supported yet)
        message.attachments.size !== 0 ||
        // has sticker (haven't supported image)
        message.stickers.size !== 0 ||
        // message type not text message
        ![0, 19].includes(Number(message.type.toString())) ||
        // channel requires the bot being mentioned and it's not
        (!freeChannels.includes(message.channelId) &&
          !message.mentions.members?.has(client.user!.id))
      ) {
        return
      }

      if (message.guild === null) {
        // DM message is not supported
        return
      }

      await validateServerMembersCache(message.guild)
      const guildMember = message.guild.members.cache.get(message.author.id)
      const discordMessage: DiscordMessage = {
        authorId: message.author.id,
        content: message.content,
        authorUsername: message.author.username,
        authorDisplayName: guildMember?.nickname ?? message.author.displayName,
        cleanContent: message.cleanContent,
        mentions: message.mentions.users.toJSON().map((u) => ({
          id: u.id,
          nickname: message.guild?.members.cache.get(u.id)?.nickname ?? u.displayName,
          username: u.username,
        })),
      }

      store.dispatch(
        addMessageBuffer({
          message: discordMessage,
          channelId: message.channelId,
        })
      )

      clearMessageTimeout(message.channelId)
      setMessageTimeout({
        channelId: message.channelId,
        timeout: setTimeout(() => handleMessageTimeout(message), BOT_REPLY_DELAY),
      })

      return
    }
