import { ChannelType, GuildBasedChannel } from "discord.js";
import { ToolDefinition } from "../types";

export interface ListChannelsArgs {
  type?: "text" | "voice" | "category" | "all";
}

export const discordListChannelsTool: ToolDefinition<
  ListChannelsArgs,
  {
    channels: {
      id: string;
      name: string;
      type: string;
      parentId: string | null;
      position: number;
    }[];
  }
> = {
  name: "discord_list_channels",
  description:
    "Lists channels in the current Discord server, optionally filtered by channel type (text, voice, category, all).",
  parameters: {
    type: "OBJECT",
    properties: {
      type: {
        type: "STRING",
        description:
          "Type of channels to filter by: 'text', 'voice', 'category', or 'all'. Defaults to 'all'.",
        enum: ["text", "voice", "category", "all"],
      },
    },
  },
  isAvailable: (ctx) => Boolean(ctx.guild),
  execute: async (args, ctx) => {
    if (!ctx.guild) {
      throw new Error("No Discord guild context available.");
    }

    const filterType = args.type ?? "all";
    const fetchedChannels = await ctx.guild.channels.fetch();
    const channelList: GuildBasedChannel[] = [];

    fetchedChannels.forEach((c) => {
      if (c) channelList.push(c);
    });

    const filtered = channelList.filter((channel) => {
      if (filterType === "text") {
        return (
          channel.type === ChannelType.GuildText ||
          channel.type === ChannelType.GuildAnnouncement
        );
      }
      if (filterType === "voice") {
        return (
          channel.type === ChannelType.GuildVoice ||
          channel.type === ChannelType.GuildStageVoice
        );
      }
      if (filterType === "category") {
        return channel.type === ChannelType.GuildCategory;
      }
      return true;
    });

    return {
      channels: filtered.map((c) => ({
        id: c.id,
        name: c.name,
        type: ChannelType[c.type] ?? String(c.type),
        parentId: c.parentId,
        position: "position" in c ? c.position : 0,
      })),
    };
  },
};

export interface GetChannelInfoArgs {
  channelIdOrName?: string;
}

export const discordGetChannelInfoTool: ToolDefinition<
  GetChannelInfoArgs,
  {
    id: string;
    name: string;
    type: string;
    topic: string | null;
    createdAt: string | null;
    nsfw: boolean;
    rateLimitPerUser: number;
  }
> = {
  name: "discord_get_channel_info",
  description:
    "Gets detailed information about a specific Discord channel in the server by channel name or ID. If omitted, returns info about the current active channel.",
  parameters: {
    type: "OBJECT",
    properties: {
      channelIdOrName: {
        type: "STRING",
        description:
          "The Discord channel ID or channel name (e.g. 'general') to inspect. If omitted, inspects the current channel.",
      },
    },
  },
  isAvailable: (ctx) => Boolean(ctx.guild || ctx.channel),
  execute: async (args, ctx) => {
    const query = args.channelIdOrName?.trim().replace(/^#/, "");
    let targetChannel: GuildBasedChannel | null = null;

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
    }

    if (!targetChannel) {
      throw new Error(
        `Channel '${query || ctx.channel?.id || "unknown"}' could not be found.`,
      );
    }

    const textChannel = targetChannel.isTextBased() ? targetChannel : null;

    return {
      id: targetChannel.id,
      name: targetChannel.name,
      type: ChannelType[targetChannel.type] ?? String(targetChannel.type),
      topic: "topic" in targetChannel ? targetChannel.topic : null,
      createdAt: targetChannel.createdAt?.toISOString() ?? null,
      nsfw: "nsfw" in targetChannel ? Boolean(targetChannel.nsfw) : false,
      rateLimitPerUser:
        textChannel && "rateLimitPerUser" in textChannel
          ? (textChannel.rateLimitPerUser ?? 0)
          : 0,
    };
  },
};
