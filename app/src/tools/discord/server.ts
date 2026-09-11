import type { ToolDefinition } from "../types";

export const discordGetServerInfoTool: ToolDefinition<
  Record<string, never>,
  {
    id: string;
    name: string;
    description: string | null;
    memberCount: number;
    ownerId: string;
    createdAt: string;
    boostLevel: number;
    premiumSubscriptionCount: number | null;
    rolesCount: number;
    channelsCount: number;
  }
> = {
  name: "discord_get_server_info",
  description:
    "Gets comprehensive metadata and statistics about the current Discord server (guild), including server name, member count, owner ID, boost status, and creation date.",
  parameters: {
    type: "OBJECT",
    properties: {},
  },
  isAvailable: (ctx) => Boolean(ctx.guild),
  execute: async (_args, ctx) => {
    if (!ctx.guild) {
      throw new Error("No Discord guild context available.");
    }

    const guild = ctx.guild;
    return {
      id: guild.id,
      name: guild.name,
      description: guild.description,
      memberCount: guild.memberCount,
      ownerId: guild.ownerId,
      createdAt: guild.createdAt.toISOString(),
      boostLevel: guild.premiumTier,
      premiumSubscriptionCount: guild.premiumSubscriptionCount,
      rolesCount: guild.roles.cache.size,
      channelsCount: guild.channels.cache.size,
    };
  },
};

export const discordGetServerOwnerTool: ToolDefinition<
  Record<string, never>,
  {
    ownerId: string;
    username: string;
    displayName: string;
    nickname: string | null;
    joinedAt: string | null;
  }
> = {
  name: "discord_get_server_owner",
  description:
    "Gets the owner of the current Discord server, returning their username, display name, nickname, user ID, and server join date.",
  parameters: {
    type: "OBJECT",
    properties: {},
  },
  isAvailable: (ctx) => Boolean(ctx.guild),
  execute: async (_args, ctx) => {
    if (!ctx.guild) {
      throw new Error("No Discord guild context available.");
    }

    const owner = await ctx.guild.fetchOwner();
    return {
      ownerId: owner.id,
      username: owner.user.username,
      displayName: owner.user.displayName,
      nickname: owner.nickname,
      joinedAt: owner.joinedAt?.toISOString() ?? null,
    };
  },
};
