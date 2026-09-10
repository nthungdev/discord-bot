import { ToolDefinition } from "../types";

export const discordListRolesTool: ToolDefinition<
  Record<string, never>,
  {
    roles: {
      id: string;
      name: string;
      color: string;
      position: number;
      memberCount: number;
      mentionable: boolean;
    }[];
  }
> = {
  name: "discord_list_roles",
  description:
    "Lists all roles defined in the current Discord server, including role names, IDs, hex colors, and member counts.",
  parameters: {
    type: "OBJECT",
    properties: {},
  },
  isAvailable: (ctx) => Boolean(ctx.guild),
  execute: async (_args, ctx) => {
    if (!ctx.guild) {
      throw new Error("No Discord guild context available.");
    }

    const roles = await ctx.guild.roles.fetch();
    return {
      roles: roles
        .filter((r) => r.name !== "@everyone")
        .map((r) => ({
          id: r.id,
          name: r.name,
          color: r.hexColor,
          position: r.position,
          memberCount: r.members.size,
          mentionable: r.mentionable,
        }))
        .sort((a, b) => b.position - a.position),
    };
  },
};
