import { Router } from 'express'
import { ChannelType, Message } from 'discord.js'
import {
  countCheckInsInChannel,
  formatCheckInLeaderboard,
  getPreviousMonthEnd,
  getPreviousMonthStart,
} from '../../discord/checkIn'
import client from '../../discord'
import { getEmojiMap, replaceEmojis, splitLastEmoji } from '../../utils/emojis'

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

testRouter.post('/2', async (_, res, next) => {
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

    const messages = await channel.messages.fetch({ limit: 20 })
    if (messages.size !== 0) {
      console.log(messages.first())
      const firstMessage = messages.first() as Message<true>
      console.log(firstMessage)
    }

    res.json({ ok: true })
    res.status(200)
  } catch (error: unknown) {
    next(error)
  }
})

testRouter.post('/3', async (req, res, next) => {
  // Stay Home!
  // const guildId = '657812180565229568'

  const { serverId } = req.body

  try {
    const guild = client.guilds.cache.get(serverId)
    if (!guild) {
      res.json({ ok: false, message: 'guild not found' })
      return
    }

    const emojis = guild.emojis.cache.toJSON()

    const map = {
      '😀': ['chinesebruhcat', 'smokedcat'],
      '🤬': ['rat', 'pepefrog', 'smokedcat'],
      '🤨': ['bruhcatmelvin', 'bruhcatmelvin', ''],
      '😠': ['pepefrog', 'smokedcat'],
      '🤩': ['pepeishorny'],
      '😈': ['pepeishorny'],
      '😂': ['catcrythumbsup', 'nekouwu', 'pikadatass'],
      '🤔': ['thonkcool', 'thonk'],
      '🤣': ['UwU_GT'],
      '😅': ['pepetears', 'smokedcat', 'nekofacepalm'],
      '🥰': ['pepeknickerspink'],
      '😏': ['bluegons'],
      '😭': ['pikacry', 'sadhamster', 'pepecry'],
      '🥺': ['sadhamster'],
      '😜': ['nekouwu'],
      '😎': ['peniscool'],
    }

    // const catWtf = formatEmoji('1247386116001234964')
    // console.log(catWtf)

    Object.entries(map).forEach(([emoji, names]) => {
      const ids = names
        .map((name) => {
          return guild.emojis.cache.find((emoji) => emoji.name === name)?.id
        })
        .filter((i) => !!i)
        .map((i) => `'${i}'`)
      console.log(`'${emoji}': [${ids.join(', ')}],`)
    })

    const emojiMap = getEmojiMap(guild)

    res.json({ ok: true, emojis, emojiMap })
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
