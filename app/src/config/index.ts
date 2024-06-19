import { ServerTemplate, getRemoteConfig } from 'firebase-admin/remote-config'
import defaultConfig from './defaultConfig.json'
import {
  AiApiEndpointConfig,
  AiLocationIdConfig,
  AiMaxOutputTokens,
  AiModelIdConfig,
  AiProjectIdConfig,
  AiSafetySettingsConfig,
  CheckInLeaderboardConfig,
  GuildEmojisConfig,
  GuildMembersConfig,
} from './types'

export enum ConfigParameter {
  guildEmojis = 'guildEmojis',
  guildMembers = 'guildMembers',
  checkInLeaderboard = 'checkInLeaderboard',
  aiApiEndpoint = 'aiApiEndpoint',
  aiProjectId = 'aiProjectId',
  aiModelId = 'aiModelId',
  aiLocationId = 'aiLocationId',
  aiSystemInstruction = 'aiSystemInstruction',
  aiMaxOutputTokens = 'aiMaxOutputTokens',
  aiSafetySettings = 'aiSafetySettings',
}

export class Config {
  private static instance: Config
  private template: ServerTemplate | null = null

  private constructor() { }

  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config()
    }
    return Config.instance
  }

  async init() {
    const rc = getRemoteConfig()
    this.template = await rc.getServerTemplate({
      defaultConfig: {
        guildEmojis: JSON.stringify(defaultConfig.guildEmojis),
        guildMembers: JSON.stringify(defaultConfig.guildMembers),
        checkInLeaderboard: defaultConfig.checkInLeaderboard,
        aiApiEndpoint: defaultConfig.aiApiEndpoint,
        aiProjectId: defaultConfig.aiProjectId,
        aiModelId: defaultConfig.aiModelId,
        aiLocationId: defaultConfig.aiLocationId,
        aiSystemInstruction: defaultConfig.aiSystemInstruction,
        aiMaxOutputTokens: defaultConfig.aiMaxOutputTokens,
        aiSafetySettings: JSON.stringify(defaultConfig.aiSafetySettings),
      },
    })
  }

  private getConfig() {
    if (!this.template) {
      throw new Error('Remote config not initialized')
    }
    const config = this.template.evaluate()
    return config
  }

  /** Fetch latest config version */
  async loadConfig() {
    if (!this.template) {
      throw new Error('Remote config not initialized')
    }
    await this.template?.load()
  }

  getConfigValue<T extends ConfigParameter>(
    key: T
  ): T extends ConfigParameter.guildEmojis
    ? GuildEmojisConfig
    : T extends ConfigParameter.checkInLeaderboard
    ? CheckInLeaderboardConfig
    : T extends ConfigParameter.guildMembers
    ? GuildMembersConfig
    : T extends ConfigParameter.aiSafetySettings
    ? AiSafetySettingsConfig
    : T extends ConfigParameter.aiApiEndpoint
    ? AiApiEndpointConfig
    : T extends ConfigParameter.aiLocationId
    ? AiLocationIdConfig
    : T extends ConfigParameter.aiModelId
    ? AiModelIdConfig
    : T extends ConfigParameter.aiMaxOutputTokens
    ? AiMaxOutputTokens
    : AiProjectIdConfig {
    const config = this.getConfig()
    switch (key) {
      case ConfigParameter.guildEmojis:
      case ConfigParameter.guildMembers:
      case ConfigParameter.aiSafetySettings:
        return JSON.parse(config.getValue(key).asString())
      case ConfigParameter.checkInLeaderboard:
      case ConfigParameter.aiApiEndpoint:
      case ConfigParameter.aiLocationId:
      case ConfigParameter.aiModelId:
      case ConfigParameter.aiProjectId:
      case ConfigParameter.aiSystemInstruction:
        return config.getString(key) as never
      case ConfigParameter.aiMaxOutputTokens:
        return config.getNumber(key) as never
      default:
        throw new Error('Invalid key')
    }
  }
}