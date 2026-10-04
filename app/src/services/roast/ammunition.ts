import type { GuildMember, TextBasedChannel } from "discord.js";
import {
  MAX_RECENT_CHANNEL_MESSAGES_FETCH,
  MAX_TARGET_MESSAGE_LENGTH,
  MAX_TARGET_MESSAGES_SAMPLE,
  type RoastRequest,
  type RoastTargetActor,
  type SupportedRoastLocale,
} from "./types";

/**
 * Calculates human-readable tenure description based on member join date.
 */
export function calculateTenure(
  joinedAt: Date | null | undefined,
  locale: SupportedRoastLocale,
): string {
  if (!joinedAt) {
    return locale === "vi" ? "không rõ" : "unknown";
  }

  const elapsedMs = Date.now() - joinedAt.getTime();
  const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));

  if (locale === "vi") {
    if (elapsedDays < 1) return "mới vào hôm nay";
    if (elapsedDays < 30) return `mới vào ${elapsedDays} ngày`;
    if (elapsedDays < 365) {
      const months = Math.floor(elapsedDays / 30);
      return `vào server được ${months} tháng`;
    }
    const years = (elapsedDays / 365).toFixed(1);
    return `thành viên kỳ cựu ${years} năm`;
  }

  if (elapsedDays < 1) return "just joined today";
  if (elapsedDays < 30) return `joined ${elapsedDays} days ago`;
  if (elapsedDays < 365) {
    const months = Math.floor(elapsedDays / 30);
    return `in server for ${months} months`;
  }
  const years = (elapsedDays / 365).toFixed(1);
  return `veteran member of ${years} years`;
}

/**
 * Sanitizes message content by stripping URLs, Discord mentions, and truncating length.
 */
export function sanitizeMessageContent(
  content: string,
  maxLength: number = MAX_TARGET_MESSAGE_LENGTH,
): string {
  const stripped = content
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/<@!?\d+>/g, "")
    .replace(/<@&\d+>/g, "")
    .replace(/<#\d+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (stripped.length <= maxLength) {
    return stripped;
  }
  return `${stripped.slice(0, maxLength)}...`;
}

/**
 * Extracts non-administrative, non-@everyone roles from a guild member.
 */
export function extractTopRoles(
  member: GuildMember | null | undefined,
  maxRoles: number = 3,
): string[] {
  if (!member) return [];

  return member.roles.cache
    .filter(
      (role) =>
        role.name !== "@everyone" && !role.permissions.has("Administrator"),
    )
    .map((role) => role.name)
    .slice(0, maxRoles);
}

/**
 * Extracts current presence / game activity from a guild member.
 */
export function extractCurrentActivity(
  member: GuildMember | null | undefined,
): string | null {
  if (!member?.presence) return null;

  const activities = member.presence.activities;
  if (!activities || activities.length === 0) return null;

  const primary = activities[0];
  if (primary.state) {
    return primary.name ? `${primary.name} (${primary.state})` : primary.state;
  }
  return primary.name || null;
}

/**
 * Fetches and filters recent messages in a text channel authored by the target.
 */
export async function fetchTargetRecentMessages(
  channel: TextBasedChannel | null | undefined,
  targetId: string,
  fetchLimit: number = MAX_RECENT_CHANNEL_MESSAGES_FETCH,
  sampleLimit: number = MAX_TARGET_MESSAGES_SAMPLE,
): Promise<string[]> {
  if (
    !(channel && "messages" in channel) ||
    typeof channel.messages.fetch !== "function"
  ) {
    return [];
  }

  try {
    const fetched = await channel.messages.fetch({ limit: fetchLimit });
    const targetMessages = fetched
      .filter((msg) => msg.author.id === targetId && !msg.author.bot)
      .map((msg) => sanitizeMessageContent(msg.cleanContent || msg.content))
      .filter((content) => content.length > 0)
      .slice(0, sampleLimit);

    return targetMessages;
  } catch (error) {
    console.warn(
      "[Ammunition] Failed to fetch recent channel messages:",
      error,
    );
    return [];
  }
}

/**
 * Builds the actor representation for the target member.
 */
export function buildTargetActor(
  member: GuildMember | null | undefined,
  fallbackUser: { id: string; username: string; displayName: string },
): RoastTargetActor {
  if (!member) {
    return {
      id: fallbackUser.id,
      username: fallbackUser.username,
      displayName: fallbackUser.displayName,
      nickname: null,
      joinedAt: null,
      roles: [],
      activity: null,
    };
  }

  return {
    id: member.id,
    username: member.user.username,
    displayName: member.displayName,
    nickname: member.nickname,
    joinedAt: member.joinedAt,
    roles: extractTopRoles(member),
    activity: extractCurrentActivity(member),
  };
}

/**
 * Builds the ammunition prompt combining Layer 1, Layer 2, and Layer 3 context.
 */
export function buildAmmunitionPrompt(
  request: RoastRequest,
  recentMessages: string[],
): string {
  const { target, locale, topic } = request;
  const tenure = calculateTenure(target.joinedAt, locale);
  const rolesStr =
    target.roles.length > 0
      ? target.roles.join(", ")
      : locale === "vi"
        ? "Chưa có vai trò nổi bật"
        : "None";
  const activityStr =
    target.activity || (locale === "vi" ? "Không có" : "None");

  if (locale === "vi") {
    const lines: string[] = [
      `Mục tiêu: @${target.displayName} (tên tài khoản: ${target.username})`,
      `Thời gian trong máy chủ: ${tenure}`,
      `Vai trò nổi bật: ${rolesStr}`,
      `Hoạt động / Game đang chơi: ${activityStr}`,
    ];

    if (recentMessages.length > 0) {
      lines.push("Một số tin nhắn gần đây của mục tiêu:");
      recentMessages.forEach((msg, idx) => {
        lines.push(`  ${idx + 1}. "${msg}"`);
      });
    } else {
      lines.push(
        "Mục tiêu không có tin nhắn gần đây nào trong kênh này. Hãy tận dụng vai trò, hoạt động, thời gian trong server, hoặc chủ đề yêu cầu.",
      );
    }

    if (topic) {
      lines.push(`Chủ đề / Phốt cụ thể cần chan (ưu tiên cao): "${topic}"`);
    }

    return lines.join("\n");
  }

  const lines: string[] = [
    `Target: @${target.displayName} (username: ${target.username})`,
    `Server tenure: ${tenure}`,
    `Prominent roles: ${rolesStr}`,
    `Current activity / game: ${activityStr}`,
  ];

  if (recentMessages.length > 0) {
    lines.push("Recent messages from target:");
    recentMessages.forEach((msg, idx) => {
      lines.push(`  ${idx + 1}. "${msg}"`);
    });
  } else {
    lines.push(
      "Target has no recent messages in this channel. Focus on their roles, activity, tenure, or the requested topic.",
    );
  }

  if (topic) {
    lines.push(`Specific focus topic / blunder (high priority): "${topic}"`);
  }

  return lines.join("\n");
}
