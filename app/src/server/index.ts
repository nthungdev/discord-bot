import express, { Application, Request, Response } from 'express'
import bodyParser from 'body-parser'
import { ChannelType, Message, TextChannel, VoiceChannel } from 'discord.js'
import client from '../discord'
import { getRandomSleepReminderMessage } from '../utils'
import { clearAll } from '../features/chatbot'
import {
  countCheckInsInChannel,
  formatCheckInLeaderboard,
  getPreviousMonthEnd,
  getPreviousMonthStart,
} from '../discord/checkIn/checkinStreak'
import { deployGuildCommands } from '../discord/deployCommands'

const app: Application = express()

// Google Cloud setting
app.set('trust proxy', true)

app.use(bodyParser.json())

app.get('/', (_, res: Response) => {
  res.send('Hello world!')
})

app.post('/message', async (req: Request, res: Response) => {
  const { message, channelId } = req.body

  const channel = client.channels.cache.get(channelId) as
    | TextChannel
    | undefined
  if (channel === undefined) {
    res.status(400) // bad request
    res.send({ ok: false, message: 'channel not found' })
    return
  }

  await channel.send(message)

  res.json({
    ok: true,
    message: 'message sent',
    channelId,
    data: { message },
  })
})

app.post('/sleepreminder', async (req: Request, res: Response) => {
  const { channelId } = req.body

  // Channel type that is a voice channel
  const VOICE_CHANNEL_TYPE = 2

  const { SLEEP_REMINDER_SERVER_ID } = process.env

  const guild = client.guilds.cache.get(SLEEP_REMINDER_SERVER_ID as string)
  if (guild === undefined) {
    res.json({
      ok: false,
      message: `guild ${SLEEP_REMINDER_SERVER_ID} not found.`,
    })
    return
  }

  // ids of members currently in a voice channel excluding bots)
  const memberIds = guild.channels.cache
    .toJSON()
    .filter((c) => c.type === VOICE_CHANNEL_TYPE)
    .flatMap((c) => (c as VoiceChannel).members.toJSON())
    .filter((m) => !m.user.bot)
    .map((m) => m.id)

  if (memberIds.length === 0) {
    res.send({ ok: true, message: 'there is no one in the voice channel' })
    return
  }

  const textChannel = client.channels.cache.get(channelId) as
    | TextChannel
    | undefined
  if (textChannel === undefined) {
    res.send({ ok: false, message: `channel ${channelId} not found.` })
    return
  }

  const message = getRandomSleepReminderMessage(memberIds)

  await textChannel.send(message)

  res.json({
    ok: true,
    memberIds,
    message,
  })
})

/// Clear the chat bot history
app.post('/clear', async (req: Request, res: Response) => {
  try {
    clearAll()
    res.json({ ok: true })
  } catch (error) {
    res.json({ ok: false })
  }
})

app.post('/test1', async (req: Request, res: Response) => {
  const start = getPreviousMonthStart()
  const end = getPreviousMonthEnd()

  console.log({ start, end })

  try {
    const channel = client.channels.cache.get('1233630882791952495')
    if (!channel) {
      res.json({ ok: false })
      return
    }

    const leaderboard = await countCheckInsInChannel('1209742982987776030', start, end)
    console.log({ leaderboard })
    const report = formatCheckInLeaderboard(start, end, leaderboard)

    // if (channel.isTextBased()) {
    //   await channel.send(report)
    // }
    console.log(report)

    res.json({ ok: true, report, leaderboard })
    res.status(200)
  } catch (error: any) {
    res.json({ ok: false, message: error?.message || 'Unknown Error' })
    res.status(500)
  }
})

app.post('/test2', async (req: Request, res: Response) => {
  const start = getPreviousMonthStart()
  const end = getPreviousMonthEnd()

  console.log({ start, end })

  const channelId = '1233630882791952495'

  try {
    const channel = client.channels.cache.get(channelId)
    if (!channel) {
      res.json({ ok: false })
      return
    } else if (channel.type !== ChannelType.GuildText) {
      throw Error(`Not a text channel ${channelId}`)
    }

    const messages = await channel.messages.fetch({ limit: 20, })
    if( messages.size !== 0) {
      console.log(messages.first())
      const firstMessage = messages.first() as Message<true>
      console.log(firstMessage)
    }

    res.json({ ok: true })
    res.status(200)
  } catch (error: any) {
    res.json({ ok: false, message: error?.message || 'Unknown Error' })
    res.status(500)
  }
})

app.post('/commands/deploy', async (req: Request, res: Response) => {
  const { token, clientId, guildId } = req.body

  if (token === undefined || clientId === undefined || guildId === undefined) {
    res.status(400) // bad request
    res.send({ ok: false, message: 'missing required fields' })
    return
  }

  try {
    await deployGuildCommands(token, clientId, guildId)
    res.json({ ok: true, message: 'commands deployed' })
  } catch (error: any) {
    res.status(500)
    res.send({ ok: false, message: error?.message })
  }
})

export default app
