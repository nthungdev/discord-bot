
import { Router } from "express"
import { ChannelType, Message } from "discord.js"
import { countCheckInsInChannel, formatCheckInLeaderboard, getPreviousMonthEnd, getPreviousMonthStart } from "../../discord/checkIn/checkinStreak"
import client from "../../discord"

const testRouter = Router()

testRouter.post('/test1', async (_, res) => {
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

testRouter.post('/test2', async (req, res) => {
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
    if (messages.size !== 0) {
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

export default testRouter