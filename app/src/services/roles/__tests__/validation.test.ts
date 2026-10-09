import {
  type Guild,
  type GuildMember,
  PermissionFlagsBits,
  type Role,
} from "discord.js";
import { describe, expect, it } from "vitest";
import type { RolePanel } from "../types";
import {
  validatePanelRoleCapacity,
  validateRoleManageable,
  validateRoleRevocable,
} from "../validation";

describe("Role Validation Guardrails", () => {
  const createMockRole = (options: {
    id?: string;
    name?: string;
    position?: number;
    permissions?: bigint[];
    managed?: boolean;
  }): Role => {
    const permsSet = new Set(options.permissions ?? []);
    return {
      id: options.id ?? "role-1",
      name: options.name ?? "Test Role",
      position: options.position ?? 5,
      managed: options.managed ?? false,
      permissions: {
        has: (flag: bigint) => permsSet.has(flag),
      },
    } as unknown as Role;
  };

  const createMockGuild = (options: {
    ownerId?: string;
    botManageRoles?: boolean;
    botHighestPos?: number;
  }): Guild => {
    const botPerms = new Set<bigint>();
    if (options.botManageRoles !== false) {
      botPerms.add(PermissionFlagsBits.ManageRoles);
    }

    return {
      id: "guild-1",
      ownerId: options.ownerId ?? "owner-user",
      members: {
        me: {
          permissions: {
            has: (flag: bigint) => botPerms.has(flag),
          },
          roles: {
            highest: {
              name: "Bot Role",
              position: options.botHighestPos ?? 10,
            },
          },
        },
      },
    } as unknown as Guild;
  };

  const createMockMember = (options: {
    id?: string;
    highestPos?: number;
  }): GuildMember => {
    return {
      id: options.id ?? "mod-user",
      roles: {
        highest: {
          name: "Mod Role",
          position: options.highestPos ?? 8,
        },
      },
    } as unknown as GuildMember;
  };

  it("should fail validation if bot lacks ManageRoles permission", () => {
    const guild = createMockGuild({ botManageRoles: false });
    const role = createMockRole({ position: 2 });

    const result = validateRoleManageable(guild, role);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Bot lacks the 'Manage Roles' permission");
  });

  it("should fail validation if role is higher than bot's highest role", () => {
    const guild = createMockGuild({ botHighestPos: 10 });
    const role = createMockRole({ position: 12 });

    const result = validateRoleManageable(guild, role);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(
      "higher than or equal to the bot's highest role",
    );
  });

  it("should fail validation if role is equal to bot's highest role", () => {
    const guild = createMockGuild({ botHighestPos: 10 });
    const role = createMockRole({ position: 10 });

    const result = validateRoleManageable(guild, role);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(
      "higher than or equal to the bot's highest role",
    );
  });

  it("should fail validation if caller is not owner and role is higher than caller's role", () => {
    const guild = createMockGuild({
      ownerId: "server-owner",
      botHighestPos: 20,
    });
    const caller = createMockMember({ id: "moderator", highestPos: 8 });
    const role = createMockRole({ position: 9 });

    const result = validateRoleManageable(guild, role, caller);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("higher than or equal to your highest role");
  });

  it("should allow server owner even if role position is equal or higher than owner's role", () => {
    const guild = createMockGuild({
      ownerId: "server-owner",
      botHighestPos: 20,
    });
    const caller = createMockMember({ id: "server-owner", highestPos: 8 });
    const role = createMockRole({ position: 12 });

    const result = validateRoleManageable(guild, role, caller);
    expect(result.valid).toBe(true);
  });

  it("should reject roles possessing Administrator or sensitive moderation permissions", () => {
    const guild = createMockGuild({ botHighestPos: 20 });
    const sensitivePerms = [
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.MentionEveryone,
    ];

    for (const perm of sensitivePerms) {
      const role = createMockRole({
        position: 5,
        permissions: [perm],
      });
      const result = validateRoleManageable(guild, role);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(
        "sensitive administrative or moderation permissions",
      );
    }
  });

  it("should reject managed or integration roles", () => {
    const guild = createMockGuild({ botHighestPos: 20 });
    const roleManaged = createMockRole({
      position: 5,
      managed: true,
    });

    const result = validateRoleManageable(guild, roleManaged);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("managed by an external integration");
  });

  it("should approve valid role below bot and caller", () => {
    const guild = createMockGuild({ botHighestPos: 20 });
    const caller = createMockMember({ highestPos: 15 });
    const role = createMockRole({ position: 5 });

    const result = validateRoleManageable(guild, role, caller);
    expect(result.valid).toBe(true);
  });

  describe("validateRoleRevocable", () => {
    it("should allow revoking a role that contains sensitive permissions", () => {
      const guild = createMockGuild({ botHighestPos: 20 });
      const caller = createMockMember({ highestPos: 15 });
      const role = createMockRole({
        position: 5,
        permissions: [
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ModerateMembers,
        ],
      });

      const result = validateRoleRevocable(guild, role, caller);
      expect(result.valid).toBe(true);
    });

    it("should still fail revocation if role is higher than bot role", () => {
      const guild = createMockGuild({ botHighestPos: 10 });
      const role = createMockRole({ position: 15 });

      const result = validateRoleRevocable(guild, role);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(
        "higher than or equal to the bot's highest role",
      );
    });
  });

  describe("validatePanelRoleCapacity", () => {
    const samplePanel: RolePanel = {
      id: "p1",
      guildId: "g1",
      title: "Title",
      description: "Desc",
      type: "button",
      mode: "multi",
      roles: Array.from({ length: 25 }, (_, i) => ({
        roleId: `r-${i}`,
        label: `Role ${i}`,
      })),
      createdAt: 0,
      updatedAt: 0,
    };

    it("should reject adding a 26th button to a button panel", () => {
      const result = validatePanelRoleCapacity(samplePanel, 1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("maximum capacity of 25");
    });

    it("should approve adding roles when below capacity", () => {
      const panel = { ...samplePanel, roles: samplePanel.roles.slice(0, 20) };
      const result = validatePanelRoleCapacity(panel, 1);
      expect(result.valid).toBe(true);
    });
  });
});
