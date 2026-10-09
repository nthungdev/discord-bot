import {
  type Guild,
  type GuildMember,
  StringSelectMenuBuilder,
} from "discord.js";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WITTY_GREETINGS,
  DEFAULT_WITTY_GREETINGS_VI,
} from "../constants";
import {
  buildButtonRows,
  buildPanelEmbed,
  buildSelectMenuRow,
  buildWelcomeGreeting,
  generateWittyWelcomeGreeting,
  resolveRoleLocale,
} from "../panel-builder";
import type { RolePanel } from "../types";

vi.mock("../../../utils/genAi", () => ({
  getGenAi: vi.fn().mockReturnValue({
    init: vi.fn(),
    generate: vi.fn().mockResolvedValue({
      content: "Look what the cat dragged in! Welcome {user} to {server}.",
      data: null,
    }),
  }),
  generateChatMessageWithGenAi: vi.fn().mockResolvedValue({
    content: "Look what the cat dragged in! Welcome {user} to {server}.",
    data: null,
  }),
}));

describe("PanelBuilder", () => {
  const mockRoles = Array.from({ length: 12 }, (_, i) => ({
    roleId: `role-${i + 1}`,
    label: `Role ${i + 1}`,
    emoji: i % 2 === 0 ? "🎮" : undefined,
    description: `Description for role ${i + 1}`,
  }));

  const sampleButtonPanel: RolePanel = {
    id: "games",
    guildId: "guild-1",
    title: "Game Roles",
    description: "Click to select games",
    type: "button",
    mode: "multi",
    roles: mockRoles,
    createdAt: 0,
    updatedAt: 0,
  };

  const sampleDropdownPanel: RolePanel = {
    id: "regions",
    guildId: "guild-1",
    title: "Regional Roles",
    description: "Pick your region",
    type: "dropdown",
    mode: "single",
    roles: mockRoles.slice(0, 5),
    createdAt: 0,
    updatedAt: 0,
  };

  describe("buildButtonRows", () => {
    it("should chunk buttons into rows of 5", () => {
      const rows = buildButtonRows(sampleButtonPanel);
      expect(rows.length).toBe(3); // 12 roles -> 5 + 5 + 2
      expect(rows[0].components.length).toBe(5);
      expect(rows[1].components.length).toBe(5);
      expect(rows[2].components.length).toBe(2);

      const firstBtn = rows[0].components[0].data;
      expect("custom_id" in firstBtn && firstBtn.custom_id).toBe(
        "role_btn:games:role-1",
      );
      expect("label" in firstBtn && firstBtn.label).toBe("Role 1");
    });

    it("should cap at 25 buttons even if panel has more", () => {
      const largePanel: RolePanel = {
        ...sampleButtonPanel,
        roles: Array.from({ length: 30 }, (_, i) => ({
          roleId: `role-${i + 1}`,
          label: `Role ${i + 1}`,
        })),
      };
      const rows = buildButtonRows(largePanel);
      expect(rows.length).toBe(5); // 5 rows of 5
      const totalButtons = rows.reduce(
        (sum, row) => sum + row.components.length,
        0,
      );
      expect(totalButtons).toBe(25);
    });

    it("should filter out roles that no longer exist in the guild cache", () => {
      const mockGuild = {
        roles: {
          cache: new Map([
            ["role-1", {}],
            ["role-3", {}],
          ]),
        },
      } as unknown as Guild;

      const rows = buildButtonRows(sampleButtonPanel, mockGuild);
      expect(rows.length).toBe(1);
      expect(rows[0].components.length).toBe(2);
    });
  });

  describe("buildSelectMenuRow", () => {
    it("should formulate single-select dropdown with min=1 and max=1", () => {
      const rows = buildSelectMenuRow(sampleDropdownPanel);
      expect(rows.length).toBe(1);
      const menu = rows[0].components[0];
      expect(menu).toBeInstanceOf(StringSelectMenuBuilder);
      const data = menu.data;
      expect("custom_id" in data && data.custom_id).toBe("role_select:regions");
      expect("min_values" in data && data.min_values).toBe(1);
      expect("max_values" in data && data.max_values).toBe(1);
      expect(menu.options.length).toBe(5);
    });

    it("should formulate multi-select dropdown with min=0 and max=role count", () => {
      const multiDropdown: RolePanel = {
        ...sampleDropdownPanel,
        mode: "multi",
      };
      const rows = buildSelectMenuRow(multiDropdown);
      const data = rows[0].components[0].data;
      expect("min_values" in data && data.min_values).toBe(0);
      expect("max_values" in data && data.max_values).toBe(5);
    });

    it("should return empty array if no options exist in guild", () => {
      const mockGuild = {
        roles: {
          cache: new Map(),
        },
      } as unknown as Guild;
      const rows = buildSelectMenuRow(sampleDropdownPanel, mockGuild);
      expect(rows.length).toBe(0);
    });
  });

  describe("resolveRoleLocale", () => {
    it("should return explicit localeOverride when vi or en-US", () => {
      expect(resolveRoleLocale("guild-1", "vi")).toBe("vi");
      expect(resolveRoleLocale("guild-1", "en-US")).toBe("en-US");
    });

    it("should parse prefix from localeOverride", () => {
      expect(resolveRoleLocale("guild-1", "vi_VN")).toBe("vi");
      expect(resolveRoleLocale("guild-1", "en-GB")).toBe("en-US");
    });

    it("should resolve from guild preferredLocale when override is absent", () => {
      expect(resolveRoleLocale(null, null, "en-US")).toBe("en-US");
      expect(resolveRoleLocale(null, null, "vi")).toBe("vi");
    });

    it("should default to vi when no locale information is provided", () => {
      expect(resolveRoleLocale(null, null, null)).toBe("vi");
      expect(resolveRoleLocale(null, null, "fr")).toBe("vi");
    });
  });

  describe("buildWelcomeGreeting", () => {
    it("should interpolate user, server, and count tokens", () => {
      const mockMember = {
        id: "user-456",
        guild: {
          id: "guild-1",
          name: "Bluegon Land",
          memberCount: 150,
        },
      } as unknown as GuildMember;

      const result = buildWelcomeGreeting(
        "Hey {user}! Welcome to {server} (member #{count}).",
        mockMember,
      );
      expect(result).toBe(
        "Hey <@user-456>! Welcome to Bluegon Land (member #150).",
      );
    });

    it("should fallback to random witty greeting in English when localeOverride is en-US", () => {
      const mockMember = {
        id: "user-456",
        guild: {
          id: "guild-1",
          name: "Bluegon Land",
          memberCount: 150,
        },
      } as unknown as GuildMember;

      const result = buildWelcomeGreeting(undefined, mockMember, "en-US");
      const expectedGreetings = DEFAULT_WITTY_GREETINGS.map((g) =>
        g
          .replaceAll("{user}", "<@user-456>")
          .replaceAll("{server}", "Bluegon Land")
          .replaceAll("{count}", "150"),
      );
      expect(expectedGreetings).toContain(result);
    });

    it("should fallback to random witty greeting in Vietnamese when localeOverride is vi", () => {
      const mockMember = {
        id: "user-456",
        guild: {
          id: "guild-1",
          name: "Bluegon Land",
          memberCount: 150,
        },
      } as unknown as GuildMember;

      const result = buildWelcomeGreeting(undefined, mockMember, "vi");
      const expectedGreetings = DEFAULT_WITTY_GREETINGS_VI.map((g) =>
        g
          .replaceAll("{user}", "<@user-456>")
          .replaceAll("{server}", "Bluegon Land")
          .replaceAll("{count}", "150"),
      );
      expect(expectedGreetings).toContain(result);
    });
  });

  describe("generateWittyWelcomeGreeting", () => {
    it("should generate dynamic witty greeting using GenAI in English when en-US", async () => {
      const mockMember = {
        id: "user-456",
        displayName: "Sam",
        user: { username: "sam_dev" },
        guild: {
          id: "guild-1",
          name: "Bluegon Land",
          memberCount: 150,
        },
      } as unknown as GuildMember;

      const result = await generateWittyWelcomeGreeting(mockMember, "en-US");
      expect(result).toContain("<@user-456>");
      expect(result).toContain("Bluegon Land");
    });

    it("should prepend Vietnamese greeting when user mention is missing in vi locale", async () => {
      const genAiUtils = await import("../../../utils/genAi");
      vi.mocked(genAiUtils.generateChatMessageWithGenAi).mockResolvedValueOnce({
        content: "Chúc bạn một ngày vui vẻ tại server!",
        data: null,
      });

      const mockMember = {
        id: "user-456",
        displayName: "Sam",
        user: { username: "sam_dev" },
        guild: {
          id: "guild-1",
          name: "Bluegon Land",
          memberCount: 150,
        },
      } as unknown as GuildMember;

      const result = await generateWittyWelcomeGreeting(mockMember, "vi");
      expect(result).toContain("Chào mừng <@user-456>!");
      expect(result).toContain("Chúc bạn một ngày vui vẻ");
    });

    it("should fallback to static witty greeting in English when GenAI fails with en-US", async () => {
      const genAiUtils = await import("../../../utils/genAi");
      vi.mocked(genAiUtils.generateChatMessageWithGenAi).mockRejectedValueOnce(
        new Error("AI generation timeout"),
      );

      const mockMember = {
        id: "user-456",
        displayName: "Sam",
        user: { username: "sam_dev" },
        guild: {
          id: "guild-1",
          name: "Bluegon Land",
          memberCount: 150,
        },
      } as unknown as GuildMember;

      const result = await generateWittyWelcomeGreeting(mockMember, "en-US");
      expect(result).toContain("<@user-456>");
      expect(result).toContain("Bluegon Land");
      expect(result).toContain("150");
    });

    it("should fallback to static witty greeting in Vietnamese when GenAI fails with vi", async () => {
      const genAiUtils = await import("../../../utils/genAi");
      vi.mocked(genAiUtils.generateChatMessageWithGenAi).mockRejectedValueOnce(
        new Error("AI generation timeout"),
      );

      const mockMember = {
        id: "user-456",
        displayName: "Sam",
        user: { username: "sam_dev" },
        guild: {
          id: "guild-1",
          name: "Bluegon Land",
          memberCount: 150,
        },
      } as unknown as GuildMember;

      const result = await generateWittyWelcomeGreeting(mockMember, "vi");
      expect(result).toContain("<@user-456>");
      expect(result).toContain("Bluegon Land");
      expect(result).toContain("150");
    });
  });

  describe("buildPanelEmbed", () => {
    it("should build embed with title and description", () => {
      const embed = buildPanelEmbed(sampleButtonPanel);
      expect(embed.data.title).toBe("Game Roles");
      expect(embed.data.description).toBe("Click to select games");
      expect(embed.data.color).toBe(0x5865f2);
    });
  });
});
