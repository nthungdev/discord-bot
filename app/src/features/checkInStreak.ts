
import { ChannelType, Message, userMention } from 'discord.js';
import client from '../discord';

export const getPreviousMonthStart = () => {
  const currentDate = new Date();
  const previousMonth = currentDate.getMonth() - 1;
  return new Date(currentDate.getFullYear(), previousMonth, 1);
}

export const getPreviousMonthEnd = () => {
  const currentDate = new Date();
  const previousMonth = currentDate.getMonth() - 1;
  return new Date(currentDate.getFullYear(), previousMonth + 1, 1);
}

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

const formatPeriod = (date: Date) => {
  return `Tháng ${date.getMonth() + 1} Năm ${date.getFullYear()}`
}

export async function countCheckInsInChannel(channelId: string) {
  const channel = client.channels.cache.get(channelId);
  if (!channel) {
    throw Error(`Channel not found ${channelId}`)
  } else if (channel.type !== ChannelType.GuildText) {
    throw Error(`Not a text channel ${channelId}`)
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

  // console.log({ count })
  // console.log(tracker)
  return longestStreakLeaderboard
}

export function formatCheckInLeaderboard(startDate: Date, endDate: Date, leaderboard: [string, {
  count: number,
  messages: string[],
  longestStreak: number,
  lastCheckIn: Date,
  currentStreak: number
}][]) {
  if (leaderboard.length === 0) return ''

  const totalCount = leaderboard.reduce((acc, [_, { count }]) => acc + count, 0)

  const streaks = leaderboard.slice(0, 5).map(([userId, { longestStreak }]) => `${userMention(userId)} (${longestStreak} ngày)`).join('\n')
  const counts = leaderboard.slice(0, 5).map(([userId, { count }]) => `${userMention(userId)} (${count})`).join('\n')

  const report = `📢 Báo Cáo Điểm Danh ${formatPeriod(startDate)} 📢

  Tổng Số Lượt Điểm Danh Trong Tháng ${startDate.getMonth() + 1}: ${totalCount}

  🔥 Chuỗi Điểm Danh Nóng 🔥

  Xin chúc mừng ${userMention(leaderboard[0][0])} đã duy trì chuỗi điểm danh dài nhất với ${leaderboard[0][1].longestStreak} ngày điểm danh liên tiếp!

  👑 Quán Quân Điểm Danh 👑

  Một tràng pháo tay thật lớn dành cho ${userMention(leaderboard[1][0])} với tổng số ${leaderboard[0][1].longestStreak} điểm danh liên tiếp tính đến nay!

  Tiếp tục phát huy nhé mọi người! Hãy cùng nhau nâng cao số ngày và số lượt điểm danh nào! 🚀

  Bảng Xếp Hạng:

  Chuỗi Điểm Danh:

  ${streaks}

  Tổng Số Lượt Điểm Danh:

  ${counts}`

  return report
}