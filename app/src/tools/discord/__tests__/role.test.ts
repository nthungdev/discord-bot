import { describe, expect, it, vi } from "vitest";
import type { ToolExecutionContext } from "../../types";
import { discordListRolesTool } from ".././role";

describe("discord_list_roles", () => {
  const roleEveryone = {
    id: "role-1",
    name: "@everyone",
    hexColor: "#000000",
    position: 0,
    members: { size: 100 },
    mentionable: false,
  };

  const roleAdmin = {
    id: "role-2",
    name: "Admin",
    hexColor: "#ff0000",
    position: 10,
    members: { size: 2 },
    mentionable: true,
  };

  const roleMod = {
    id: "role-3",
    name: "Moderator",
    hexColor: "#00ff00",
    position: 5,
    members: { size: 5 },
    mentionable: false,
  };

  const mockGuild = {
    roles: {
      fetch: vi.fn().mockResolvedValue([roleEveryone, roleAdmin, roleMod]),
    },
  };

  const context: ToolExecutionContext = {
    botId: "bot-1",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    guild: mockGuild as any,
  };

  it("should list roles excluding @everyone sorted by position descending", async () => {
    const result = await discordListRolesTool.execute({}, context);
    expect(result.roles).toEqual([
      {
        id: "role-2",
        name: "Admin",
        color: "#ff0000",
        position: 10,
        memberCount: 2,
        mentionable: true,
      },
      {
        id: "role-3",
        name: "Moderator",
        color: "#00ff00",
        position: 5,
        memberCount: 5,
        mentionable: false,
      },
    ]);
  });

  it("should throw error if guild context is missing", async () => {
    await expect(
      discordListRolesTool.execute({}, { botId: "bot-1" }),
    ).rejects.toThrow("No Discord guild context available.");
  });
});
