import { GuildBasedChannel, Message } from "discord.js";
import { ToolDefinition } from "../types";

export interface GetRecentMessagesArgs {
  channelIdOrName?: string;
  limit?: number;
  authorUsernameOrId?: string;
}

export const discordGetRecentMessagesTool: ToolDefinition<
  GetRecentMessagesArgs,
  {
    channelId: string;
    channelName: string;
    messages: {
      id: string;
      author: {
        id: string;
        username: string;
        displayName: string;
        isBot: boolean;
      };
      content: string;
      createdAt: string;
      attachmentCount: number;
    }[];
    count: number;
  }
> = {
  name: "discord_get_recent_messages",
  description:
    "Fetches recent messages from a channel (or the current channel) with optional author filtering.",
  parameters: {
    type: "OBJECT",
    properties: {
      channelIdOrName: {
        type: "STRING",
        description:
          "The channel ID or name to fetch messages from. If omitted, uses the current channel.",
      },
      limit: {
        type: "INTEGER",
        description: "Number of recent messages to fetch (1-50, default: 10).",
      },
      authorUsernameOrId: {
        type: "STRING",
        description:
          "Optional filter to only return messages by a specific author username or ID.",
      },
    },
  },
  isAvailable: (ctx) => Boolean(ctx.channel || ctx.guild),
  execute: async (args, ctx) => {
    const query = args.channelIdOrName?.trim().replace(/^#/, "");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let targetChannel: any = null;

    if (query && ctx.guild) {
      const channels = await ctx.guild.channels.fetch();
      const channelList: GuildBasedChannel[] = [];
      channels.forEach((c) => {
        if (c) channelList.push(c);
      });

      targetChannel =
        channels.get?.(query) ??
        channelList.find(
          (c) =>
            c.id === query || c.name.toLowerCase() === query.toLowerCase(),
        ) ??
        null;
    } else if (ctx.channel && ctx.guild) {
      targetChannel = await ctx.guild.channels.fetch(ctx.channel.id);
    } else if (ctx.channel) {
      targetChannel = ctx.channel;
    }

    if (!targetChannel || !targetChannel.messages?.fetch) {
      throw new Error(
        `Text channel '${query || ctx.channel?.id || "unknown"}' could not be found or does not support message fetching.`,
      );
    }

    const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);
    const fetched = await targetChannel.messages.fetch({ limit });
    const messageList: Message[] =
      "values" in fetched
        ? Array.from(fetched.values())
        : Array.isArray(fetched)
          ? fetched
          : [];

    const authorFilter = args.authorUsernameOrId?.trim().toLowerCase();
    const filtered = authorFilter
      ? messageList.filter(
          (m) =>
            m.author?.id === authorFilter ||
            m.author?.username.toLowerCase() === authorFilter,
        )
      : messageList;

    const formatted = filtered.map((m) => ({
      id: m.id,
      author: {
        id: m.author?.id ?? "unknown",
        username: m.author?.username ?? "unknown",
        displayName: m.author?.displayName ?? m.author?.username ?? "unknown",
        isBot: Boolean(m.author?.bot),
      },
      content: m.cleanContent || m.content || "",
      createdAt: m.createdAt?.toISOString() ?? new Date().toISOString(),
      attachmentCount: m.attachments?.size ?? 0,
    }));

    return {
      channelId: targetChannel.id,
      channelName: targetChannel.name ?? "unknown",
      messages: formatted,
      count: formatted.length,
    };
  },
};

export interface GetPinnedMessagesArgs {
  channelIdOrName?: string;
}

export const discordGetPinnedMessagesTool: ToolDefinition<
  GetPinnedMessagesArgs,
  {
    channelId: string;
    channelName: string;
    pinnedMessages: {
      id: string;
      author: {
        id: string;
        username: string;
        displayName: string;
        isBot: boolean;
      };
      content: string;
      createdAt: string;
    }[];
    count: number;
  }
