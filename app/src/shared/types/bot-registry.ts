import type { BotGuildConfig } from "../../config/types";

export type BotType = "chatBot" | "policeBot" | "bouncergonBot" | "custom";

export type BotLifecycleStatus =
  | "STOPPED"
  | "INITIALIZING"
  | "ONLINE"
  | "RECONNECTING"
  | "ERROR";

export interface RegisteredBotRecord {
  id: string;
  name: string;
  botType: BotType;
  clientId: string;
  encryptedToken: string;
  autoStart: boolean;
  assignedGuildIds: string[];
  customConfigOverrides?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface BotRegistrationInput {
  id: string;
  name: string;
  botType: BotType;
  clientId: string;
  token: string;
  autoStart?: boolean;
  assignedGuildIds?: string[];
  customConfigOverrides?: Record<string, unknown>;
}

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

export interface GuildChannelSummary {
  id: string;
  name: string;
  type: number;
  parentId?: string | null;
  isText: boolean;
  isVoice: boolean;
}

export interface JoinedGuildDetail {
  id: string;
  name: string;
  icon?: string | null;
  memberCount: number;
  channels: GuildChannelSummary[];
  botConfig?: BotGuildConfig;
}

export interface IBotRegistryStore {
  get(id: string): Promise<RegisteredBotRecord | null>;
  getAll(): Promise<RegisteredBotRecord[]>;
  save(bot: RegisteredBotRecord): Promise<void>;
  delete(id: string): Promise<void>;
}
