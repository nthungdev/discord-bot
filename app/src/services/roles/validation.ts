import {
  type Guild,
  type GuildMember,
  PermissionFlagsBits,
  type Role,
} from "discord.js";
import { MAX_DROPDOWN_OPTIONS, MAX_TOTAL_BUTTONS } from "./constants";
import type { RolePanel } from "./types";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates whether a Discord role can be assigned, removed, or added to a self-service panel.
 * Enforces bot permissions, role hierarchy boundaries, caller privilege levels, and sensitive permissions.
 */
export function validateRoleManageable(
  guild: Guild,
  role: Role,
  callerMember?: GuildMember,
): ValidationResult {
  const botMember = guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return {
      valid: false,
      error: "Bot lacks the 'Manage Roles' permission in this server.",
    };
  }

  // 1. Role hierarchy check against bot
  if (role.position >= botMember.roles.highest.position) {
    return {
      valid: false,
      error: `Role '${role.name}' is higher than or equal to the bot's highest role ('${botMember.roles.highest.name}').`,
    };
  }

  // 2. Caller privilege escalation check (server owners bypass)
  if (callerMember && guild.ownerId !== callerMember.id) {
    if (role.position >= callerMember.roles.highest.position) {
      return {
        valid: false,
        error: `Role '${role.name}' is higher than or equal to your highest role.`,
      };
    }
  }

  // 3. Prohibit dangerous administrative permissions on self-service roles
  const dangerousPermissions = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers,
  ];
  const hasDangerousPerm = dangerousPermissions.some((perm) =>
    role.permissions.has(perm),
  );
  if (hasDangerousPerm) {
    return {
      valid: false,
      error: `Role '${role.name}' possesses sensitive administrative permissions and cannot be added to self-service panels.`,
    };
  }

  // 4. Managed / Integration roles check
  if (role.managed) {
    return {
      valid: false,
      error: `Role '${role.name}' is managed by an external integration or bot and cannot be assigned.`,
    };
  }

  return { valid: true };
}

/**
 * Validates whether adding roles exceeds Discord component formulation limits.
 */
export function validatePanelRoleCapacity(
  panel: RolePanel,
  additionalCount = 1,
): ValidationResult {
  const limit =
    panel.type === "button" ? MAX_TOTAL_BUTTONS : MAX_DROPDOWN_OPTIONS;
  if (panel.roles.length + additionalCount > limit) {
    return {
      valid: false,
      error: `This panel already contains ${panel.roles.length} roles, reaching the maximum capacity of ${limit} options.`,
    };
  }
  return { valid: true };
}
