import { ChannelType, Message, MessageType, userMention } from 'discord.js'
import client from '..'
import config from '../../config'
import { DiscordCommand } from '../constants'

type CheckInTrackerData = {
  count: number
  messages: string[]
  longestStreak: number
  lastCheckIn: Date
  currentStreak: number
  username: string
}

export const getPreviousMonthStart = () => {
  const currentDate = new Date()
  const previousMonth = currentDate.getMonth() - 1
  return new Date(currentDate.getFullYear(), previousMonth, 1)
}

export const getPreviousMonthEnd = () => {
  const currentDate = new Date()
  const previousMonth = currentDate.getMonth() - 1
  return new Date(currentDate.getFullYear(), previousMonth + 1, 1)
}

export const getCurrentMonthStart = () => {
  const currentDate = new Date()
  return new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
}

const isAfter = (target: Date, time: Date) => {
  return time.getTime() > target.getTime()
}

const isWithinPreviousMonth = (time: Date) => {
  const currentDate = new Date()
  const previousMonth = currentDate.getMonth() - 1
  const previousMonthStart = new Date(
    currentDate.getFullYear(),
    previousMonth,
    1
  )
  const previousMonthEnd = new Date(
    currentDate.getFullYear(),
    previousMonth + 1,
    1
  )
  return (
    time.getTime() >= previousMonthStart.getTime() &&
    time.getTime() <= previousMonthEnd.getTime()
  )
}

const isWithinPeriod = (start: Date, end: Date, time: Date) => {
  // TODO validate start and end
  return time.getTime() >= start.getTime() && time.getTime() <= end.getTime()
}

/**
 * @param messageDate always after streakLastDate
 * @param streakLastDate last time the user checked in
 */
const checkStreak = (messageDate: Date, streakLastDate: Date | undefined) => {
  if (!streakLastDate) return 'reset'
  const diff = messageDate.getDate() - streakLastDate.getDate()
  if (diff === 1) return 'increment'
  else if (diff === 0) return 'same'
  else return 'reset'
}

const formatPeriod = (date: Date) => {
  return `Tháng ${date.getMonth() + 1} Năm ${date.getFullYear()}`
}

export async function countCheckInsInChannel(
  channelId: string,
  start: Date,
  end: Date
) {
  const channel = client.channels.cache.get(channelId)
  if (!channel) {
    throw Error(`Channel not found ${channelId}`)
  } else if (channel.type !== ChannelType.GuildText) {
    throw Error(`Not a text channel ${channelId}`)
  }

  let count = 0
  let done = false
  let lastMessage: Message<true> | undefined = channel.messages.cache.last()
  const messageBuffer: Message<true>[] = []
  const tracker: Record<string, CheckInTrackerData> = {}

  // get messages within the period
  while (!done) {
    await channel.messages
      .fetch({ limit: 100, before: lastMessage?.id })
      .then((messages) => {
        for (const [_, message] of messages) {
          count++
          lastMessage = message
          console.log(
            `${message.createdAt.toLocaleString()} ${message.cleanContent}`
          )

          if (isAfter(end, message.createdAt)) {
            continue
          } else if (
            message.type === MessageType.ChatInputCommand &&
            message.interaction?.commandName !== DiscordCommand.CheckIn
          ) {
            continue
          } else if (!isWithinPeriod(start, end, message.createdAt)) {
            console.log(
              `not within the period ${start.toLocaleString()} - ${end.toLocaleString()}`
            )
            done = true
            break
          }

          messageBuffer.unshift(message)
        }
      })
    done = true
  }

  // process messages
  messageBuffer.forEach((message) => {
    if (
      // (message.type !== MessageType.ChatInputCommand &&
      //   !message.cleanContent.match(/(?<!(?:ch[uư]a|kh[oô]ng).*)(?:check\s*-?in)/i)) ||
      (message.type === MessageType.ChatInputCommand &&
        message.interaction?.commandName !== DiscordCommand.CheckIn)
    ) {
      return
    }

    const user =
      message.interaction?.commandName === DiscordCommand.CheckIn
        ? message.interaction!.user
        : message.author
    const streakStatus = checkStreak(
      message.createdAt,
      tracker[user.id]?.lastCheckIn
    )
    const currentStreak =
      streakStatus === 'increment'
        ? (tracker[user.id]?.currentStreak || 0) + 1
        : streakStatus === 'reset'
          ? 1
          : tracker[user.id]?.currentStreak || 0 // same date
    const longestStreak = Math.max(
      currentStreak,
      tracker[user.id]?.longestStreak || 0
    )

    tracker[user.id] = {
      count: (tracker[user.id]?.count || 0) + 1,
      messages: [...(tracker[user.id]?.messages || []), message.cleanContent],
      lastCheckIn: message.createdAt,
      currentStreak,
      longestStreak,
      username: user.username,
    }
  })

  const longestStreakLeaderboard = Object.entries(tracker).sort(
    (a, b) => b[1].longestStreak - a[1].longestStreak
  )
  return longestStreakLeaderboard
}

export function formatCheckInLeaderboard(
  startDate: Date,
  endDate: Date,
  leaderboard: [string, CheckInTrackerData][]
) {
  if (leaderboard.length === 0) return ''

  const totalCount = leaderboard.reduce((acc, [_, { count }]) => acc + count, 0)

  const longestStreakLeaderboard = leaderboard.toSorted(
    (a, b) => b[1].longestStreak - a[1].longestStreak
  )
  const mostCountLeaderboard = leaderboard.toSorted(
    (a, b) => b[1].count - a[1].count
  )

  const formattedStreaks = longestStreakLeaderboard
    .slice(0, 5)
    .map(
      ([userId, { longestStreak }]) =>
        `${userMention(userId)} (${longestStreak} ngày)`
    )
    .join('\n')
  // sorted in decreasing order
  const formattedCounts = mostCountLeaderboard
    .slice(0, 5)
    .map(([userId, { count }]) => `${userMention(userId)}: ${count}`)
    .join('\n')

  const report = config.checkInReportTemplate
    .replace('{date}', formatPeriod(startDate))
    .replace('{month}', `${startDate.getMonth() + 1}`)
    .replace('{totalCheckIns}', totalCount.toString())
    .replace('{longestStreakUser}', userMention(longestStreakLeaderboard[0][0]))
    .replace(
      '{longestStreakCount}',
      longestStreakLeaderboard[0][1].longestStreak.toString()
    )
    .replace('{topCheckInUser}', userMention(mostCountLeaderboard[0][0]))
    .replace('{topCheckInCount}', mostCountLeaderboard[0][1].count.toString())
    .replace('{streaks}', formattedStreaks)
    .replace('{counts}', formattedCounts)

  return report
}
