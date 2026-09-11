import { describe, expect, it, vi } from "vitest";
import type { ToolExecutionContext } from "../../types";
import {
  discordGetMemberInfoTool,
  discordSearchMembersTool,
} from ".././member";

describe("discord_get_member_info", () => {
  const memberAlice = {
    id: "user-alice-123",
    user: {
      username: "alice_dev",
      displayName: "Alice Wonderland",
      bot: false,
    },
    displayName: "Alice Wonderland",
    nickname: "Alicia",
    joinedAt: new Date("2024-02-01T00:00:00Z"),
    roles: {
      cache: [
        { id: "role-1", name: "@everyone" },
        { id: "role-2", name: "Developer" },
      ],
    },
  };

  const memberBob = {
    id: "user-bob-456",
    user: { username: "bob_ross", displayName: "Bob Ross", bot: false },
    displayName: "Bob Ross",
    nickname: null,
    joinedAt: new Date("2024-03-01T00:00:00Z"),
    roles: {
      cache: [
        { id: "role-1", name: "@everyone" },
        { id: "role-3", name: "Artist" },
      ],
    },
  };

  const mockGuild = {
    members: {
      fetch: vi.fn().mockImplementation((query?: string) => {
        if (!query) {
          return Promise.resolve([memberAlice, memberBob]);
        }
        if (query === memberAlice.id) return Promise.resolve(memberAlice);
        if (query === memberBob.id) return Promise.resolve(memberBob);
        return Promise.reject(new Error("Unknown Member"));
      }),
    },
  };

  const context: ToolExecutionContext = {
    botId: "bot-1",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    guild: mockGuild as any,
    author: {
      id: "user-alice-123",
      username: "alice_dev",
      displayName: "Alice Wonderland",
    },
  };

  it("should return context author info when no username or ID is provided", async () => {
    const result = await discordGetMemberInfoTool.execute({}, context);
    expect(result).toEqual({
      id: "user-alice-123",
      username: "alice_dev",
      displayName: "Alice Wonderland",
      nickname: "Alicia",
      joinedAt: "2024-02-01T00:00:00.000Z",
      isBot: false,
      roles: [{ id: "role-2", name: "Developer" }],
    });
  });

  it("should look up a member by username query", async () => {
    const result = await discordGetMemberInfoTool.execute(
      { usernameOrId: "@bob_ross" },
      context,
    );
    expect(result).toEqual({
      id: "user-bob-456",
      username: "bob_ross",
      displayName: "Bob Ross",
      nickname: null,
      joinedAt: "2024-03-01T00:00:00.000Z",
      isBot: false,
      roles: [{ id: "role-3", name: "Artist" }],
    });
  });

  it("should throw an error if member is not found", async () => {
    await expect(
      discordGetMemberInfoTool.execute(
        { usernameOrId: "nonexistent_user" },
        context,
      ),
    ).rejects.toThrow("could not be found in this server");
  });
});

describe("discord_search_members", () => {
  const memberAlice = {
    id: "user-alice-123",
    user: {
      username: "alice_dev",
      displayName: "Alice Wonderland",
      bot: false,
    },
    displayName: "Alice Wonderland",
    nickname: "Alicia",
    roles: { cache: [{ id: "role-2", name: "Developer" }] },
  };

  const memberBot = {
    id: "user-bot-789",
    user: { username: "helpful_bot", displayName: "Helper Bot", bot: true },
    displayName: "Helper Bot",
    nickname: null,
    roles: { cache: [] },
  };

  const mockGuild = {
    members: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cache: new Map<string, any>([
        ["user-alice-123", memberAlice],
        ["user-bot-789", memberBot],
      ]),
      fetch: vi
        .fn()
        .mockImplementation(() => Promise.resolve([memberAlice, memberBot])),
    },
  };

  const context: ToolExecutionContext = {
    botId: "bot-1",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    guild: mockGuild as any,
  };

  it("should search members by display name", async () => {
    const result = await discordSearchMembersTool.execute(
      { query: "Alice" },
      context,
    );
    expect(result.count).toBe(1);
    expect(result.members[0]).toMatchObject({
      id: "user-alice-123",
      username: "alice_dev",
      displayName: "Alice Wonderland",
      isBot: false,
    });
  });

  it("should search and identify bot members", async () => {
    const result = await discordSearchMembersTool.execute(
      { query: "Helper" },
      context,
    );
    expect(result.count).toBe(1);
    expect(result.members[0]).toMatchObject({
      id: "user-bot-789",
      username: "helpful_bot",
      isBot: true,
    });
  });

  it("should throw error if search query is empty", async () => {
    await expect(
      discordSearchMembersTool.execute({ query: "   " }, context),
    ).rejects.toThrow("Search query must not be empty.");
  });
});
