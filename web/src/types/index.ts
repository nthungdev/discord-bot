export type UserRole = "SUPER_ADMIN" | "GUILD_ADMIN" | "VIEWER";

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

export type BotType = "chatBot" | "policeBot" | "bouncergonBot" | "custom";
export type BotLifecycleStatus = "STOPPED" | "INITIALIZING" | "ONLINE" | "RECONNECTING" | "ERROR";

export interface BotRuntimeMetrics {
  id: string;
  name: string;
  botType: BotType;
  status: BotLifecycleStatus;
  clientId: string;
  autoStart: boolean;
  userTag?: string;
  avatarUrl?: string;
  gatewayPingMs: number;
  uptimeSeconds: number;
  joinedGuildsCount: number;
  totalChannelsCount: number;
  messageCount24h: number;
  errorCount24h: number;
  lastError?: string;
  lastStartedAt?: number;
  assignedGuildIds: string[];
  tokenMasked: string;
}

export interface ProcessTelemetry {
  rssBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  uptimeSeconds: number;
  nodeVersion: string;
  platform: string;
}

export interface DashboardStats {
  totalBots: number;
  onlineBots: number;
  totalGuilds: number;
  totalMessagesToday: number;
  avgGatewayPingMs: number;
  process: ProcessTelemetry;
  bots: BotRuntimeMetrics[];
}

export interface ActivityLogEvent {
  id: string;
  timestamp: number;
  type: "message_received" | "bot_replied" | "moderation_action" | "command_executed" | "bot_status_changed" | "error";
  botId: string;
  guildId?: string;
  channelId?: string;
  userId?: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface GuildChannelSummary {
  id: string;
  name: string;
  type: number;
  parentId?: string | null;
  isText: boolean;
  isVoice: boolean;
}

export interface BotGuildConfig {
  botName?: string;
  personalization?: string;
  personalizationMode?: "overwrite_identity" | "extend" | "overwrite_all";
  replyChannelIds: string[];
  ignoredChannelIds: string[];
  respondToMentions: boolean;
  systemInstruction?: string;
  replyDelay?: number;
  tools?: {
    googleSearch?: boolean;
    discord?: boolean;
  };
  smartReply?: {
    enabled?: boolean;
    mode?: "disabled" | "mentions_and_vocative" | "ambient_intent";
    ambientConfidenceThreshold?: number;
    debounceMs?: number;
    maxDebounceMs?: number;
    replyStrategy?: "independent" | "coalesced" | "hybrid";
    silenceDurationMinutes?: number;
    enableKeywordDismissal?: boolean;
  };
}

export interface JoinedGuildDetail {
  id: string;
  name: string;
  icon?: string | null;
  memberCount: number;
  channels: GuildChannelSummary[];
  botConfig?: BotGuildConfig;
}

export interface StoredChatMessage {
  author: "bot" | "user";
  content: string;
  userId?: string;
  username?: string;
  displayName?: string;
  timestamp: number;
}

