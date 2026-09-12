export type UserRole = "SUPER_ADMIN" | "GUILD_ADMIN" | "VIEWER";

export type PermissionCapability =
  | "bot:read"
  | "bot:write"
  | "bot:lifecycle"
  | "bot:reveal_token"
  | "guild:read"
  | "guild:manage_channels"
  | "guild:deploy_commands"
  | "config:read"
  | "config:write"
  | "config:reload"
  | "memory:read"
  | "memory:clear"
  | "telemetry:read";

export const ROLE_CAPABILITIES: Record<
  UserRole,
  readonly PermissionCapability[]
> = {
  SUPER_ADMIN: [
    "bot:read",
    "bot:write",
    "bot:lifecycle",
    "bot:reveal_token",
    "guild:read",
    "guild:manage_channels",
    "guild:deploy_commands",
    "config:read",
    "config:write",
    "config:reload",
    "memory:read",
    "memory:clear",
    "telemetry:read",
  ],
  GUILD_ADMIN: [
    "bot:read",
    "guild:read",
    "guild:manage_channels",
    "guild:deploy_commands",
    "config:read",
    "memory:read",
    "memory:clear",
    "telemetry:read",
  ],
  VIEWER: ["bot:read", "config:read", "telemetry:read"],
};

export interface DiscordUserProfile {
  id: string;
  username: string;
  discriminator: string;
  globalName?: string | null;
  avatar?: string | null;
}

export interface GuildPermissionSummary {
  id: string;
  name: string;
  icon?: string | null;
  owner: boolean;
  permissions: string;
  canManage: boolean;
}

export interface UserSession {
  user: DiscordUserProfile;
  role: UserRole;
  guilds: GuildPermissionSummary[];
  expiresAt: number;
}
