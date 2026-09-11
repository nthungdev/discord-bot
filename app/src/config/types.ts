export interface GuildEmojisConfig {
  [guildId: string]: {
    /**
     * Emoji symbol to server's custom emoji names
     */
    [emoji: string]: string[];
  };
}

export interface GuildMembersConfigMember {
  username: string;
  name: string;
  gender: string;
}

export interface GuildMembersConfig {
  [guildId: string]: GuildMembersConfigMember[];
}

export interface BotGuildToolsConfig {
  googleSearch?: boolean;
  discord?: boolean;
}

import type { ModelConfig } from "../genAi/types";

export interface SmartReplyConfig {
  enabled?: boolean;
  mode?: "disabled" | "mentions_and_vocative" | "ambient_intent";
  classifierModel?: ModelConfig;
  chatBotModel?: ModelConfig;
  ambientConfidenceThreshold?: number;
  debounceMs?: number;
  maxDebounceMs?: number;
  sessionTtlSeconds?: number;
  replyStrategy?: "independent" | "coalesced" | "hybrid";
  coalesceWindowMs?: number;
  silenceDurationMinutes?: number;
  ambientRateLimitSeconds?: number;
  ambientSnapshotLimit?: number;
  enableKeywordDismissal?: boolean;
  enableReactionDismissal?: boolean;
  sendTypingBehavior?:
    | "immediate_for_all"
    | "deferred_for_ambient"
    | "disabled";
  threadAutoListen?: boolean;
  optOutTopicTag?: string;
}

export interface BotGuildConfig {
  botName?: string;
  personalization?: string;
  chatBotModel?: ModelConfig;
  replyChannelIds: string[];
  ignoredChannelIds: string[];
  respondToMentions: boolean;
  systemInstruction?: string;
  replyDelay?: number;
  tools?: BotGuildToolsConfig;
  smartReply?: SmartReplyConfig;
}

export interface BotGuildsConfig {
  [guildId: string]: BotGuildConfig;
}

export interface BotConfig {
  guilds: BotGuildsConfig;
}

export interface BotsConfig {
  chatBot: BotConfig;
  policeBot: BotConfig;
  [botId: string]: BotConfig;
}

export interface AiSafetySettingsConfig {
  safetySettings: {
    category: string;
    threshold: string;
  }[];
}

export type CheckInLeaderboardConfig = string;
export type AiApiEndpointConfig = string;
export type AiProjectIdConfig = string;
export type AiModelIdConfig = string;
export type AiLocationIdConfig = string;
export type AiProviderConfig = "google-genai" | "vertex";

export type AiMaxOutputTokens = number;
export type AiMaxConversationHistoryConfig = number;
export type MemoryStoreTypeConfig = "local" | "firestore";
