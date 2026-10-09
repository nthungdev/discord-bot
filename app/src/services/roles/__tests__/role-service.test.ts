import {
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  PermissionFlagsBits,
  type Role,
  type StringSelectMenuInteraction,
} from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoleService } from "../role-service";
import type { IRoleStore, OnboardingConfig, RolePanel } from "../types";

describe("RoleService", () => {
  let mockStore: IRoleStore;
  let roleService: RoleService;

  const samplePanel: RolePanel = {
    id: "notifications",
    guildId: "guild-1",
    title: "Notification Roles",
    description: "Pick notifications",
    type: "button",
    mode: "multi",
    roles: [
      { roleId: "role-1", label: "Announcements" },
      { roleId: "role-2", label: "Events" },
    ],
    createdAt: 0,
    updatedAt: 0,
  };

  const sampleRadioPanel: RolePanel = {
    id: "colors",
    guildId: "guild-1",
    title: "Color Roles",
    description: "Pick one color",
    type: "dropdown",
    mode: "single",
    roles: [
      { roleId: "role-red", label: "Red" },
      { roleId: "role-blue", label: "Blue" },
    ],
    createdAt: 0,
    updatedAt: 0,
  };

  beforeEach(() => {
    mockStore = {
      getPanel: vi.fn(),
      getPanelsByGuild: vi.fn(),
      savePanel: vi.fn(),
      deletePanel: vi.fn(),
      getOnboardingConfig: vi.fn(),
      saveOnboardingConfig: vi.fn(),
      clear: vi.fn(),
    };
    roleService = new RoleService(mockStore);
  });

  const createMockRole = (id: string, name: string, pos = 5): Role => {
    return {
      id,
      name,
      position: pos,
      managed: false,
      permissions: {
        has: () => false,
      },
    } as unknown as Role;
  };

  const createMockGuild = (rolesMap = new Map<string, Role>()): Guild => {
    return {
      id: "guild-1",
      ownerId: "owner-user",
      roles: {
        cache: rolesMap,
        fetch: vi
          .fn()
          .mockImplementation((id) =>
            Promise.resolve(rolesMap.get(id) ?? null),
          ),
      },
      members: {
        me: {
          permissions: {
            has: (flag: bigint) => flag === PermissionFlagsBits.ManageRoles,
          },
          roles: {
            highest: { position: 50, name: "Bot Role" },
          },
        },
        fetch: vi.fn(),
      },
      channels: {
        fetch: vi.fn(),
      },
    } as unknown as Guild;
  };

  describe("handleButtonInteraction", () => {
    it("should toggle on a role when member does not have it in multi mode", async () => {
      const role1 = createMockRole("role-1", "Announcements");
      const rolesMap = new Map([["role-1", role1]]);
      const mockGuild = createMockGuild(rolesMap);

      const mockMemberRoles = {
        cache: new Map(),
        add: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      };

      const mockMember = {
        id: "user-1",
        roles: mockMemberRoles,
      } as unknown as GuildMember;

      const mockInteraction = {
        guild: mockGuild,
        user: { id: "user-1" },
        member: mockMember,
        deferred: false,
        replied: false,
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
      } as unknown as ButtonInteraction;

      vi.mocked(mockStore.getPanel).mockResolvedValue(samplePanel);

      await roleService.handleButtonInteraction(
        mockInteraction,
        "notifications",
        "role-1",
      );

      expect(mockMemberRoles.add).toHaveBeenCalledWith("role-1");
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: "✅ Added the **@Announcements** role.",
      });
    });

    it("should toggle off a role when member already has it in multi mode", async () => {
      const role1 = createMockRole("role-1", "Announcements");
      const rolesMap = new Map([["role-1", role1]]);
      const mockGuild = createMockGuild(rolesMap);

      const mockMemberRoles = {
        cache: new Map([["role-1", role1]]),
        add: vi.fn(),
        remove: vi.fn().mockResolvedValue(undefined),
      };

      const mockMember = {
        id: "user-1",
        roles: mockMemberRoles,
      } as unknown as GuildMember;

      const mockInteraction = {
        guild: mockGuild,
        user: { id: "user-1" },
        member: mockMember,
        deferred: true,
        replied: false,
        editReply: vi.fn().mockResolvedValue(undefined),
      } as unknown as ButtonInteraction;

      vi.mocked(mockStore.getPanel).mockResolvedValue(samplePanel);

      await roleService.handleButtonInteraction(
        mockInteraction,
        "notifications",
        "role-1",
      );

      expect(mockMemberRoles.remove).toHaveBeenCalledWith("role-1");
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: "🗑️ Removed the **@Announcements** role.",
      });
    });

    it("should remove other panel roles and assign chosen role in single mode", async () => {
      const roleRed = createMockRole("role-red", "Red");
      const roleBlue = createMockRole("role-blue", "Blue");
      const rolesMap = new Map([
        ["role-red", roleRed],
        ["role-blue", roleBlue],
      ]);
      const mockGuild = createMockGuild(rolesMap);

      const mockMemberRoles = {
        cache: new Map([["role-red", roleRed]]), // currently has Red
        add: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      };

      const mockMember = {
        id: "user-1",
        roles: mockMemberRoles,
      } as unknown as GuildMember;

      const mockInteraction = {
        guild: mockGuild,
        user: { id: "user-1" },
        member: mockMember,
        deferred: true,
        replied: false,
        editReply: vi.fn().mockResolvedValue(undefined),
      } as unknown as ButtonInteraction;

      vi.mocked(mockStore.getPanel).mockResolvedValue(sampleRadioPanel);

      await roleService.handleButtonInteraction(
        mockInteraction,
        "colors",
        "role-blue",
      );

      expect(mockMemberRoles.remove).toHaveBeenCalledWith(["role-red"]);
      expect(mockMemberRoles.add).toHaveBeenCalledWith("role-blue");
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: "✅ Set role to **@Blue**.",
      });
    });
  });

  describe("handleSelectInteraction", () => {
    it("should batch add selected and remove unselected roles", async () => {
      const role1 = createMockRole("role-1", "Announcements");
      const role2 = createMockRole("role-2", "Events");
      const rolesMap = new Map([
        ["role-1", role1],
        ["role-2", role2],
      ]);
      const mockGuild = createMockGuild(rolesMap);

      const mockMemberRoles = {
        cache: new Map([["role-1", role1]]), // currently has role-1
        add: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      };

      const mockMember = {
        id: "user-1",
        roles: mockMemberRoles,
      } as unknown as GuildMember;

      const mockInteraction = {
        guild: mockGuild,
        user: { id: "user-1" },
        member: mockMember,
        deferred: false,
        replied: false,
        values: ["role-2"], // selected only role-2
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
      } as unknown as StringSelectMenuInteraction;

      vi.mocked(mockStore.getPanel).mockResolvedValue(samplePanel);

      await roleService.handleSelectInteraction(
        mockInteraction,
        "notifications",
      );

      expect(mockMemberRoles.remove).toHaveBeenCalledWith(["role-1"]);
      expect(mockMemberRoles.add).toHaveBeenCalledWith(["role-2"]);
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: expect.stringContaining("✅ Updated roles:"),
      });
    });
  });

  describe("giveRole and removeRole", () => {
    it("should grant role when manageable and member does not hold it", async () => {
      const role = createMockRole("role-1", "VIP", 5);
      const rolesMap = new Map([["role-1", role]]);
      const mockGuild = createMockGuild(rolesMap);

      const mockCaller = {
        id: "mod-1",
        roles: { highest: { position: 20 } },
      } as unknown as GuildMember;

      const mockTargetRoles = {
        cache: new Map(),
        add: vi.fn().mockResolvedValue(undefined),
      };

      const mockTarget = {
        id: "target-1",
        user: { tag: "TargetUser#1234" },
        roles: mockTargetRoles,
      } as unknown as GuildMember;

      const result = await roleService.giveRole(
        mockGuild,
        mockCaller,
        mockTarget,
        role,
      );

      expect(result.success).toBe(true);
      expect(mockTargetRoles.add).toHaveBeenCalledWith("role-1");
      expect(result.message).toContain("Granted **@VIP**");
    });

    it("should revoke role when member holds it", async () => {
      const role = createMockRole("role-1", "VIP", 5);
      const rolesMap = new Map([["role-1", role]]);
      const mockGuild = createMockGuild(rolesMap);

      const mockCaller = {
        id: "mod-1",
        roles: { highest: { position: 20 } },
      } as unknown as GuildMember;

      const mockTargetRoles = {
        cache: new Map([["role-1", role]]),
        remove: vi.fn().mockResolvedValue(undefined),
      };

      const mockTarget = {
        id: "target-1",
        user: { tag: "TargetUser#1234" },
        roles: mockTargetRoles,
      } as unknown as GuildMember;

      const result = await roleService.removeRole(
        mockGuild,
        mockCaller,
        mockTarget,
        role,
      );

      expect(result.success).toBe(true);
      expect(mockTargetRoles.remove).toHaveBeenCalledWith("role-1");
      expect(result.message).toContain("Revoked **@VIP**");
    });
  });

  describe("handleGuildMemberAdd", () => {
    it("should do nothing when onboarding is disabled", async () => {
      vi.mocked(mockStore.getOnboardingConfig).mockResolvedValue(null);

      const mockMember = {
        id: "user-new",
        guild: { id: "guild-1" },
      } as unknown as GuildMember;

      await roleService.handleGuildMemberAdd(mockMember);
      expect(mockStore.getPanel).not.toHaveBeenCalled();
    });

    it("should post witty welcome greeting when onboarding is enabled", async () => {
      const onboardingConfig: OnboardingConfig = {
        guildId: "guild-1",
        enabled: true,
        channelId: "chan-welcome",
        welcomeMessage: "Welcome {user}!",
        updatedAt: 0,
      };
      vi.mocked(mockStore.getOnboardingConfig).mockResolvedValue(
        onboardingConfig,
      );

      const mockChannelSend = vi.fn().mockResolvedValue(undefined);
      const mockChannel = {
        isTextBased: () => true,
        send: mockChannelSend,
      };

      const mockMember = {
        id: "user-new",
        guild: {
          id: "guild-1",
          name: "Bluegon Land",
          memberCount: 50,
          roles: { cache: new Map() },
          channels: {
            fetch: vi.fn().mockResolvedValue(mockChannel),
          },
        },
      } as unknown as GuildMember;

      await roleService.handleGuildMemberAdd(mockMember);

      expect(mockStore.getPanel).not.toHaveBeenCalled();
      expect(mockChannelSend).toHaveBeenCalledWith({
        content: "Welcome <@user-new>!",
      });
    });
  });
});
