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

export type CheckInLeaderboardConfig = string