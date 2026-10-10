import {
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type MessageReaction,
  PermissionFlagsBits,
  type Role,
  type StringSelectMenuInteraction,
  type User,
} from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isEmojiMatching, RoleService } from "../role-service";
import type { IRoleStore, OnboardingConfig, RolePanel } from "../types";

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
      getPanelByMessageId: vi.fn(),
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
        fetch: vi.fn().mockResolvedValue(null),
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

    it("should force fetch fresh member state from Discord API when handling interactions", async () => {
      const role1 = createMockRole("role-1", "Announcements");
      const rolesMap = new Map([["role-1", role1]]);
      const mockGuild = createMockGuild(rolesMap);

      const freshMemberRoles = {
        cache: new Map(),
        add: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      };
      const freshMember = {
        id: "user-1",
        roles: freshMemberRoles,
      } as unknown as GuildMember;

      vi.mocked(mockGuild.members.fetch).mockImplementation(
        async () => freshMember as never,
      );

      const staleMember = {
        id: "user-1",
        roles: {
          cache: new Map([["role-1", role1]]),
          add: vi.fn(),
          remove: vi.fn(),
        },
      } as unknown as GuildMember;

      const mockInteraction = {
        guild: mockGuild,
        user: { id: "user-1" },
        member: staleMember,
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

      expect(mockGuild.members.fetch).toHaveBeenCalledWith({
        user: "user-1",
        force: true,
      });
      expect(freshMemberRoles.add).toHaveBeenCalledWith("role-1");
    });

    it("should serialize concurrent button clicks in single mode", async () => {
      const roleRed = createMockRole("role-red", "Red");
      const roleBlue = createMockRole("role-blue", "Blue");
      const rolesMap = new Map([
        ["role-red", roleRed],
        ["role-blue", roleBlue],
      ]);

      const memberRoleCache = new Map<string, Role>();
      const mockMemberRoles = {
        cache: memberRoleCache,
        add: vi.fn().mockImplementation((id: string) => {
          const r = rolesMap.get(id);
          if (r) memberRoleCache.set(id, r);
          return Promise.resolve();
        }),
        remove: vi.fn().mockImplementation((ids: string[]) => {
          for (const id of ids) memberRoleCache.delete(id);
          return Promise.resolve();
        }),
      };

      const mockMember = {
        id: "user-1",
        roles: mockMemberRoles,
      } as unknown as GuildMember;

      const mockGuild = {
        ...createMockGuild(rolesMap),
        members: {
          ...createMockGuild(rolesMap).members,
          fetch: vi.fn().mockResolvedValue(mockMember),
        },
      } as unknown as Guild;

      const createInteraction = () =>
        ({
          guild: mockGuild,
          user: { id: "user-1" },
          member: mockMember,
          deferred: true,
          replied: false,
          editReply: vi.fn().mockResolvedValue(undefined),
        }) as unknown as ButtonInteraction;

      vi.mocked(mockStore.getPanel).mockResolvedValue(sampleRadioPanel);

      await Promise.all([
        roleService.handleButtonInteraction(
          createInteraction(),
          "colors",
          "role-red",
        ),
        roleService.handleButtonInteraction(
          createInteraction(),
          "colors",
          "role-blue",
        ),
      ]);

      expect(memberRoleCache.has("role-blue")).toBe(true);
      expect(memberRoleCache.has("role-red")).toBe(false);
    });
  });

  describe("handleSelectInteraction", () => {
    it("should toggle selected roles in multi mode without removing unselected roles", async () => {
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

      // In multi-mode: role-1 is unselected so it is NOT removed!
      expect(mockMemberRoles.remove).not.toHaveBeenCalled();
      // role-2 is selected and member did not have it, so it is added!
      expect(mockMemberRoles.add).toHaveBeenCalledWith(["role-2"]);
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: expect.stringContaining("✅ Updated roles:"),
      });
    });

    it("should toggle off an already-held role in multi mode", async () => {
      const role1 = createMockRole("role-1", "Announcements");
      const rolesMap = new Map([["role-1", role1]]);
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
        deferred: true,
        replied: false,
        values: ["role-1"], // selected role-1 which they already have
        editReply: vi.fn().mockResolvedValue(undefined),
      } as unknown as StringSelectMenuInteraction;

      vi.mocked(mockStore.getPanel).mockResolvedValue(samplePanel);

      await roleService.handleSelectInteraction(
        mockInteraction,
        "notifications",
      );

      expect(mockMemberRoles.remove).toHaveBeenCalledWith(["role-1"]);
      expect(mockMemberRoles.add).not.toHaveBeenCalled();
    });

    it("should replace previous panel role in single mode dropdown", async () => {
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
        values: ["role-blue"], // selects Blue
        editReply: vi.fn().mockResolvedValue(undefined),
      } as unknown as StringSelectMenuInteraction;

      vi.mocked(mockStore.getPanel).mockResolvedValue(sampleRadioPanel);

      await roleService.handleSelectInteraction(mockInteraction, "colors");

      expect(mockMemberRoles.remove).toHaveBeenCalledWith(["role-red"]);
      expect(mockMemberRoles.add).toHaveBeenCalledWith(["role-blue"]);
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

    it("should revoke an already-assigned role even if it has sensitive moderation permissions", async () => {
      const role = {
        ...createMockRole("role-mod", "Moderator", 5),
        permissions: {
          has: (perm: bigint) => perm === PermissionFlagsBits.ManageChannels,
        },
      } as unknown as Role;
      const rolesMap = new Map([["role-mod", role]]);
      const mockGuild = createMockGuild(rolesMap);

      const mockCaller = {
        id: "mod-1",
        roles: { highest: { position: 20 } },
      } as unknown as GuildMember;

      const mockTargetRoles = {
        cache: new Map([["role-mod", role]]),
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
      expect(mockTargetRoles.remove).toHaveBeenCalledWith("role-mod");
      expect(result.message).toContain("Revoked **@Moderator**");
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
        displayName: "Newbie",
        user: { username: "newbie_sam" },
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
        content: expect.stringContaining("<@user-new>"),
        allowedMentions: { users: ["user-new"], parse: [] },
      });
    });

    it("should pass localeOverride when onboarding is enabled", async () => {
      const onboardingConfig: OnboardingConfig = {
        guildId: "guild-1",
        enabled: true,
        channelId: "chan-welcome",
        localeOverride: "en-US",
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
        displayName: "Newbie",
        user: { username: "newbie_sam" },
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

      expect(mockChannelSend).toHaveBeenCalledWith({
        content: expect.stringContaining("<@user-new>"),
        allowedMentions: { users: ["user-new"], parse: [] },
      });
    });
  });

  describe("isEmojiMatching", () => {
    it("should match standard unicode emoji", () => {
      expect(isEmojiMatching("🎮", { name: "🎮", id: null })).toBe(true);
      expect(isEmojiMatching("🎮", { name: "🎉", id: null })).toBe(false);
    });

    it("should match custom emoji format <:name:id> strictly by custom ID", () => {
      expect(
        isEmojiMatching("<:blob_cool:123456789>", {
          name: "blob_cool",
          id: "123456789",
        }),
      ).toBe(true);
      expect(
        isEmojiMatching("<:blob_cool:123456789>", {
          name: "other_name",
          id: "123456789",
        }),
      ).toBe(true);
      expect(
        isEmojiMatching("<:blob_cool:123456789>", {
          name: "blob_cool",
          id: "999999999",
        }),
      ).toBe(false);
      expect(
        isEmojiMatching("<:blob_cool:123456789>", {
          name: "unrelated",
          id: "999999999",
        }),
      ).toBe(false);
    });

    it("should match animated emoji format <a:name:id>", () => {
      expect(
        isEmojiMatching("<a:party_parrot:88888888>", {
          name: "party_parrot",
          id: "88888888",
        }),
      ).toBe(true);
      expect(
        isEmojiMatching("<a:party_parrot:88888888>", {
          name: "not_parrot",
          id: "11111111",
        }),
      ).toBe(false);
    });

    it("should match snowflake ID directly", () => {
      expect(
        isEmojiMatching("123456789012345678", {
          name: "custom_emoji",
          id: "123456789012345678",
        }),
      ).toBe(true);
      expect(
        isEmojiMatching("123456789012345678", {
          name: "custom_emoji",
          id: "999999999999999999",
        }),
      ).toBe(false);
    });
  });

  describe("handleReactionAdd", () => {
    const sampleEmojiPanel: RolePanel = {
      id: "emoji-panel",
      guildId: "guild-1",
      title: "Emoji Panel",
      description: "Desc",
      type: "emoji",
      mode: "multi",
      messageId: "msg-panel-1",
      channelId: "chan-1",
      roles: [
        { roleId: "role-red", label: "Red", emoji: "🔴" },
        { roleId: "role-blue", label: "Blue", emoji: "🔵" },
      ],
      createdAt: 0,
      updatedAt: 0,
    };

    it("should ignore bot reactions", async () => {
      const mockReaction = {
        message: { id: "msg-panel-1", guildId: "guild-1" },
      } as unknown as MessageReaction;
      const mockUser = { id: "bot-1", bot: true } as unknown as User;

      await roleService.handleReactionAdd(mockReaction, mockUser);
      expect(mockStore.getPanelByMessageId).not.toHaveBeenCalled();
    });

    it("should fetch partial reaction and partial message", async () => {
      const mockReactionFetch = vi.fn().mockResolvedValue(undefined);
      const mockMessageFetch = vi.fn().mockResolvedValue(undefined);
      const mockReaction = {
        partial: true,
        fetch: mockReactionFetch,
        emoji: { name: "🔴", id: null },
        message: {
          partial: true,
          fetch: mockMessageFetch,
          id: "msg-panel-1",
          guildId: "guild-1",
          guild: createMockGuild(),
        },
      } as unknown as MessageReaction;
      const mockUser = { id: "user-1", bot: false } as unknown as User;

      vi.mocked(mockStore.getPanelByMessageId).mockResolvedValue(
        sampleEmojiPanel,
      );

      await roleService.handleReactionAdd(mockReaction, mockUser);
      expect(mockReactionFetch).toHaveBeenCalled();
      expect(mockMessageFetch).toHaveBeenCalled();
    });

    it("should ignore reactions if panel is not found", async () => {
      const mockReaction = {
        emoji: { name: "🔴", id: null },
        message: {
          id: "msg-unknown",
          guildId: "guild-1",
          guild: createMockGuild(),
        },
      } as unknown as MessageReaction;
      const mockUser = { id: "user-1", bot: false } as unknown as User;

      vi.mocked(mockStore.getPanelByMessageId).mockResolvedValue(null);

      await roleService.handleReactionAdd(mockReaction, mockUser);
      expect(mockStore.getPanelByMessageId).toHaveBeenCalledWith(
        "guild-1",
        "msg-unknown",
      );
    });

    it("should ignore reactions if panel type is not emoji", async () => {
      const mockReaction = {
        emoji: { name: "🔴", id: null },
        message: {
          id: "msg-btn",
          guildId: "guild-1",
          guild: createMockGuild(),
        },
      } as unknown as MessageReaction;
      const mockUser = { id: "user-1", bot: false } as unknown as User;

      vi.mocked(mockStore.getPanelByMessageId).mockResolvedValue({
        ...sampleEmojiPanel,
        type: "button",
      });

      await roleService.handleReactionAdd(mockReaction, mockUser);
    });

    it("should silently remove unauthorized/unconfigured emoji reactions", async () => {
      const mockRemoveReaction = vi.fn().mockResolvedValue(undefined);
      const mockReaction = {
        emoji: { name: "💩", id: null },
        message: {
          id: "msg-panel-1",
          guildId: "guild-1",
          guild: createMockGuild(),
        },
        users: {
          remove: mockRemoveReaction,
        },
      } as unknown as MessageReaction;
      const mockUser = { id: "user-naughty", bot: false } as unknown as User;

      vi.mocked(mockStore.getPanelByMessageId).mockResolvedValue(
        sampleEmojiPanel,
      );

      await roleService.handleReactionAdd(mockReaction, mockUser);
      expect(mockRemoveReaction).toHaveBeenCalledWith("user-naughty");
    });

    it("should assign role silently when user reacts with configured emoji in multi mode", async () => {
      const roleRed = createMockRole("role-red", "Red");
      const rolesMap = new Map([["role-red", roleRed]]);
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

      mockGuild.members.fetch = vi.fn().mockResolvedValue(mockMember);

      const mockReaction = {
        emoji: { name: "🔴", id: null },
        message: {
          id: "msg-panel-1",
          guildId: "guild-1",
          guild: mockGuild,
        },
        users: {
          remove: vi.fn(),
        },
      } as unknown as MessageReaction;
      const mockUser = { id: "user-1", bot: false } as unknown as User;

      vi.mocked(mockStore.getPanelByMessageId).mockResolvedValue(
        sampleEmojiPanel,
      );

      await roleService.handleReactionAdd(mockReaction, mockUser);
      expect(mockMemberRoles.add).toHaveBeenCalledWith("role-red");
    });

    it("should remove other panel roles, clear stale reactions, and assign new role in single mode", async () => {
      const roleRed = createMockRole("role-red", "Red");
      const roleBlue = createMockRole("role-blue", "Blue");
      const rolesMap = new Map([
        ["role-red", roleRed],
        ["role-blue", roleBlue],
      ]);
      const mockGuild = createMockGuild(rolesMap);

      const mockMemberRoles = {
        cache: new Map([["role-blue", roleBlue]]),
        add: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      };

      const mockMember = {
        id: "user-1",
        roles: mockMemberRoles,
      } as unknown as GuildMember;

      mockGuild.members.fetch = vi.fn().mockResolvedValue(mockMember);

      const mockBlueReactionUserRemove = vi.fn().mockResolvedValue(undefined);
      const mockBlueReaction = {
        emoji: { name: "🔵", id: null },
        users: { remove: mockBlueReactionUserRemove },
      };

      const mockReaction = {
        emoji: { name: "🔴", id: null },
        message: {
          id: "msg-panel-1",
          guildId: "guild-1",
          guild: mockGuild,
          reactions: {
            cache: new Map([["🔵", mockBlueReaction]]),
          },
        },
        users: {
          remove: vi.fn(),
        },
      } as unknown as MessageReaction;
      const mockUser = { id: "user-1", bot: false } as unknown as User;

      vi.mocked(mockStore.getPanelByMessageId).mockResolvedValue({
        ...sampleEmojiPanel,
        mode: "single",
      });

      await roleService.handleReactionAdd(mockReaction, mockUser);
      expect(mockMemberRoles.remove).toHaveBeenCalledWith(["role-blue"]);
      expect(mockMemberRoles.add).toHaveBeenCalledWith("role-red");
      expect(mockBlueReactionUserRemove).toHaveBeenCalledWith("user-1");
    });

    it("should return early for unknown message without fetching partial reaction", async () => {
      const mockReactionFetch = vi.fn();
      const mockReaction = {
        partial: true,
        fetch: mockReactionFetch,
        emoji: { name: "🔴", id: null },
        message: {
          id: "msg-unknown",
          guildId: "guild-1",
        },
      } as unknown as MessageReaction;
      const mockUser = { id: "user-1", bot: false } as unknown as User;

      vi.mocked(mockStore.getPanelByMessageId).mockResolvedValue(null);

      await roleService.handleReactionAdd(mockReaction, mockUser);
      expect(mockReactionFetch).not.toHaveBeenCalled();
    });

    it("should not re-add role if member already has it", async () => {
      const roleRed = createMockRole("role-red", "Red");
      const rolesMap = new Map([["role-red", roleRed]]);
      const mockGuild = createMockGuild(rolesMap);

      const mockMemberRoles = {
        cache: new Map([["role-red", roleRed]]),
        add: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      };

      const mockMember = {
        id: "user-1",
        roles: mockMemberRoles,
      } as unknown as GuildMember;

      mockGuild.members.fetch = vi.fn().mockResolvedValue(mockMember);

      const mockReaction = {
        emoji: { name: "🔴", id: null },
        message: {
          id: "msg-panel-1",
          guildId: "guild-1",
          guild: mockGuild,
        },
      } as unknown as MessageReaction;
      const mockUser = { id: "user-1", bot: false } as unknown as User;

      vi.mocked(mockStore.getPanelByMessageId).mockResolvedValue(
        sampleEmojiPanel,
      );

      await roleService.handleReactionAdd(mockReaction, mockUser);
      expect(mockMemberRoles.add).not.toHaveBeenCalled();
    });
  });

  describe("handleReactionRemove", () => {
    const sampleEmojiPanel: RolePanel = {
      id: "emoji-panel",
      guildId: "guild-1",
      title: "Emoji Panel",
      description: "Desc",
      type: "emoji",
      mode: "multi",
      messageId: "msg-panel-1",
      channelId: "chan-1",
      roles: [{ roleId: "role-red", label: "Red", emoji: "🔴" }],
      createdAt: 0,
      updatedAt: 0,
    };

    it("should ignore bot reaction remove", async () => {
      const mockReaction = {
        message: { id: "msg-panel-1", guildId: "guild-1" },
      } as unknown as MessageReaction;
      const mockUser = { id: "bot-1", bot: true } as unknown as User;

      await roleService.handleReactionRemove(mockReaction, mockUser);
      expect(mockStore.getPanelByMessageId).not.toHaveBeenCalled();
    });

    it("should revoke role silently when user removes reaction", async () => {
      const roleRed = createMockRole("role-red", "Red");
      const rolesMap = new Map([["role-red", roleRed]]);
      const mockGuild = createMockGuild(rolesMap);

      const mockMemberRoles = {
        cache: new Map([["role-red", roleRed]]),
        add: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      };

      const mockMember = {
        id: "user-1",
        roles: mockMemberRoles,
      } as unknown as GuildMember;

      mockGuild.members.fetch = vi.fn().mockResolvedValue(mockMember);

      const mockReaction = {
        emoji: { name: "🔴", id: null },
        message: {
          id: "msg-panel-1",
          guildId: "guild-1",
          guild: mockGuild,
        },
      } as unknown as MessageReaction;
      const mockUser = { id: "user-1", bot: false } as unknown as User;

      vi.mocked(mockStore.getPanelByMessageId).mockResolvedValue(
        sampleEmojiPanel,
      );

      await roleService.handleReactionRemove(mockReaction, mockUser);
      expect(mockMemberRoles.remove).toHaveBeenCalledWith("role-red");
    });

    it("should ignore reaction remove if emoji is not in panel", async () => {
      const mockGuild = createMockGuild();
      mockGuild.members.fetch = vi.fn();
      const mockReaction = {
        emoji: { name: "❓", id: null },
        message: {
          id: "msg-panel-1",
          guildId: "guild-1",
          guild: mockGuild,
        },
      } as unknown as MessageReaction;
      const mockUser = { id: "user-1", bot: false } as unknown as User;

      vi.mocked(mockStore.getPanelByMessageId).mockResolvedValue(
        sampleEmojiPanel,
      );

      await roleService.handleReactionRemove(mockReaction, mockUser);
      expect(mockGuild.members.fetch).not.toHaveBeenCalled();
    });
  });
});
