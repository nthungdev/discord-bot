import type { GuildMember } from "discord.js";
import type { ToolDefinition } from "../types";

export interface GetMemberInfoArgs {
  usernameOrId?: string;
}

/**
 * Checks if a member matches a search query string.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function matchesMemberQuery(m: any, clean: string): boolean {
  return (
    m.id === clean ||
    m.user?.username?.toLowerCase() === clean ||
    m.displayName?.toLowerCase() === clean ||
    m.nickname?.toLowerCase() === clean
  );
}

/**
 * Checks if a member loosely matches a query for search.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function matchesLooseMemberQuery(m: any, clean: string): boolean {
  const username = m.user?.username?.toLowerCase() ?? "";
  const displayName =
    (m.displayName || m.user?.displayName)?.toLowerCase() ?? "";
  const nickname = m.nickname?.toLowerCase() ?? "";
  return (
    displayName.includes(clean) ||
    username.includes(clean) ||
    nickname.includes(clean)
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findMemberById(guild: any, targetId: string): Promise<any> {
  if (guild.members.cache?.has(targetId)) {
    return guild.members.cache.get(targetId);
  }
  try {
    return await guild.members.fetch(targetId);
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toMemberList(result: any): any[] {
  if (!result) return [];
  if ("values" in result) return Array.from(result.values());
  if (Array.isArray(result)) return result;
  return [result];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function searchMembersByQuery(
  guild: any,
  cleanQuery: string,
): Promise<any> {
  try {
    const searchResult = await guild.members.fetch({
      query: cleanQuery,
      limit: 10,
    });
    const list = toMemberList(searchResult);
    return (
      list.find((m) => matchesMemberQuery(m, cleanQuery)) ?? list[0] ?? null
    );
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function searchAllGuildMembers(
  guild: any,
  cleanQuery: string,
): Promise<any> {
  try {
    const allMembers = await guild.members.fetch();
    const list = toMemberList(allMembers);
    return list.find((m) => matchesMemberQuery(m, cleanQuery)) ?? null;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findMemberByNameQuery(
  guild: any,
  cleanQuery: string,
): Promise<any> {
  if (guild.members?.cache) {
    const cached = guild.members.cache.find((m: any) =>
      matchesMemberQuery(m, cleanQuery),
    );
    if (cached) return cached;
  }

  const found = await searchMembersByQuery(guild, cleanQuery);
  if (found) return found;

  return await searchAllGuildMembers(guild, cleanQuery);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatMemberResult(member: any) {
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
    "Get detailed information about a Discord member (roles, nickname, display name, bot status, joined date) in the current server.",
  parameters: {
    type: "OBJECT",
    properties: {
      usernameOrId: {
        type: "STRING",
        description:
          "The user ID, username, or display name to look up. If omitted, looks up the message author.",
      },
    },
  },
  isAvailable: (ctx) => Boolean(ctx.guild),
  execute: async (args, ctx) => {
    if (!ctx.guild) {
      throw new Error("No Discord guild context available.");
    }

    const query = args.usernameOrId?.trim();
    const targetMemberId = query || ctx.author?.id;

    let member = targetMemberId
      ? await findMemberById(ctx.guild, targetMemberId)
      : null;

    if (!member && query) {
      const cleanQuery = query.replace(/^@/, "").toLowerCase();
      member = await findMemberByNameQuery(ctx.guild, cleanQuery);
    }

    if (!member) {
      throw new Error(
        `Member '${query || ctx.author?.username || "unknown"}' could not be found in this server.`,
      );
    }

    return formatMemberResult(member);
  },
};

export interface SearchMembersArgs {
  query: string;
  limit?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function appendMatchingMembers(
  source: any,
  cleanQuery: string,
  limit: number,
  matches: Map<string, any>,
) {
  if (!source) return;
  const list =
    "values" in source
      ? Array.from(source.values())
      : Array.isArray(source)
        ? source
        : [source];

  for (const m of list) {
    if (matchesLooseMemberQuery(m, cleanQuery)) {
      matches.set(m.id, m);
      if (matches.size >= limit) break;
    }
  }
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

    // 1. Search cached members
    if (ctx.guild.members.cache) {
      appendMatchingMembers(
        ctx.guild.members.cache,
        cleanQuery,
        limit,
        matches,
      );
    }

    // 2. Query REST search endpoint if needed
    if (matches.size < limit) {
      try {
        const fetched = await ctx.guild.members.fetch({
          query: cleanQuery,
          limit,
        });
        appendMatchingMembers(fetched, cleanQuery, limit, matches);
      } catch {
        // Ignore REST search failure
      }
    }

    // 3. Fallback to full fetch if still empty
    if (matches.size === 0) {
      try {
        const all = await ctx.guild.members.fetch();
        appendMatchingMembers(all, cleanQuery, limit, matches);
      } catch {
        // Ignore
      }
    }

    const members = Array.from(matches.values())
      .slice(0, limit)
      .map((m) => ({
        id: m.id,
        username: m.user?.username ?? m.username ?? "unknown",
        displayName:
          m.displayName ?? m.user?.displayName ?? m.user?.username ?? "unknown",
        nickname: m.nickname ?? null,
        isBot: Boolean(m.user?.bot),
        roles: m.roles?.cache
          ? m.roles.cache
              .filter((r: { name: string }) => r.name !== "@everyone")
              .map((r: { id: string; name: string }) => ({
                id: r.id,
                name: r.name,
              }))
          : [],
      }));

    return {
      members,
      count: members.length,
    };
  },
};
