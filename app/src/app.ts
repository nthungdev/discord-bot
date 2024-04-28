import express, { Application, Request, Response } from 'express'
import bodyParser from 'body-parser'
import client from './client'
import { TextChannel, VoiceChannel } from 'discord.js'
import { getRandomSleepReminderMessage } from './utils'

const app: Application = express()

app.use(bodyParser.json());

app.get('/helloworld', (_: Request, res: Response) => {
  res.send('Hello world!')
})

app.post('/message', async (req: Request, res: Response) => {
  const { message, channelId } = req.body

  const channel = client.channels.cache.get(channelId) as (TextChannel | undefined)
  if (channel === undefined) {
    res.send({ ok: false, message: 'channel not found' })
    return
  }

  await channel.send(message)

  res.json({
    ok: true,
    message: 'message sent',
    channelId,
    data: { message }
  })
})

app.post('/test', async (req: Request, res: Response) => {
  const { textChannelId, voiceChannelId } = req.body

  const voiceChannel = client.channels.cache.get(voiceChannelId) as (VoiceChannel | undefined)
  if (voiceChannel === undefined) {
    res.send({ ok: false, message: `channel ${voiceChannelId} not found` })
    return
  }

  const memberIds = voiceChannel.members.map(m => m.user.id)
  if (memberIds.length === 0) {
    res.send({ ok: true, message: 'there is no one in the voice channel' })
    return;
  }

  const textChannel = client.channels.cache.get(textChannelId) as (TextChannel | undefined)
  if (textChannel === undefined) {
    res.send({ ok: false, message: `channel ${textChannelId} not found` })
    return
  }

  const message = getRandomSleepReminderMessage(memberIds)

  await textChannel.send(message)

  res.json({
    ok: true,
    memberIds,
    message
  })
})


export default app