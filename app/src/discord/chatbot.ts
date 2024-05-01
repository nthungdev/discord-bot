import { GuildTextBasedChannel, TextBasedChannel } from 'discord.js'
import { AxiosError } from 'axios'
import client from '.'
import {
  addMessageBuffer,
  addMessageHistory,
  clearMessageBuffer,
  reduceMessageHistory,
  selectChatbotState,
  selectMessageHistory,
} from '../features/chatbot'
import { store } from '../store'
import { generateContent } from '../utils/ai'
import { DiscordMessage } from '../types'

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

const handleMessageTimeout = async (
  channel: GuildTextBasedChannel | TextBasedChannel
) => {
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

  const formattedMessages = messages.map((m) =>
    `${m.authorDisplayName}: ${m.cleanContent}`.replace('@Slavegon', '')
  )
  const formattedMessage = formattedMessages.join(' ')

  try {
    const { content } = await generateContent(
      formattedMessage,
      messageHistory[channel.id]
    )

    // TODO replace @<user> in message with user id

    console.log({
      content,
      formattedMessage,
    })

    store.dispatch(clearMessageBuffer(channel.id))

    // TODO consider sending something
    if (content === '') return

    await channel.send(content)

    // save conversation into history
    store.dispatch(
      addMessageHistory({
        channelId: channel.id,
        userMessage: formattedMessage,
        botMessage: content,
      })
    )

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
    console.error('Error generateContent')
    if (error instanceof AxiosError) {
      console.error({
        message: error.message,
        name: error.name,
        error: error.toJSON(),
      })
    }
  }
}

export const registerChatbot = ({
  allowedServers = [],
  freeChannels = [],
}: {
  allowedServers?: string[]
  freeChannels?: string[]
} = {}) => {
  client.on('messageCreate', (message) => {
    // skip this message when:
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

    const discordMessage: DiscordMessage = {
      authorId: message.author.id,
      content: message.content,
      authorDisplayName: message.author.displayName,
      cleanContent: message.cleanContent,
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
      timeout: setTimeout(() => handleMessageTimeout(message.channel), 5000),
    })

    return
  })
}
