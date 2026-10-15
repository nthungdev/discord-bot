import type { ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { BotsConfig } from "../../../../config/types";
import { execute as executeRiot } from "../riot";
import { data, execute } from "../val";

describe("/val slash command", () => {
  it("should have correct command metadata and subcommands", () => {
    expect(data.name).toBe("val");
    const json = data.toJSON();
    const subcommandNames = json.options?.map((opt) => opt.name);
    expect(subcommandNames).toEqual(
      expect.arrayContaining([
        "stats",
        "compare",
        "live",
        "profile",
        "health",
        "link",
        "config",
      ]),
    );
  });

  it("should reject execution with polite notice if sub-feature is disabled in guild config", async () => {
    const mockInteraction = {
      guildId: "guild-1",
      options: {
        getSubcommand: vi.fn().mockReturnValue("compare"),
        getUser: vi.fn(),
      },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    const { Config } = await import("../../../../config");
    vi.spyOn(Config.getInstance(), "getConfigValue").mockReturnValue({
      chatBot: {
        guilds: {
          "guild-1": {
            valorant: {
              enabled: true,
              features: {
                compare: { enabled: false },
              },
            },
          },
        },
      },
    } as unknown as BotsConfig);

    await execute(mockInteraction);

    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining(
        "The `compare` feature is currently disabled",
      ),
      ephemeral: true,
    });
  });

  it("should handle /val link successfully", async () => {
    const mockInteraction = {
      user: { id: "user-123" },
      options: {
        getSubcommand: vi.fn().mockReturnValue("link"),
        getString: vi.fn().mockImplementation((key: string) => {
          if (key === "riot_id") return "TenZ#NA1";
          if (key === "region") return "na";
          return null;
        }),
      },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await execute(mockInteraction);

    expect(mockInteraction.deferReply).toHaveBeenCalledWith({
      ephemeral: true,
    });
    expect(mockInteraction.editReply).toHaveBeenCalledWith({
      embeds: [expect.any(Object)],
    });
  });

  it("should handle /riot link successfully", async () => {
    const mockInteraction = {
      user: { id: "user-123" },
      options: {
        getSubcommand: vi.fn().mockReturnValue("link"),
        getString: vi.fn().mockImplementation((key: string) => {
          if (key === "riot_id") return "Hung#VN1";
          if (key === "region") return "ap";
          return null;
        }),
      },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await executeRiot(mockInteraction);

    expect(mockInteraction.deferReply).toHaveBeenCalledWith({
      ephemeral: true,
    });
    expect(mockInteraction.editReply).toHaveBeenCalledWith({
      embeds: [expect.any(Object)],
    });
  });

  it("should reject /val config if user does not have ManageGuild permission", async () => {
    const mockInteraction = {
      guildId: "guild-1",
      memberPermissions: {
        has: vi.fn().mockReturnValue(false),
      },
      options: {
        getSubcommand: vi.fn().mockReturnValue("config"),
        getString: vi.fn().mockReturnValue("compare"),
        getBoolean: vi.fn().mockReturnValue(false),
        getChannel: vi.fn().mockReturnValue(null),
      },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await execute(mockInteraction);

    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("Manage Server"),
      ephemeral: true,
    });
  });

  it("should update guild config on /val config with ManageGuild permission", async () => {
    const mockInteraction = {
      guildId: "guild-1",
      memberPermissions: {
        has: vi.fn().mockReturnValue(true),
      },
      options: {
        getSubcommand: vi.fn().mockReturnValue("config"),
        getString: vi.fn().mockReturnValue("compare"),
        getBoolean: vi.fn().mockReturnValue(false),
        getChannel: vi.fn().mockReturnValue(null),
      },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await execute(mockInteraction);

    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("Successfully set Valorant feature"),
      ephemeral: true,
    });
  });
});
