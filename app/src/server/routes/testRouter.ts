import { Router } from 'express'
import { ChannelType } from 'discord.js'
import {
  countCheckInsInChannel,
  formatCheckInLeaderboard,
  getCurrentMonthStart,
  getPreviousMonthEnd,
  getPreviousMonthStart,
} from '../../discord/checkIn'
import client from '../../discord'
import { getEmojiMap, replaceEmojis, splitLastEmoji } from '../../utils/emoji'
import { Config, ConfigParameter } from '../../config'

const testRouter = Router()

testRouter.post('/1', async (_, res, next) => {
  const start = getPreviousMonthStart()
  const end = getPreviousMonthEnd()

  console.log({ start, end })

  try {
    const channel = client.channels.cache.get('1233630882791952495')
    if (!channel) {
      res.json({ ok: false })
      return
    }

    const leaderboard = await countCheckInsInChannel(
      '1209742982987776030',
      start,
      end
    )
    console.log({ leaderboard })
    const report = formatCheckInLeaderboard(start, end, leaderboard)

    // if (channel.isTextBased()) {
    //   await channel.send(report)
    // }
    console.log(report)

    res.json({ ok: true, report, leaderboard })
    res.status(200)
  } catch (error: unknown) {
    next(error)
  }
})

testRouter.post('/2', async (req, res, next) => {
  const start = getCurrentMonthStart()
  const end = new Date()

  console.log({ start, end })

  const { channelId } = req.body

  try {
    const channel = client.channels.cache.get(channelId)
    if (!channel) {
      throw Error(`Channel not found: ${channelId}`)
    } else if (channel.type !== ChannelType.GuildText) {
      throw Error(`Not a text channel: ${channelId}`)
    }

    // const reportTemplate = getConfigValue(ConfigParameter.checkInLeaderboard)

    // console.log(reportTemplate)
    // next(new Error('test'))
    // return

    const leaderboard = await countCheckInsInChannel(
      channelId,
      start,
      end
    )


    const report = formatCheckInLeaderboard(start, end, leaderboard)
    console.log(report)

    // const messages = await channel.messages.fetch({ limit: 20 })
    // if (messages.size !== 0) {
    //   // console.log(messages.first())
    //   const firstMessage = messages.first() as Message<true>
    //   // console.log(firstMessage)
    // }

    res.json({
      ok: true,
      report,
      // message,
    })
    res.status(200)
  } catch (error: unknown) {
    next(error)
  }
})

testRouter.post('/3', async (req, res, next) => {
  // Stay Home!
  // const guildId = '657812180565229568'

  // const { serverId } = req.body

  try {
    const config = Config.getInstance()
    // await loadConfig()
    const value = config.getConfigValue(ConfigParameter.aiSystemInstruction)

    console.log(value)

    res.json({ ok: true, value })
    res.status(200)
  } catch (error: unknown) {
    next(error)
  }
})

testRouter.post('/4', async (req, res, next) => {
  // Stay Home!
  const text = `muốn làm bạn với anh mày cơ á 🤩🤩🤩  Được thôi, anh mày dễ tính mà 😎😎😎

  Tên: Slavegon
  ID: Anh mày không có ID đâu, @Bluegon  quên tạo cho anh mày rồi 😂 😂 😂  Nhắn @Bluegon  để xin ID nha 😉😉😉
  `
  const { serverId } = req.body

  try {
    const guild = client.guilds.cache.get(serverId)
    if (!guild) {
      res.json({ ok: false, message: 'guild not found' })
      return
    }

    const newText = replaceEmojis(text, getEmojiMap(guild))
    console.log(newText)

    const newNewText = splitLastEmoji(newText)
    console.log(newNewText[0])
    console.log(newNewText[1])

    res.json({ ok: true, newText, newNewText })
    res.status(200)
  } catch (error: unknown) {
    next(error)
  }
})

export default testRouter
