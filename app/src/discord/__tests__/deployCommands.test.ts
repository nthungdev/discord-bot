import { describe, expect, it } from "vitest";
import { filterCommandsForGuildLocale } from "../deployCommands";

describe("filterCommandsForGuildLocale (Option A)", () => {
  const sampleCommands = [
    {
      name: "chan",
      description: "Chan ban be",
      name_localizations: { vi: "chan", "en-US": "roast" },
      description_localizations: { vi: "Chan ban be", "en-US": "Roast friend" },
      options: [
        {
          name: "muc-tieu",
          description: "Thanh vien bi chan",
          name_localizations: { vi: "muc-tieu", "en-US": "target" },
          description_localizations: {
            vi: "Thanh vien bi chan",
            "en-US": "Target user",
          },
        },
      ],
    },
    {
      name: "roast",
      description: "Roast a friend",
      name_localizations: { vi: "chan", "en-US": "roast" },
      options: [],
    },
    {
      name: "roast-shield",
      description: "Shield settings",
      name_localizations: { vi: "chan-khien", "en-US": "roast-shield" },
      options: [
        {
          name: "opt-out",
          description: "Opt out",
          name_localizations: { vi: "tu-choi" },
        },
      ],
    },
    {
      name: "Roast User",
      description: "",
      name_localizations: { vi: "Chan người này", "en-US": "Roast User" },
    },
    {
      name: "ping",
      description: "Ping",
      options: [],
    },
  ];

  it("should filter commands for Vietnamese override (Option A)", () => {
    const filtered = filterCommandsForGuildLocale(sampleCommands, "vi");

    // Omit English roast alias
    expect(filtered.find((c) => c.name === "roast")).toBeUndefined();

    // Keep chan without English name_localizations or English option localizations
    const chanCmd = filtered.find((c) => c.name === "chan");
    expect(chanCmd).toBeDefined();
    expect(chanCmd?.name_localizations?.["en-US"]).toBeUndefined();
    expect(chanCmd?.options?.[0].name_localizations?.["en-US"]).toBeUndefined();

    // Check roast-shield renamed to chan-khien with subcommands renamed
    const shieldCmd = filtered.find((c) => c.name === "chan-khien");
    expect(shieldCmd).toBeDefined();
    expect(shieldCmd?.options?.[0].name).toBe("tu-choi");

    // Check context menu renamed to Chan người này
    const contextCmd = filtered.find((c) => c.name === "Chan người này");
    expect(contextCmd).toBeDefined();

    // Check other commands remain
    expect(filtered.find((c) => c.name === "ping")).toBeDefined();
  });

  it("should filter commands for English override", () => {
    const filtered = filterCommandsForGuildLocale(sampleCommands, "en-US");

    expect(filtered.find((c) => c.name === "chan")).toBeUndefined();
    expect(filtered.find((c) => c.name === "roast")).toBeDefined();
  });

  it("should retain all commands when localeOverride is auto or undefined", () => {
    const filtered = filterCommandsForGuildLocale(sampleCommands, "auto");
    expect(filtered.length).toBe(sampleCommands.length);
  });
});
