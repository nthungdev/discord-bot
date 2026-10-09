import type {
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  Role,
  TextChannel,
} from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setRoleStore } from "../../../../services/roles";
import type { IRoleStore, RolePanel } from "../../../../services/roles/types";
import { data, execute } from "../panel";

describe("/role-panel Slash Command", () => {
  let mockStore: IRoleStore;

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
    setRoleStore(mockStore);
  });

  it("should have correct command registration data", () => {
    expect(data.name).toBe("role-panel");
    expect(data.description).toBeDefined();
    expect(data.options.length).toBeGreaterThan(0);
  });

  it("should create a new panel", async () => {
    vi.mocked(mockStore.getPanel).mockResolvedValue(null);

    const mockInteraction = {
      guild: { id: "guild-1" } as Guild,
      member: { id: "caller-1" } as GuildMember,
      options: {
        getSubcommand: () => "create",
        getString: (name: string) => {
          if (name === "id") return "notifications";
          if (name === "title") return "Notification Preferences";
          if (name === "description") return "Select your notifications";
          return null;
        },
      },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await execute(mockInteraction);

    expect(mockStore.savePanel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "notifications",
        guildId: "guild-1",
        title: "Notification Preferences",
        type: "button",
        mode: "multi",
      }),
    );
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Created role panel"),
      }),
    );
  });

  it("should reject panel creation with invalid id containing colons or invalid chars", async () => {
    const mockInteraction = {
      guild: { id: "guild-1" } as Guild,
      member: { id: "caller-1" } as GuildMember,
      options: {
        getSubcommand: () => "create",
        getString: (name: string) => {
          if (name === "id") return "invalid:panel:id";
          if (name === "title") return "Invalid Panel";
          return null;
        },
      },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await execute(mockInteraction);

    expect(mockStore.savePanel).not.toHaveBeenCalled();
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining(
          "Panel ID must be 1-40 alphanumeric characters",
        ),
      }),
    );
  });

  it("should add a role to a panel", async () => {
    const existingPanel: RolePanel = {
      id: "notifications",
      guildId: "guild-1",
      title: "Title",
      description: "Desc",
      type: "button",
      mode: "multi",
      roles: [],
      createdAt: 0,
      updatedAt: 0,
    };
    vi.mocked(mockStore.getPanel).mockResolvedValue(existingPanel);

    const mockRole = {
      id: "role-1",
      name: "Announcements",
      position: 5,
      managed: false,
      permissions: { has: () => false },
    } as unknown as Role;

    const mockGuild = {
      id: "guild-1",
      ownerId: "owner-1",
      roles: {
        cache: new Map([["role-1", mockRole]]),
      },
      members: {
        me: {
          permissions: { has: () => true },
          roles: { highest: { position: 10, name: "Bot Role" } },
        },
      },
    } as unknown as Guild;

    const mockInteraction = {
      guild: mockGuild,
      member: {
        id: "caller-1",
        roles: { highest: { position: 8 } },
      } as GuildMember,
      options: {
        getSubcommand: () => "add-role",
        getString: (name: string) => (name === "id" ? "notifications" : null),
        getRole: () => mockRole,
      },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await execute(mockInteraction);

    expect(mockStore.savePanel).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: [
          expect.objectContaining({ roleId: "role-1", label: "Announcements" }),
        ],
      }),
    );
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Added role **@Announcements**"),
      }),
    );
  });

  it("should remove a role from a panel", async () => {
    const existingPanel: RolePanel = {
      id: "notifications",
      guildId: "guild-1",
      title: "Title",
      description: "Desc",
      type: "button",
      mode: "multi",
      roles: [{ roleId: "role-1", label: "Announcements" }],
      createdAt: 0,
      updatedAt: 0,
    };
    vi.mocked(mockStore.getPanel).mockResolvedValue(existingPanel);

    const mockRole = { id: "role-1", name: "Announcements" } as unknown as Role;
    const mockInteraction = {
      guild: { id: "guild-1" } as Guild,
      member: { id: "caller-1" } as GuildMember,
      options: {
        getSubcommand: () => "remove-role",
        getString: (name: string) => (name === "id" ? "notifications" : null),
        getRole: () => mockRole,
      },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await execute(mockInteraction);

    expect(existingPanel.roles.length).toBe(0);
    expect(mockStore.savePanel).toHaveBeenCalled();
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Removed role **@Announcements**"),
      }),
    );
  });

  it("should post a panel to a target text channel", async () => {
    const existingPanel: RolePanel = {
      id: "notifications",
      guildId: "guild-1",
      title: "Title",
      description: "Desc",
      type: "button",
      mode: "multi",
      roles: [{ roleId: "role-1", label: "Announcements" }],
      createdAt: 0,
      updatedAt: 0,
    };
    vi.mocked(mockStore.getPanel).mockResolvedValue(existingPanel);

    const mockChannel = {
      id: "channel-1",
      isTextBased: () => true,
      send: vi.fn().mockResolvedValue({ id: "msg-123" }),
    } as unknown as TextChannel;

    const mockGuild = {
      id: "guild-1",
      roles: { cache: new Map([["role-1", {}]]) },
    } as unknown as Guild;

    const mockInteraction = {
      guild: mockGuild,
      member: { id: "caller-1" } as GuildMember,
      options: {
        getSubcommand: () => "post",
        getString: (name: string) => (name === "id" ? "notifications" : null),
        getChannel: () => mockChannel,
      },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await execute(mockInteraction);

    expect(mockChannel.send).toHaveBeenCalled();
    expect(existingPanel.channelId).toBe("channel-1");
    expect(existingPanel.messageId).toBe("msg-123");
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Successfully published"),
      }),
    );
  });

  it("should update an existing posted panel in-place", async () => {
    const existingPanel: RolePanel = {
      id: "notifications",
      guildId: "guild-1",
      channelId: "channel-1",
      messageId: "msg-123",
      title: "Title",
      description: "Desc",
      type: "button",
      mode: "multi",
      roles: [{ roleId: "role-1", label: "Announcements" }],
      createdAt: 0,
      updatedAt: 0,
    };
    vi.mocked(mockStore.getPanel).mockResolvedValue(existingPanel);

    const mockMessage = {
      edit: vi.fn().mockResolvedValue(undefined),
    };
    const mockChannel = {
      id: "channel-1",
      isTextBased: () => true,
      messages: {
        fetch: vi.fn().mockResolvedValue(mockMessage),
      },
    } as unknown as TextChannel;

    const mockGuild = {
      id: "guild-1",
      roles: { cache: new Map([["role-1", {}]]) },
      channels: {
        fetch: vi.fn().mockResolvedValue(mockChannel),
      },
    } as unknown as Guild;

    const mockInteraction = {
      guild: mockGuild,
      member: { id: "caller-1" } as GuildMember,
      options: {
        getSubcommand: () => "update",
        getString: (name: string) => (name === "id" ? "notifications" : null),
      },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await execute(mockInteraction);

    expect(mockMessage.edit).toHaveBeenCalled();
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Successfully refreshed"),
      }),
    );
  });

  it("should cap listed panels at 25 embed fields and display footer note when exceeding limit", async () => {
    const panels: RolePanel[] = Array.from({ length: 30 }, (_, i) => ({
      id: `panel-${i + 1}`,
      guildId: "guild-1",
      title: `Panel ${i + 1}`,
      description: "Desc",
      type: "button",
      mode: "multi",
      roles: [],
      createdAt: 0,
      updatedAt: 0,
    }));
    vi.mocked(mockStore.getPanelsByGuild).mockResolvedValue(panels);

    const mockInteraction = {
      guild: { id: "guild-1" } as Guild,
      member: { id: "caller-1" } as GuildMember,
      options: {
        getSubcommand: () => "list",
      },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await execute(mockInteraction);

    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: expect.stringContaining("panel-1"),
                }),
              ]),
              footer: expect.objectContaining({
                text: "Showing first 25 of 30 panels.",
              }),
            }),
          }),
        ],
      }),
    );
  });

  it("should clean up published message on panel deletion with DB-first ordering", async () => {
    const existingPanel: RolePanel = {
      id: "notifications",
      guildId: "guild-1",
      channelId: "channel-1",
      messageId: "msg-123",
      title: "Title",
      description: "Desc",
      type: "button",
      mode: "multi",
      roles: [],
      createdAt: 0,
      updatedAt: 0,
    };
    vi.mocked(mockStore.getPanel).mockResolvedValue(existingPanel);

    const callOrder: string[] = [];
    vi.mocked(mockStore.deletePanel).mockImplementation(async () => {
      callOrder.push("store.deletePanel");
    });

    const mockMessage = {
      delete: vi.fn().mockImplementation(async () => {
        callOrder.push("message.delete");
      }),
    };
    const mockChannel = {
      id: "channel-1",
      isTextBased: () => true,
      messages: {
        fetch: vi.fn().mockResolvedValue(mockMessage),
      },
    } as unknown as TextChannel;

    const mockGuild = {
      id: "guild-1",
      channels: {
        fetch: vi.fn().mockResolvedValue(mockChannel),
      },
    } as unknown as Guild;

    const mockInteraction = {
      guild: mockGuild,
      member: { id: "caller-1" } as GuildMember,
      options: {
        getSubcommand: () => "delete",
        getString: (name: string) => (name === "id" ? "notifications" : null),
      },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await execute(mockInteraction);

    expect(mockInteraction.deferReply).toHaveBeenCalledWith({
      ephemeral: true,
    });
    expect(callOrder).toEqual(["store.deletePanel", "message.delete"]);
    expect(mockStore.deletePanel).toHaveBeenCalledWith(
      "guild-1",
      "notifications",
    );
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Deleted role panel"),
      }),
    );
  });

  it("should log warning and finish deletion when message cleanup fails", async () => {
    const existingPanel: RolePanel = {
      id: "notifications",
      guildId: "guild-1",
      channelId: "channel-1",
      messageId: "msg-123",
      title: "Title",
      description: "Desc",
      type: "button",
      mode: "multi",
      roles: [],
      createdAt: 0,
      updatedAt: 0,
    };
    vi.mocked(mockStore.getPanel).mockResolvedValue(existingPanel);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const mockChannel = {
      id: "channel-1",
      isTextBased: () => true,
      messages: {
        fetch: vi.fn().mockRejectedValue(new Error("Unknown Message")),
      },
    } as unknown as TextChannel;

    const mockGuild = {
      id: "guild-1",
      channels: {
        fetch: vi.fn().mockResolvedValue(mockChannel),
      },
    } as unknown as Guild;

    const mockInteraction = {
      guild: mockGuild,
      member: { id: "caller-1" } as GuildMember,
      options: {
        getSubcommand: () => "delete",
        getString: (name: string) => (name === "id" ? "notifications" : null),
      },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await execute(mockInteraction);

    expect(mockStore.deletePanel).toHaveBeenCalledWith(
      "guild-1",
      "notifications",
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("notifications"),
      expect.any(Error),
    );
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Deleted role panel"),
      }),
    );

    warnSpy.mockRestore();
  });
});
