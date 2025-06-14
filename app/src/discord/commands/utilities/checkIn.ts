import { ChannelType, Client, Message, MessageType, userMention } from "discord.js";
import { DiscordCommand } from "../../constants";
import { Config, ConfigParameter } from "../../../config";

type CheckInTrackerData = {
  count: number;
  messages: string[];
  longestStreak: number;
  lastCheckIn: Date;
  currentStreak: number;
  username: string;
};

const isCheckInCommand = (message: Message<true>) => {
  return (
    message.type === MessageType.ChatInputCommand &&
    message.interaction?.commandName === DiscordCommand.CheckIn
  );
};

export const getPreviousMonthStart = () => {
  const currentDate = new Date();
  const previousMonth = currentDate.getMonth() - 1;
  return new Date(currentDate.getFullYear(), previousMonth, 1);
};

export const getPreviousMonthEnd = () => {
  const currentDate = new Date();
  const previousMonth = currentDate.getMonth() - 1;
  return new Date(currentDate.getFullYear(), previousMonth + 1, 1);
};

export const getCurrentMonthStart = () => {
  const currentDate = new Date();
  return new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
};

const isAfter = (target: Date, time: Date) => {
  return time.getTime() > target.getTime();
};

/**
 * @param messageDate always after streakLastDate
 * @param streakLastDate last time the user checked in
 */
const checkStreak = (messageDate: Date, streakLastDate: Date | undefined) => {
  if (!streakLastDate) return "reset";
  const diff = messageDate.getDate() - streakLastDate.getDate();
  if (diff === 1) return "increment";
  else if (diff === 0) return "same";
  else return "reset";
};

const formatPeriod = (date: Date) => {
  // TODO localize this
  return `Tháng ${date.getMonth() + 1} Năm ${date.getFullYear()}`;
};

export async function countCheckInsInChannel(
  client: Client<true>,
  channelId: string,
  start: Date,
  end: Date,
) {
  const channel = client.channels.cache.get(channelId);
  if (!channel) {
    throw Error(`Channel not found ${channelId}`);
  } else if (channel.type !== ChannelType.GuildText) {
    throw Error(`Not a text channel ${channelId}`);
  }

  let done = false;
  let lastMessage = (
    await channel.messages.fetch({ limit: 1, cache: false })
  ).first();
  const tracker: Record<string, CheckInTrackerData> = {};
  const messageBuffer: Message<true>[] = [];
  if (lastMessage) {
    messageBuffer.push(lastMessage);
  }

  console.info("Fetching check-in command messages...");
  while (!done) {
    await channel.messages
      .fetch({ limit: 100, before: lastMessage?.id })
      .then((messages) => {
        for (const [, message] of messages) {
          lastMessage = message;
          console.log(
            `${message.createdAt.toLocaleString()} ${message.cleanContent.slice(
              0,
              30,
            )}`,
          );

          // skip messages after end date
          // and stop when getting a message before start date
          if (isAfter(message.createdAt, start)) {
            console.log(`got message before ${start.toLocaleString()}`);
            done = true;
            break;
          } else if (
            isAfter(end, message.createdAt) ||
            !isCheckInCommand(message)
          ) {
            continue;
          }

          messageBuffer.unshift(message);
        }
      });
  }
  console.info(
    `Done fetching messages. Total ${messageBuffer.length} messages`,
  );

  // Count check-ins of each user
  messageBuffer.forEach((message) => {
    if (!isCheckInCommand(message)) {
      console.log(
        `skipping ${message.type}: ${message.cleanContent.slice(0, 30)}`,
      );
      return;
    }

    const { user } = message.interaction!;
    const streakStatus = checkStreak(
      message.createdAt,
      tracker[user.id]?.lastCheckIn,
    );
    const currentStreak =
      streakStatus === "increment"
        ? (tracker[user.id]?.currentStreak || 0) + 1
        : streakStatus === "reset"
          ? 1
          : tracker[user.id]?.currentStreak || 0; // same date
    const longestStreak = Math.max(
      currentStreak,
      tracker[user.id]?.longestStreak || 0,
    );

    tracker[user.id] = {
      count: (tracker[user.id]?.count || 0) + 1,
      messages: [...(tracker[user.id]?.messages || []), message.cleanContent],
      lastCheckIn: message.createdAt,
      currentStreak,
      longestStreak,
      username: user.username,
    };
  });

  const longestStreakLeaderboard = Object.entries(tracker).sort(
    (a, b) => b[1].longestStreak - a[1].longestStreak,
  );
  return longestStreakLeaderboard;
}

export function formatCheckInLeaderboard(
  startDate: Date,
  endDate: Date,
  leaderboard: [string, CheckInTrackerData][],
) {
  if (leaderboard.length === 0) return "";

  const totalCount = leaderboard.reduce((acc, [, { count }]) => acc + count, 0);

  const longestStreakLeaderboard = leaderboard.toSorted(
    (a, b) => b[1].longestStreak - a[1].longestStreak,
  );
  // sorted in decreasing order
  const mostCountLeaderboard = leaderboard.toSorted(
    (a, b) => b[1].count - a[1].count,
  );

  const formattedStreaks = longestStreakLeaderboard
    .slice(0, 5)
    .map(
      ([userId, { longestStreak }]) =>
        `${userMention(userId)} (${longestStreak} ngày)`,
    )
    .join("\n");

  const formattedCounts = mostCountLeaderboard
    // .slice(0, 5)
    .map(([userId, { count }]) => `${userMention(userId)}: ${count}`)
    .join("\n");

  const reportTemplate = Config.getInstance().getConfigValue(
    ConfigParameter.checkInLeaderboard,
  );
  const report = reportTemplate
    .replace("{date}", formatPeriod(startDate))
    .replace("{month}", `${startDate.getMonth() + 1}`)
    .replace("{totalCheckIns}", totalCount.toString())
    .replace("{longestStreakUser}", userMention(longestStreakLeaderboard[0][0]))
    .replace(
      "{longestStreakCount}",
      longestStreakLeaderboard[0][1].longestStreak.toString(),
    )
    .replace("{topCheckInUser}", userMention(mostCountLeaderboard[0][0]))
    .replace("{topCheckInCount}", mostCountLeaderboard[0][1].count.toString())
    .replace("{streaks}", formattedStreaks)
    .replace("{counts}", formattedCounts);

  return report;
}
