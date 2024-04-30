import { config } from 'dotenv'
import app from './app'
import client, { login } from './client'
import { clearTimeout, setTimeout } from 'timers'
import { Message } from 'discord.js'
import { generateContent } from './utils/vertex'

config({
  path:
    process.env.NODE_ENV === 'production'
      ? '.env.production'
      : '.env.development',
})

const { TOKEN, PORT } = process.env
const port: number | string = PORT || 3001

export type HistoryMessage = {
  author: 'bot' | 'user'
  content: string
}

let messageBuffer: Record<string, Message<boolean>[]> = {}
let messageTimeout: Record<string, NodeJS.Timeout> = {}
let history: Record<string, HistoryMessage[]> = {}

const handleMessageTimeout = async (channelId: string) => {
  // get the recent messages by the user who last messaged
  const messages: Message<boolean>[] = []
  for (const message of messageBuffer[channelId].reverse()) {
    if (messages.length !== 0 && message.author.id !== messages[0].author.id) {
      break
    } else {
      messages.unshift(message)
    }
  }

  const formattedMessages = messages.map((m) =>
    `${m.guild?.members.cache.get(m.author.id)?.displayName}: ${m.cleanContent
      }`.replace('@Slavegon', '')
  )
  const formattedMessage = formattedMessages.join(' ')

  try {
    const { content } = await generateContent(
      formattedMessage,
      history[channelId]
    )
    // console.log({ reply, formattedMessage })
    console.log({
      content,
      formattedMessage,
      // messages,
      cleanContent: messages[0].cleanContent,
      attachment: messages[0].attachments.toJSON(),
      user: messages[0].guild?.members.cache.get(messages[0].author.id)
        ?.displayName,
    })

    messageBuffer[channelId] = [] // clear buffer

    if (content !== '') {
      await messages[0].channel.send(content)
    }

    // save conversation into history
    if (channelId in history) {
      history[channelId] = history[channelId].concat([
        { author: 'user', content: formattedMessage },
        { author: 'bot', content },
      ])
    } else {
      history[channelId] = [
        { author: 'user', content: formattedMessage },
        { author: 'bot', content },
      ]
    }

    if (history[channelId].length > 25) {
      history[channelId] = history[channelId].slice(-14)
    }

    // debug
    console.log({
      history: history[channelId].length
    })
  } catch (error) {
    console.error('Error generateContent ', error)
  }
}

const main = async () => {
  // Validate environment variables
  const requiredEnvs = ['TOKEN', 'SLEEP_REMINDER_SERVER_ID']
  const missingEnvs = requiredEnvs.filter((env) => !(env in process.env))
  if (missingEnvs.length !== 0) {
    console.error(
      `Missing ${missingEnvs
        .map((env) => `'${env}'`)
        .join(' ')} environment variables!`
    )
    process.exit(1)
  }

  // Log the bot to Discord
  await login(TOKEN as string)

  client.on('messageCreate', (message) => {
    const allowedServers = ['657812180565229568', '1233630823496814593']
    // const allowedServers = ['1233630823496814593']
    const noMentionNeededChannels = [
      '1233630882791952495',
      '1234693285981720617',
    ]

    if (
      !allowedServers.includes(message.guildId || '') ||
      message.author.id === client.user!.id ||
      message.attachments.size !== 0 ||
      message.stickers.size !== 0 ||
      ![0, 19].includes(Number(message.type.toString()))
    ) {
      return
    }

    // skip if this channel require the bot being mentioned, but it's not
    if (
      !noMentionNeededChannels.includes(message.channelId) &&
      !message.mentions.members?.has(client.user!.id)
    ) {
      return
    }

    if (messageTimeout !== null) {
      clearTimeout(messageTimeout[message.channelId])
    }
    if (!messageBuffer[message.channelId]) {
      messageBuffer[message.channelId] = [message]
    } else {
      messageBuffer[message.channelId].push(message)
    }
    messageTimeout[message.channelId] = setTimeout(
      () => handleMessageTimeout(message.channelId),
      5000
    )
    return
  })

  // Run express app
  app.listen(port, function () {
    console.log(`App is listening on port ${port} !`)
  })
}

main()
