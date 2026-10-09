import type {
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  Role,
  User,
} from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { setRoleService } from "../../../../services/roles";
import type { RoleService } from "../../../../services/roles/role-service";
import { data, execute } from "../role";

describe("/role Slash Command", () => {
  it("should have correct command registration data", () => {
    expect(data.name).toBe("role");
    expect(data.description).toBeDefined();
    expect(data.options.length).toBe(2); // give and remove
  });

  it("should execute give subcommand", async () => {
    const mockRoleService = {
      giveRole: vi.fn().mockResolvedValue({
        success: true,
        message: "✅ Granted role",
      }),
      removeRole: vi.fn(),
    } as unknown as RoleService;
    setRoleService(mockRoleService);

    const mockTargetUser = { id: "user-target" } as User;
    const mockRole = { id: "role-1", name: "VIP" } as Role;
    const mockTargetMember = { id: "user-target" } as GuildMember;

    const mockGuild = {
      id: "guild-1",
      roles: { cache: new Map([["role-1", mockRole]]) },
      members: {
        fetch: vi.fn().mockResolvedValue(mockTargetMember),
      },
    } as unknown as Guild;

    const mockInteraction = {
      guild: mockGuild,
      member: { id: "caller-1" } as GuildMember,
      options: {
        getSubcommand: () => "give",
        getUser: () => mockTargetUser,
        getRole: () => mockRole,
      },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await execute(mockInteraction);

    expect(mockRoleService.giveRole).toHaveBeenCalledWith(
      mockGuild,
      expect.anything(),
      mockTargetMember,
      mockRole,
    );
    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: "✅ Granted role",
      ephemeral: true,
    });
  });

  it("should execute remove subcommand", async () => {
    const mockRoleService = {
      giveRole: vi.fn(),
      removeRole: vi.fn().mockResolvedValue({
        success: true,
        message: "🗑️ Revoked role",
      }),
    } as unknown as RoleService;
    setRoleService(mockRoleService);

    const mockTargetUser = { id: "user-target" } as User;
    const mockRole = { id: "role-1", name: "VIP" } as Role;
    const mockTargetMember = { id: "user-target" } as GuildMember;

    const mockGuild = {
      id: "guild-1",
      roles: { cache: new Map([["role-1", mockRole]]) },
      members: {
        fetch: vi.fn().mockResolvedValue(mockTargetMember),
      },
    } as unknown as Guild;

    const mockInteraction = {
      guild: mockGuild,
      member: { id: "caller-1" } as GuildMember,
      options: {
        getSubcommand: () => "remove",
        getUser: () => mockTargetUser,
        getRole: () => mockRole,
      },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await execute(mockInteraction);

    expect(mockRoleService.removeRole).toHaveBeenCalledWith(
      mockGuild,
      expect.anything(),
      mockTargetMember,
      mockRole,
    );
    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: "🗑️ Revoked role",
      ephemeral: true,
    });
  });
});
