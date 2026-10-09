import {
  type Guild,
  type GuildMember,
  StringSelectMenuBuilder,
} from "discord.js";
import { describe, expect, it } from "vitest";
import {
  buildButtonRows,
  buildPanelEmbed,
  buildSelectMenuRow,
  buildWelcomeGreeting,
} from "../panel-builder";
import type { RolePanel } from "../types";

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

  describe("buildWelcomeGreeting", () => {
    it("should interpolate user, server, and count tokens", () => {
      const mockMember = {
        id: "user-456",
        guild: {
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

    it("should fallback to random witty greeting when template is undefined", () => {
      const mockMember = {
        id: "user-456",
        guild: {
          name: "Bluegon Land",
          memberCount: 150,
        },
      } as unknown as GuildMember;

      const result = buildWelcomeGreeting(undefined, mockMember);
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
