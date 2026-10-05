import { describe, expect, it, vi } from "vitest";
import { getGuildLocaleStore } from "../../../../services/locale/store";
import { data, execute } from "../locale";

describe("/locale command", () => {
  it("should have correct command metadata and subcommands", () => {
    const json = data.toJSON();
    expect(json.name).toBe("locale");
    expect(json.name_localizations).toEqual(
      expect.objectContaining({
        vi: "ngon-ngu",
        "en-US": "locale",
      }),
    );
    expect(json.options?.length).toBe(2);

    const setSub = json.options?.find((o) => o.name === "set");
    expect(setSub).toBeDefined();

    const statusSub = json.options?.find((o) => o.name === "status");
    expect(statusSub).toBeDefined();
  });

  it("should reject execution outside of a guild", async () => {
    const interaction = {
      guildId: null,
      reply: vi.fn().mockResolvedValue(undefined),
    };

    // @ts-expect-error partial mock
    await execute(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "This command can only be used inside a server.",
        ephemeral: true,
      }),
    );
  });

  it("should return status for status subcommand", async () => {
    const interaction = {
      guildId: "guild-test",
      options: {
        getSubcommand: () => "status",
      },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    // @ts-expect-error partial mock
    await execute(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Current server language"),
        ephemeral: true,
      }),
    );
  });

  it("should set language and defer/editReply for set subcommand", async () => {
    const store = getGuildLocaleStore();
    const setSpy = vi.spyOn(store, "setLocale").mockResolvedValue();

    const interaction = {
      guildId: "guild-test",
      options: {
        getSubcommand: () => "set",
        getString: () => "vi",
      },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
    };

    // @ts-expect-error partial mock
    await execute(interaction);
    expect(setSpy).toHaveBeenCalledWith("guild-test", "vi");
    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Tiếng Việt"),
      }),
    );
  });
});
