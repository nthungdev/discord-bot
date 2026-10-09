import type {
  ButtonInteraction,
  GuildMember,
  StringSelectMenuInteraction,
} from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { RoleService } from "../../services/roles";
import { RoleCapability } from "../role-capability";

describe("RoleCapability", () => {
  it("should dispatch button interaction with role_btn prefix", async () => {
    const mockRoleService = {
      handleButtonInteraction: vi.fn().mockResolvedValue(undefined),
      handleSelectInteraction: vi.fn(),
      handleGuildMemberAdd: vi.fn(),
    } as unknown as RoleService;

    const capability = new RoleCapability(mockRoleService);

    const buttonInteraction = {
      isButton: () => true,
      isStringSelectMenu: () => false,
      customId: "role_btn:notifications:role-123",
    } as unknown as ButtonInteraction;

    await capability.handleInteraction(buttonInteraction);

    expect(mockRoleService.handleButtonInteraction).toHaveBeenCalledWith(
      buttonInteraction,
      "notifications",
      "role-123",
    );
  });

  it("should ignore button interaction without role_btn prefix", async () => {
    const mockRoleService = {
      handleButtonInteraction: vi.fn(),
      handleSelectInteraction: vi.fn(),
      handleGuildMemberAdd: vi.fn(),
    } as unknown as RoleService;

    const capability = new RoleCapability(mockRoleService);

    const otherButton = {
      isButton: () => true,
      isStringSelectMenu: () => false,
      customId: "roast_btn:some-id",
    } as unknown as ButtonInteraction;

    await capability.handleInteraction(otherButton);

    expect(mockRoleService.handleButtonInteraction).not.toHaveBeenCalled();
  });

  it("should dispatch string select menu with role_select prefix", async () => {
    const mockRoleService = {
      handleButtonInteraction: vi.fn(),
      handleSelectInteraction: vi.fn().mockResolvedValue(undefined),
      handleGuildMemberAdd: vi.fn(),
    } as unknown as RoleService;

    const capability = new RoleCapability(mockRoleService);

    const selectInteraction = {
      isButton: () => false,
      isStringSelectMenu: () => true,
      customId: "role_select:notifications",
    } as unknown as StringSelectMenuInteraction;

    await capability.handleInteraction(selectInteraction);

    expect(mockRoleService.handleSelectInteraction).toHaveBeenCalledWith(
      selectInteraction,
      "notifications",
    );
  });

  it("should forward GuildMemberAdd events to roleService", async () => {
    const mockRoleService = {
      handleButtonInteraction: vi.fn(),
      handleSelectInteraction: vi.fn(),
      handleGuildMemberAdd: vi.fn().mockResolvedValue(undefined),
    } as unknown as RoleService;

    const capability = new RoleCapability(mockRoleService);
    const mockMember = { id: "member-1" } as unknown as GuildMember;

    await capability.handleGuildMemberAdd(mockMember);

    expect(mockRoleService.handleGuildMemberAdd).toHaveBeenCalledWith(
      mockMember,
    );
  });
});
