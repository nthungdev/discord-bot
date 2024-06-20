import express, { Application, Request, Response } from 'express'
import bodyParser from 'body-parser'
import { TextChannel } from 'discord.js'
import client from '../discord'
import testRouter from './routes/testRouter'
import utilityRouter from './routes/utilityRouter'
import auth from './middlewares/auth'
import errorHandler from './middlewares/errorHandler'

const app: Application = express()

// Google Cloud setting
app.set('trust proxy', true)

app.use(bodyParser.json())

app.get('/', (_, res: Response) => {
  res.send('Hello world!')
})

app.use(auth)

app.use('/tests', testRouter)
app.use('/utility', utilityRouter)

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

// app.post('/sleepreminder', async (req: Request, res: Response) => {
//   const { channelId } = req.body

//   // Channel type that is a voice channel
//   const VOICE_CHANNEL_TYPE = 2

//   const { SLEEP_REMINDER_SERVER_ID } = process.env

//   const guild = client.guilds.cache.get(SLEEP_REMINDER_SERVER_ID as string)
//   if (guild === undefined) {
//     res.json({
//       ok: false,
//       message: `guild ${SLEEP_REMINDER_SERVER_ID} not found.`,
//     })
//     return
//   }

//   // ids of members currently in a voice channel excluding bots)
//   const memberIds = guild.channels.cache
//     .toJSON()
//     .filter((c) => c.type === VOICE_CHANNEL_TYPE)
//     .flatMap((c) => (c as VoiceChannel).members.toJSON())
//     .filter((m) => !m.user.bot)
//     .map((m) => m.id)

//   if (memberIds.length === 0) {
//     res.send({ ok: true, message: 'there is no one in the voice channel' })
//     return
//   }

//   const textChannel = client.channels.cache.get(channelId) as
//     | TextChannel
//     | undefined
//   if (textChannel === undefined) {
//     res.send({ ok: false, message: `channel ${channelId} not found.` })
//     return
//   }

//   const message = getRandomSleepReminderMessage(memberIds)

//   await textChannel.send(message)

//   res.json({
//     ok: true,
//     memberIds,
//     message,
//   })
// })

app.use(errorHandler)

export default app
