export interface GuildEmojisConfig {
  [guildId: string]: {
    /**
     * Emoji symbol to server's custom emoji names
     */
    [emoji: string]: string[]
  }
}

export interface GuildMembersConfigMember {
  username: string,
  name: string,
  gender: string,
}

export interface GuildMembersConfig {
  [guildId: string]: GuildMembersConfigMember[]
}

export interface BotGuildConfig {
  replyChannelIds: string[]
  ignoredChannelIds: string[]
  respondToMentions: boolean
}

export interface BotGuildsConfig {
  [guildId: string]: BotGuildConfig
}

export interface BotConfig {
  guilds: BotGuildsConfig
}

export interface BotsConfig {
  chatBot: BotConfig
  policeBot: BotConfig
}

export interface AiSafetySettingsConfig {
  safetySettings: {
    category: string,
    threshold: string,
  }[]
}

export type CheckInLeaderboardConfig = string
export type AiApiEndpointConfig = string
export type AiProjectIdConfig = string
export type AiModelIdConfig = string
export type AiLocationIdConfig = string
export type AiProviderConfig = 'google-genai' | 'vertex'

export type AiMaxOutputTokens = number
