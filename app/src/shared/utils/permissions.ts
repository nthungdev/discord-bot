import {
  type GuildPermissionSummary,
  type PermissionCapability,
  ROLE_CAPABILITIES,
  type UserRole,
  type UserSession,
} from "../types/auth";

// Discord Permissions BitField constants
// ADMINISTRATOR = 0x8 (1 << 3)
// MANAGE_GUILD = 0x20 (1 << 5)
const ADMINISTRATOR_BIT = 0x8n;
const MANAGE_GUILD_BIT = 0x20n;

/**
 * Checks whether a Discord permissions string contains Administrator or Manage Guild privileges.
 */
export function canManageDiscordGuild(
  permissions: string | number | bigint,
): boolean {
  if (!permissions) {
    return false;
  }

  try {
    const bitmask = BigInt(permissions);
    const hasAdmin = (bitmask & ADMINISTRATOR_BIT) === ADMINISTRATOR_BIT;
    const hasManageGuild = (bitmask & MANAGE_GUILD_BIT) === MANAGE_GUILD_BIT;
    return hasAdmin || hasManageGuild;
  } catch {
    return false;
  }
}

/**
 * Evaluates whether an authenticated user session holds a specific capability.
 */
export function hasCapability(
  session: UserSession | undefined | null,
  capability: PermissionCapability,
): boolean {
  if (!session) {
    return false;
  }

  const roleCaps = ROLE_CAPABILITIES[session.role] || [];
  return roleCaps.includes(capability);
}

/**
 * Checks whether an authenticated user session has administrative access to a specific guild.
 */
export function hasGuildAccess(
  session: UserSession | undefined | null,
  guildId: string,
): boolean {
  if (!session) {
    return false;
  }

  if (session.role === "SUPER_ADMIN") {
    return true;
  }

  if (session.role === "GUILD_ADMIN") {
    return session.guilds.some((g) => g.id === guildId && g.canManage);
  }

  return false;
}

/**
 * Resolves the role for a Discord user given their user ID, configured admin IDs, and user guilds.
 */
export function resolveUserRole(
  userId: string,
  adminDiscordUserIds: string[],
  userGuilds: GuildPermissionSummary[],
): UserRole {
  if (adminDiscordUserIds.includes(userId)) {
    return "SUPER_ADMIN";
  }

  const managesAnyGuild = userGuilds.some((g) => g.canManage);
  if (managesAnyGuild) {
    return "GUILD_ADMIN";
  }

  return "VIEWER";
}
