import { ToolDefinition } from "../types";

export interface GetMemberInfoArgs {
  usernameOrId?: string;
}

export const discordGetMemberInfoTool: ToolDefinition<
  GetMemberInfoArgs,
  {
    id: string;
    username: string;
    displayName: string;
    nickname: string | null;
    joinedAt: string | null;
    isBot: boolean;
    roles: { id: string; name: string }[];
  }
> = {
  name: "discord_get_member_info",
  description:
    "Gets detailed information about a Discord server member by their username, nickname, or user ID. If omitted, returns info about the message author.",
  parameters: {
    type: "OBJECT",
    properties: {
      usernameOrId: {
        type: "STRING",
        description:
          "The Discord username, display name, nickname, or user ID of the member to look up.",
      },
    },
  },
  isAvailable: (ctx) => Boolean(ctx.guild),
  execute: async (args, ctx) => {
    if (!ctx.guild) {
      throw new Error("No Discord guild context available.");
    }

    const query = args.usernameOrId?.trim();
    let targetMemberId = query;

    if (!targetMemberId && ctx.author?.id) {
      targetMemberId = ctx.author.id;
    }

    let member = null;

    if (targetMemberId) {
      try {
        // Attempt direct ID fetch
        member = await ctx.guild.members.fetch(targetMemberId);
      } catch {
        // Not a direct ID match or not cached, continue to search
      }
    }

    if (!member && query) {
      const cleanQuery = query.replace(/^@/, "").toLowerCase();
      // Search in cached members or fetch
      const members = await ctx.guild.members.fetch();
      member = members.find(
        (m) =>
          m.id === cleanQuery ||
          m.user.username.toLowerCase() === cleanQuery ||
          m.displayName.toLowerCase() === cleanQuery ||
          m.nickname?.toLowerCase() === cleanQuery,
      );
    }

    if (!member) {
      throw new Error(
        `Member '${query || ctx.author?.username || "unknown"}' could not be found in this server.`,
      );
    }

    return {
      id: member.id,
      username: member.user.username,
      displayName: member.user.displayName,
      nickname: member.nickname,
      joinedAt: member.joinedAt?.toISOString() ?? null,
      isBot: member.user.bot,
      roles: member.roles.cache
        .filter((r) => r.name !== "@everyone")
        .map((r) => ({ id: r.id, name: r.name })),
    };
  },
};
