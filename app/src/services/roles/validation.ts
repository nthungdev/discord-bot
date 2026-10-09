import {
  type Guild,
  type GuildMember,
  PermissionFlagsBits,
  type Role,
} from "discord.js";
import {
  MAX_DROPDOWN_OPTIONS,
  MAX_EMOJI_REACTIONS,
  MAX_TOTAL_BUTTONS,
} from "./constants";
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
  options?: { isRevocation?: boolean },
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

  // 3. Prohibit dangerous administrative and moderation permissions on self-service roles (only on grant/addition)
  if (!options?.isRevocation) {
    const dangerousPermissions = [
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.MentionEveryone,
      PermissionFlagsBits.ManageWebhooks,
      PermissionFlagsBits.ManageThreads,
      PermissionFlagsBits.ManageGuildExpressions,
    ];
    const hasDangerousPerm = dangerousPermissions.some((perm) =>
      role.permissions.has(perm),
    );
    if (hasDangerousPerm) {
      return {
        valid: false,
        error: `Role '${role.name}' possesses sensitive administrative or moderation permissions and cannot be added to self-service panels.`,
      };
    }
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
 * Validates whether a Discord role can be revoked or removed from a member.
 * Enforces bot permissions and hierarchy, without blocking sensitive permissions.
 */
export function validateRoleRevocable(
  guild: Guild,
  role: Role,
  callerMember?: GuildMember,
): ValidationResult {
  return validateRoleManageable(guild, role, callerMember, {
    isRevocation: true,
  });
}

/**
 * Validates whether adding roles exceeds Discord component formulation limits.
 */
export function validatePanelRoleCapacity(
  panel: RolePanel,
  additionalCount = 1,
): ValidationResult {
  let limit = MAX_TOTAL_BUTTONS;
  if (panel.type === "dropdown") {
    limit = MAX_DROPDOWN_OPTIONS;
  } else if (panel.type === "emoji") {
    limit = MAX_EMOJI_REACTIONS;
  }

  if (panel.roles.length + additionalCount > limit) {
    return {
      valid: false,
      error: `This panel already contains ${panel.roles.length} roles, reaching the maximum capacity of ${limit} options.`,
    };
  }
  return { valid: true };
}
