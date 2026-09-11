import { describe, it, expect, vi } from "vitest";
import { deployGuildCommands } from "./deployCommands";

vi.mock("discord.js", async () => {
  const actual = await vi.importActual<typeof import("discord.js")>(
    "discord.js",
  );
  return {
    ...actual,
    REST: vi.fn().mockImplementation(() => ({
      setToken: vi.fn().mockReturnThis(),
      put: vi.fn().mockResolvedValue([{ id: "cmd1" }, { id: "cmd2" }]),
    })),
  };
});

vi.mock("./helpers", () => ({
  parseCommands: vi.fn().mockResolvedValue([
    {
      data: {
        toJSON: () => ({ name: "test-command" }),
      },
    },
  ]),
}));

describe("deployGuildCommands", () => {
  it("should deploy commands via Discord REST API", async () => {
    await expect(
      deployGuildCommands("mock-token", "mock-client-id", "mock-guild-id"),
    ).resolves.not.toThrow();
  });
});
