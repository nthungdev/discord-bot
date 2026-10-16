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

export interface RoastFeatureConfig {
  enabled?: boolean;
  defaultLocale?: "vi" | "en-US";
  localeOverride?: "vi" | "en-US";
  maxIntensity?: "mild" | "medium" | "savage";
  allowedChannelIds?: string[];
  ignoredChannelIds?: string[];
  targetShieldCooldownSeconds?: number;
  callerCooldownSeconds?: number;
  allowCounterRoast?: boolean;
}

export interface ModerationCapabilityConfig {
  enabled?: boolean;
}

export interface VoiceBouncerCapabilityConfig {
  enabled?: boolean;
  tagOnlyVoiceChannelIds?: string[];
  tagOnlyCategoryIds?: string[];
  exemptRoleIds?: string[];
  fallbackChannelId?: string;
  action?: "disconnect" | "move";
  warningMessage?: string;
}

export interface MatchmakingCapabilityConfig {
  enabled?: boolean;
  lobbyVoiceChannelId?: string;
  team1VoiceChannelId?: string;
  team2VoiceChannelId?: string;
  matchCategoryId?: string;
  mapPool?: string[];
  defaultKFactor?: number;
  initialElo?: number;
  scoreReportingTimeoutMinutes?: number;
  autoMovePlayers?: boolean;
}

export interface ValorantFeaturesConfig {
  compare?: {
    enabled?: boolean;
  };
  statsSummary?: {
    enabled?: boolean;
    defaultPeriod?: "recent_20" | "current_act" | "all_time";
  };
  autoRecap?: {
    enabled?: boolean;
    channelId?: string;
    minTierAlert?: number;
    sportscasterBanter?: boolean;
  };
  liveScouting?: {
    enabled?: boolean;
    channelId?: string;
    alertOnGameStart?: boolean;
  };
  rankRoleSync?: {
    enabled?: boolean;
    roleMappings?: Record<string, string>;
  };
  tiltProtection?: {
    enabled?: boolean;
    consecutiveLossesThreshold?: number;
    nightOwlHourStart?: number;
    nightOwlHourEnd?: number;
    dmAlert?: boolean;
  };
}

export interface ValorantCapabilityConfig {
  enabled?: boolean;
  features?: ValorantFeaturesConfig;
}

/**
 * Evaluates whether a specific Valorant sub-feature is active for a guild.
 */
export function isValorantFeatureEnabled(
  guildConfig: BotGuildConfig | undefined,
  feature: keyof ValorantFeaturesConfig,
): boolean {
  if (guildConfig?.valorant?.enabled === false) {
    return false;
  }
  const features = guildConfig?.valorant?.features;
  const subFeature = features?.[feature] as { enabled?: boolean } | undefined;
  if (subFeature?.enabled !== undefined) {
    return subFeature.enabled;
  }
  // rankRoleSync is disabled by default; other features are enabled by default
  return feature !== "rankRoleSync";
}

export interface VoiceCompanionCapabilityConfig {
  enabled?: boolean;
  autoJoinChannelId?: string;
  inactivityTimeoutMinutes?: number;
  emptyChannelGraceSeconds?: number;
  modelId?: "gemini-3.8-live";
  voiceName?: "Puck" | "Charon" | "Kore" | "Fenrir" | "Aoede";
  systemInstruction?: string;
  energyThreshold?: number;
  bargeInSensitivity?: "high" | "normal" | "low";
  participationMode?: "ambient" | "addressed_only" | "push_to_talk";
}

/**
 * Evaluates whether Voice Companion capability is active for a guild.
 */
export function isVoiceCompanionEnabled(
  guildConfig: BotGuildConfig | undefined,
): boolean {
  return guildConfig?.voiceCompanion?.enabled === true;
}

export interface BotGuildConfig {
  botName?: string;
  personalization?: string;
  personalizationMode?: "overwrite_identity" | "extend" | "overwrite_all";
  chatBotModel?: ModelConfig;
  replyChannelIds: string[];
  ignoredChannelIds: string[];
  respondToMentions: boolean;
  systemInstruction?: string;
  replyDelay?: number;
  localeOverride?: "vi" | "en-US";
  tools?: BotGuildToolsConfig;
  smartReply?: SmartReplyConfig;
  roast?: RoastFeatureConfig;
  moderation?: ModerationCapabilityConfig;
  voiceBouncer?: VoiceBouncerCapabilityConfig;
  matchmaking?: MatchmakingCapabilityConfig;
  valorant?: ValorantCapabilityConfig;
  voiceCompanion?: VoiceCompanionCapabilityConfig;
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
