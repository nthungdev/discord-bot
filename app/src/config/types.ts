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

export type AiMaxOutputTokens = number
