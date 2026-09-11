import type { GuildMember } from "discord.js";
import type { ToolDefinition } from "../types";

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let member: any = null;

    // Helper to match member against query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchesQuery = (m: any, clean: string) =>
      m.id === clean ||
      m.user?.username?.toLowerCase() === clean ||
      m.displayName?.toLowerCase() === clean ||
      m.nickname?.toLowerCase() === clean;

    // 1. If targetMemberId looks like a snowflake or author ID, try cache or direct fetch
    if (targetMemberId) {
      if (ctx.guild.members.cache?.has(targetMemberId)) {
        member = ctx.guild.members.cache.get(targetMemberId);
      } else {
        try {
          member = await ctx.guild.members.fetch(targetMemberId);
        } catch {
          // Not a direct ID match or not cached, continue
        }
      }
    }

    // 2. Search by name/query
    if (!member && query) {
      const cleanQuery = query.replace(/^@/, "").toLowerCase();

      // Check cache first (fast, no network)
      if (ctx.guild.members.cache) {
        member = ctx.guild.members.cache.find((m) =>
          matchesQuery(m, cleanQuery),
        );
      }

      // Fast REST member search (/guilds/{id}/members/search)
      if (!member) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const searchResult: any = await ctx.guild.members.fetch({
            query: cleanQuery,
            limit: 10,
          });
          const list =
            searchResult && "values" in searchResult
              ? Array.from(searchResult.values())
              : Array.isArray(searchResult)
                ? searchResult
                : [searchResult];
          member =
            list.find((m) => matchesQuery(m, cleanQuery)) ?? list[0] ?? null;
        } catch {
          // If REST search fails or is mocked without options support, fallback to full fetch/cache
        }
      }

      // Fallback for mocks or when search didn't yield results
      if (!member) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const allMembers: any = await ctx.guild.members.fetch();
          const list =
            allMembers && "values" in allMembers
              ? Array.from(allMembers.values())
              : Array.isArray(allMembers)
                ? allMembers
                : [allMembers];
          member = list.find((m) => matchesQuery(m, cleanQuery)) ?? null;
        } catch {
          // Ignore
        }
      }
    }

    if (!member) {
      throw new Error(
        `Member '${query || ctx.author?.username || "unknown"}' could not be found in this server.`,
      );
    }

    return {
      id: member.id,
      username: member.user.username,
      displayName: member.displayName || member.user.displayName,
      nickname: member.nickname ?? null,
      joinedAt:
        member.joinedAt?.toISOString?.() ??
        (member.joinedAt ? new Date(member.joinedAt).toISOString() : null),
      isBot: Boolean(member.user.bot),
      roles: member.roles?.cache
        ? member.roles.cache
            .filter((r: { name: string }) => r.name !== "@everyone")
            .map((r: { id: string; name: string }) => ({
              id: r.id,
              name: r.name,
            }))
        : [],
    };
  },
};

export interface SearchMembersArgs {
  query: string;
  limit?: number;
}

export const discordSearchMembersTool: ToolDefinition<
  SearchMembersArgs,
  {
    members: {
      id: string;
      username: string;
      displayName: string;
      nickname: string | null;
      isBot: boolean;
      roles: { id: string; name: string }[];
    }[];
    count: number;
  }
> = {
  name: "discord_search_members",
  description:
    "Search for Discord members in the server by display name, nickname, or username. Returns a list of matching members with their IDs, names, and whether they are bots.",
  parameters: {
    type: "OBJECT",
    properties: {
      query: {
        type: "STRING",
        description:
          "The name or partial name (display name, nickname, or username) to search for.",
      },
      limit: {
        type: "INTEGER",
        description: "Maximum number of members to return (1-20, default: 10).",
      },
    },
    required: ["query"],
  },
  isAvailable: (ctx) => Boolean(ctx.guild),
  execute: async (args, ctx) => {
    if (!ctx.guild) {
      throw new Error("No Discord guild context available.");
    }

    const query = args.query?.trim();
    if (!query) {
      throw new Error("Search query must not be empty.");
    }

    const cleanQuery = query.replace(/^@/, "").toLowerCase();
    const limit = Math.min(Math.max(args.limit ?? 10, 1), 20);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matches = new Map<string, any>();

    // 1. Search cached members first
    if (ctx.guild.members.cache) {
      for (const m of ctx.guild.members.cache.values()) {
        const username = m.user?.username?.toLowerCase() ?? "";
        const displayName = m.displayName?.toLowerCase() ?? "";
        const nickname = m.nickname?.toLowerCase() ?? "";

        if (
          displayName.includes(cleanQuery) ||
          username.includes(cleanQuery) ||
          nickname.includes(cleanQuery)
        ) {
          matches.set(m.id, m);
          if (matches.size >= limit) break;
        }
      }
    }

    // 2. Query REST search endpoint if more results needed
    if (matches.size < limit) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fetched: any = await ctx.guild.members.fetch({
          query: cleanQuery,
          limit,
        });
        const list =
          fetched && "values" in fetched
            ? Array.from(fetched.values())
            : Array.isArray(fetched)
              ? fetched
              : [fetched];

        for (const m of list) {
          const username = m.user?.username?.toLowerCase() ?? "";
          const displayName =
            (m.displayName || m.user?.displayName)?.toLowerCase() ?? "";
          const nickname = m.nickname?.toLowerCase() ?? "";

          if (
            displayName.includes(cleanQuery) ||
            username.includes(cleanQuery) ||
            nickname.includes(cleanQuery)
          ) {
            matches.set(m.id, m);
            if (matches.size >= limit) break;
          }
        }
      } catch {
        // Ignore REST search failure
      }
    }

    // 3. Fallback to full fetch if still empty and supported
    if (matches.size === 0) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const all: any = await ctx.guild.members.fetch();
        const list =
          all && "values" in all
            ? Array.from(all.values())
            : Array.isArray(all)
              ? all
              : [all];

        for (const m of list) {
          const username = m.user?.username?.toLowerCase() ?? "";
          const displayName = m.displayName?.toLowerCase() ?? "";
          const nickname = m.nickname?.toLowerCase() ?? "";

          if (
            displayName.includes(cleanQuery) ||
            username.includes(cleanQuery) ||
            nickname.includes(cleanQuery)
          ) {
            matches.set(m.id, m);
            if (matches.size >= limit) break;
          }
        }
      } catch {
        // Ignore
      }
    }

    const results = Array.from(matches.values())
      .slice(0, limit)
      .map((m: GuildMember) => ({
        id: m.id,
        username: m.user.username,
        displayName: m.displayName || m.user.displayName,
        nickname: m.nickname ?? null,
        isBot: Boolean(m.user.bot),
        roles: m.roles?.cache
          ? m.roles.cache
              .filter((r) => r.name !== "@everyone")
              .map((r) => ({ id: r.id, name: r.name }))
          : [],
      }));

    return {
      members: results,
      count: results.length,
    };
  },
};
