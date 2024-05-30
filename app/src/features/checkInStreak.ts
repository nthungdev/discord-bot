
import { ChannelType, Message } from 'discord.js';
import client from '../discord';

const isWithinPreviousMonth = (time: Date) => {
  const currentDate = new Date();
  // const previousMonth = currentDate.getMonth() - 1;
  const previousMonth = currentDate.getMonth();
  const previousMonthStart = new Date(currentDate.getFullYear(), previousMonth, 1);
  const previousMonthEnd = new Date(currentDate.getFullYear(), previousMonth + 1, 1);
  return time.getTime() >= previousMonthStart.getTime() && time.getTime() <= previousMonthEnd.getTime();
};

/**
 * @param messageDate always before streakLastDate
 * @param streakLastDate last time the user checked in
 */
const checkStreak = (messageDate: Date, streakLastDate: Date | undefined) => {
  if (!streakLastDate) return 'reset'
  const diff = streakLastDate.getDate() - messageDate.getDate()
  if (diff === 1) return 'increment'
  else if (diff === 0) return 'same'
  else return 'reset'
}

export async function countCheckInsInChannel(channelId: string) {
  const channel = client.channels.cache.get(channelId);
  if (!channel) {
    console.error(`Channel not found ${channelId}`);
    return;
  } else if (channel.type !== ChannelType.GuildText) {
    console.error(`Not a text channel ${channelId}`);
    return
  }

  let count = 0
  let done = false
  let lastMessage: Message<true> | undefined = channel.messages.cache.last()
  const tracker: Record<string, {
    count: number,
    // messages: Message<true>[]
    messages: string[],
    longestStreak: number,
    lastCheckIn: Date,
    currentStreak: number
  }> = {}
  while (!done) {
    await channel.messages.fetch({ limit: 100, before: lastMessage?.id }).then(messages => {
      for (const [_, message] of messages) {
        count++
        lastMessage = message
        console.log(`${message.createdAt.toLocaleString()} ${message.cleanContent}`)

        if (!isWithinPreviousMonth(message.createdAt)) {
          console.log('not within previous month')
          done = true
          break
        }

        if (message.cleanContent.match(/(?<!(?:ch[uư]a|kh[oô]ng).*)(?:check\s*-?in)/i)) {
          const streakStatus = checkStreak(message.createdAt, tracker[message.author.id]?.lastCheckIn)
          const currentStreak = streakStatus === 'increment'
            ? (tracker[message.author.id]?.currentStreak || 0) + 1
            : streakStatus === 'reset'
              ? 1
              : (tracker[message.author.id]?.currentStreak || 0) // same date
          const longestStreak = Math.max(currentStreak, tracker[message.author.id]?.longestStreak || 0)

          tracker[message.author.id] = {
            count: (tracker[message.author.id]?.count || 0) + 1,
            messages: [...(tracker[message.author.id]?.messages || []), message.cleanContent],
            lastCheckIn: message.createdAt,
            currentStreak,
            longestStreak,
          }
        }
      }
    })
  }

  const longestStreakLeaderboard = Object.entries(tracker).sort((a, b) => b[1].longestStreak - a[1].longestStreak)

  console.log({ count })
  console.log(tracker)
  return longestStreakLeaderboard
}