> = {
  name: "discord_get_pinned_messages",
  description:
    "Retrieves pinned messages from a channel (or the current active channel). Useful for checking rules, links, or important announcements.",
  parameters: {
    type: "OBJECT",
    properties: {
      channelIdOrName: {
        type: "STRING",
        description:
          "The channel ID or name to fetch pinned messages from. If omitted, uses the current channel.",
      },
    },
  },
  isAvailable: (ctx) => Boolean(ctx.channel || ctx.guild),
  execute: async (args, ctx) => {
    const query = args.channelIdOrName?.trim().replace(/^#/, "");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let targetChannel: any = null;

    if (query && ctx.guild) {
      const channels = await ctx.guild.channels.fetch();
      const channelList: GuildBasedChannel[] = [];
      channels.forEach((c) => {
        if (c) channelList.push(c);
      });

      targetChannel =
        channels.get?.(query) ??
        channelList.find(
          (c) =>
            c.id === query || c.name.toLowerCase() === query.toLowerCase(),
        ) ??
        null;
    } else if (ctx.channel && ctx.guild) {
      targetChannel = await ctx.guild.channels.fetch(ctx.channel.id);
    } else if (ctx.channel) {
      targetChannel = ctx.channel;
    }

    if (!targetChannel || !targetChannel.messages?.fetchPinned) {
      throw new Error(
        `Channel '${query || ctx.channel?.id || "unknown"}' could not be found or does not support pinned messages.`,
      );
    }

    const pinned = await targetChannel.messages.fetchPinned();
    const pinnedList: Message[] =
      "values" in pinned
        ? Array.from(pinned.values())
        : Array.isArray(pinned)
          ? pinned
          : [];

    const formatted = pinnedList.map((m) => ({
      id: m.id,
      author: {
        id: m.author?.id ?? "unknown",
        username: m.author?.username ?? "unknown",
        displayName: m.author?.displayName ?? m.author?.username ?? "unknown",
        isBot: Boolean(m.author?.bot),
      },
      content: m.cleanContent || m.content || "",
      createdAt: m.createdAt?.toISOString() ?? new Date().toISOString(),
    }));

    return {
      channelId: targetChannel.id,
      channelName: targetChannel.name ?? "unknown",
      pinnedMessages: formatted,
      count: formatted.length,
    };
  },
};

export interface ReactToMessageArgs {
  emoji: string;
  messageId?: string;
}

export const discordReactToMessageTool: ToolDefinition<
  ReactToMessageArgs,
  {
    success: boolean;
    messageId: string;
    emoji: string;
  }
> = {
  name: "discord_react_to_message",
  description:
    "Reacts to a message with a Discord or Unicode emoji (e.g. '🔥', '👍', '❤️', or a custom emoji).",
  parameters: {
    type: "OBJECT",
    properties: {
      emoji: {
        type: "STRING",
        description: "The emoji to react with (e.g. '👍', '🔥', '🎉').",
      },
      messageId: {
        type: "STRING",
        description:
          "The ID of the message to react to. If omitted, reacts to the triggering message.",
      },
    },
    required: ["emoji"],
  },
  isAvailable: (ctx) => Boolean(ctx.channel),
  execute: async (args, ctx) => {
    if (!ctx.channel) {
      throw new Error("No channel context available to react to message.");
    }

    const emoji = args.emoji?.trim();
    if (!emoji) {
      throw new Error("Emoji must be provided.");
    }

    const targetMessageId = args.messageId?.trim() || ctx.messageId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let message: any = null;

    if (targetMessageId && ctx.channel.messages?.fetch) {
      try {
        message = await ctx.channel.messages.fetch(targetMessageId);
      } catch {
        // Fallback
      }
    }

    if (!message && ctx.channel.messages?.fetch) {
      // Fetch latest message in channel
      const latest = await ctx.channel.messages.fetch({ limit: 1 });
      message =
        "first" in latest
          ? latest.first()
          : Array.isArray(latest)
            ? latest[0]
            : null;
    }

    if (!message || !message.react) {
      throw new Error(
        `Could not find a message to react to in channel '${ctx.channel.id}'.`,
      );
    }

    await message.react(emoji);

    return {
      success: true,
      messageId: message.id,
      emoji,
    };
  },
};
