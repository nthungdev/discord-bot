import { ServerTemplate, getRemoteConfig } from 'firebase-admin/remote-config'
import defaultConfig from './defaultConfig.json'
import {
  CheckInLeaderboardConfig,
  GuildEmojisConfig,
  GuildMembersConfig,
} from './types'

export enum ConfigParameter {
  guildEmojis = 'guildEmojis',
  guildMembers = 'guildMembers',
  checkInLeaderboard = 'checkInLeaderboard',
}

let template: ServerTemplate | null = null

export const init = async () => {
  const rc = getRemoteConfig()
  template = await rc.getServerTemplate({
    defaultConfig: {
      guildEmojis: JSON.stringify(defaultConfig.guildEmojis),
      guildMembers: JSON.stringify(defaultConfig.guildMembers),
    },
  })
}

const getConfig = () => {
  if (!template) {
    throw new Error('Remote config not initialized')
  }
  const config = template.evaluate()
  return config
}

export const getConfigValue = <T extends ConfigParameter>(
  key: T
): T extends ConfigParameter.guildEmojis
  ? GuildEmojisConfig
  : T extends ConfigParameter.checkInLeaderboard
  ? CheckInLeaderboardConfig
  : GuildMembersConfig => {
  const config = getConfig()
  switch (key) {
    case ConfigParameter.guildEmojis:
      return JSON.parse(config.getValue(key).asString())
    case ConfigParameter.guildMembers:
      return JSON.parse(config.getValue(key).asString())
    case ConfigParameter.checkInLeaderboard:
      return config.getString(key) as never
    default:
      throw new Error('Invalid key')
  }
}
