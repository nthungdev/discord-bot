import path from "node:path";
import {
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  PermissionFlagsBits,
  type Role,
  type TextChannel,
} from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoleCapability } from "../../../src/capabilities/role-capability";
import { execute as executeOnboardingCmd } from "../../../src/discord/commands/roles/onboarding";
import { execute as executePanelCmd } from "../../../src/discord/commands/roles/panel";
import { execute as executeRoleCmd } from "../../../src/discord/commands/roles/role";
import {
  LocalFileRoleStore,
  RoleService,
  setRoleService,
  setRoleStore,
} from "../../../src/services/roles";

vi.mock("../../../src/utils/genAi", () => ({
  getGenAi: vi.fn().mockReturnValue({
    init: vi.fn(),
    generate: vi.fn().mockResolvedValue({
      content: "Welcome {user} to {server}! Try to behave, member #{count}!",
      data: null,
    }),
  }),
  generateChatMessageWithGenAi: vi.fn().mockResolvedValue({
    content: "Welcome {user} to {server}! Try to behave, member #{count}!",
    data: null,
  }),
}));

describe("E2E Simulation: Role Assignment & Onboarding Flow", () => {
  let testStore: LocalFileRoleStore;
  let roleService: RoleService;
  let roleCapability: RoleCapability;

  const testFilePath = path.resolve(
    process.cwd(),
    ".data",
    `e2e-test-roles-${Date.now()}.json`,
  );

  const mockAnnouncementRole = {
    id: "role-announcements",
    name: "Announcements",
    position: 4,
    managed: false,
    permissions: { has: () => false },
  } as unknown as Role;

  const mockEventsRole = {
    id: "role-events",
    name: "Events",
    position: 3,
    managed: false,
    permissions: { has: () => false },
  } as unknown as Role;

  const rolesMap = new Map<string, Role>([
    ["role-announcements", mockAnnouncementRole],
    ["role-events", mockEventsRole],
  ]);

  const mockChannel = {
    id: "channel-roles",
    isTextBased: () => true,
    send: vi.fn().mockResolvedValue({ id: "msg-panel-123" }),
  } as unknown as TextChannel;

  const mockGuild = {
    id: "guild-e2e",
    name: "Bluegon Land",
    memberCount: 42,
    ownerId: "owner-user",
    roles: {
      cache: rolesMap,
      fetch: vi
        .fn()
        .mockImplementation((id) => Promise.resolve(rolesMap.get(id) ?? null)),
    },
    members: {
      me: {
        permissions: {
          has: (p: bigint) => p === PermissionFlagsBits.ManageRoles,
        },
        roles: { highest: { position: 10, name: "Bot" } },
      },
    },
    channels: {
      fetch: vi.fn().mockResolvedValue(mockChannel),
    },
  } as unknown as Guild;

  const mockAdminCaller = {
    id: "admin-user",
    roles: { highest: { position: 9, name: "Admin" } },
  } as unknown as GuildMember;

  beforeEach(() => {
    testStore = new LocalFileRoleStore(testFilePath);
    setRoleStore(testStore);
    roleService = new RoleService(testStore);
    setRoleService(roleService);
    roleCapability = new RoleCapability(roleService);
  });

  it("should execute end-to-end panel creation, publishing, and member self-service role toggling", async () => {
    // Step 1: Admin runs /role-panel create id:notifications title:"Notification Hub" type:button mode:multi
    const createInteraction = {
      guild: mockGuild,
      member: mockAdminCaller,
      options: {
        getSubcommand: () => "create",
        getString: (name: string) => {
          if (name === "id") return "notifications";
          if (name === "title") return "Notification Hub";
          return null;
        },
      },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await executePanelCmd(createInteraction);
    expect(createInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining(
          "Created role panel **notifications**",
        ),
      }),
    );

    // Step 2: Admin adds roles via /role-panel add-role
    const addRole1Interaction = {
      guild: mockGuild,
      member: mockAdminCaller,
      options: {
        getSubcommand: () => "add-role",
        getString: (name: string) => (name === "id" ? "notifications" : null),
        getRole: () => mockAnnouncementRole,
      },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await executePanelCmd(addRole1Interaction);
    expect(addRole1Interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Added role **@Announcements**"),
      }),
    );

    const addRole2Interaction = {
      guild: mockGuild,
      member: mockAdminCaller,
      options: {
        getSubcommand: () => "add-role",
        getString: (name: string) => (name === "id" ? "notifications" : null),
        getRole: () => mockEventsRole,
      },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await executePanelCmd(addRole2Interaction);
    expect(addRole2Interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Added role **@Events**"),
      }),
    );

    // Step 3: Admin posts the panel into #channel-roles
    const postInteraction = {
      guild: mockGuild,
      member: mockAdminCaller,
      options: {
        getSubcommand: () => "post",
        getString: (name: string) => (name === "id" ? "notifications" : null),
        getChannel: () => mockChannel,
      },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await executePanelCmd(postInteraction);
    expect(mockChannel.send).toHaveBeenCalled();
    expect(postInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Successfully published"),
      }),
    );

    // Step 4: Member clicks role button to toggle on Announcements
    const memberRolesCache = new Map<string, Role>();
    const memberAddMock = vi.fn().mockImplementation((roleId: string) => {
      const roleItem = rolesMap.get(roleId);
      if (roleItem) {
        memberRolesCache.set(roleId, roleItem);
      }
      return Promise.resolve();
    });
    const memberRemoveMock = vi.fn().mockImplementation((roleId: string) => {
      memberRolesCache.delete(roleId);
      return Promise.resolve();
    });

    const mockMember = {
      id: "member-alex",
      user: { tag: "Alex#1234" },
      roles: {
        cache: memberRolesCache,
        add: memberAddMock,
        remove: memberRemoveMock,
      },
    } as unknown as GuildMember;

    const buttonInteraction1 = {
      isButton: () => true,
      isStringSelectMenu: () => false,
      customId: "role_btn:notifications:role-announcements",
      guild: mockGuild,
      user: { id: "member-alex" },
      member: mockMember,
      deferred: false,
      replied: false,
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ButtonInteraction;

    await roleCapability.handleInteraction(buttonInteraction1);
    expect(memberAddMock).toHaveBeenCalledWith("role-announcements");
    expect(buttonInteraction1.editReply).toHaveBeenCalledWith({
      content: "✅ Added the **@Announcements** role.",
    });

    // Step 5: Member clicks button again to toggle off Announcements
    const buttonInteraction2 = {
      isButton: () => true,
      isStringSelectMenu: () => false,
      customId: "role_btn:notifications:role-announcements",
      guild: mockGuild,
      user: { id: "member-alex" },
      member: mockMember,
      deferred: false,
      replied: false,
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ButtonInteraction;

    await roleCapability.handleInteraction(buttonInteraction2);
    expect(memberRemoveMock).toHaveBeenCalledWith("role-announcements");
    expect(buttonInteraction2.editReply).toHaveBeenCalledWith({
      content: "🗑️ Removed the **@Announcements** role.",
    });

    // Step 6: Direct staff utility (/role give and /role remove)
    const staffGiveInteraction = {
      guild: mockGuild,
      member: mockAdminCaller,
      options: {
        getSubcommand: () => "give",
        getUser: () => ({ id: "member-alex", tag: "Alex#1234" }),
        getRole: () => mockEventsRole,
      },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    (mockGuild.members as unknown as { fetch: typeof vi.fn }).fetch = vi
      .fn()
      .mockResolvedValue(mockMember);

    await executeRoleCmd(staffGiveInteraction);
    expect(memberAddMock).toHaveBeenCalledWith("role-events");
    expect(staffGiveInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Granted **@Events**"),
      }),
    );

    // Step 7: New member joins and triggers onboarding
    const onboardingInteraction = {
      guild: mockGuild,
      options: {
        getSubcommand: () => "set",
        getChannel: () => mockChannel,
        getBoolean: () => true,
        getString: () => null,
      },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await executeOnboardingCmd(onboardingInteraction);

    const newJoinedMember = {
      id: "newbie-sam",
      displayName: "Sam",
      user: { username: "newbie_sam" },
      guild: mockGuild,
    } as unknown as GuildMember;

    await roleCapability.handleGuildMemberAdd(newJoinedMember);
    expect(mockChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("<@newbie-sam>"),
        allowedMentions: { users: ["newbie-sam"], parse: [] },
      }),
    );
  });
});
