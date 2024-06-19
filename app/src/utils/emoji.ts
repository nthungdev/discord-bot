import { Guild, formatEmoji } from 'discord.js'
import { Config, ConfigParameter } from '../config'

export const getEmojiMap = (guild: Guild) => {
  const emojis = Config.getInstance().getConfigValue(ConfigParameter.guildEmojis)[guild.id]
  if (!emojis) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(emojis)
      .map(([emoji, names]) => {
        const ids = names
          .map((name) => {
            return guild.emojis.cache.find((emoji) => emoji.name === name)?.id || name
          })
          .filter((i) => i !== undefined) as string[]
        return [emoji, ids]
      })
      .filter(([, ids]) => ids.length > 0)
  )
}

export const replaceEmojis = (
  text: string,
  emojiMap: Record<string, string[]>
) => {
  let newText = ''
  for (const c of text) {
    if (emojiMap[c]) {
      const randomIndex = Math.floor(Math.random() * emojiMap[c].length)
      newText += formatEmoji(emojiMap[c][randomIndex])
    } else {
      newText += c
    }
  }
  return newText
}

export const splitLastEmoji = (text: string) => {
  const lastEmoji = text.trim().match(/(<:_:\d+>)[\s\n\t]*[.!?]?[\s\n\t]*(\\n)?$/)
  if (lastEmoji === null) {
    return [text]
  }
  const emoji = lastEmoji[1]
  const ending = text.at(-1)?.match(/[.!?]/)?.[0] || ''
  console.log({
    emoji,
    ending,
    lastEmoji: [...lastEmoji],
    index: lastEmoji.index,
    untilIndex: text.slice(0, lastEmoji.index),
    fromIndex: text.slice(lastEmoji.index),
  })
  return [text.slice(0, lastEmoji.index) + ending, emoji]
}
