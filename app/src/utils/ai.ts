import { GenAi } from "../ai"
import { ConfigParameter, Config } from "../config"
import { GuildMembersConfigMember } from "../config/types";

const formatMembersInstruction = (members: GuildMembersConfigMember[]) => {
  if (!members) return ''

  const shuffledMembers = members.toSorted(() => Math.random() - 0.5);
  const membersString = shuffledMembers.map(({ name, gender, username }) => `${name} (gender: ${gender}, username: @${username})`).join(', ');
  return `Some of the members are: ${membersString}`
}

export const getGenAi = (guildId?: string) => {
  const config = Config.getInstance()
  const apiEndpoint = config.getConfigValue(ConfigParameter.aiApiEndpoint)
  const locationId = config.getConfigValue(ConfigParameter.aiLocationId)
  const projectId = config.getConfigValue(ConfigParameter.aiProjectId)
  const modelId = config.getConfigValue(ConfigParameter.aiModelId)
  const maxOutputTokens = config.getConfigValue(ConfigParameter.aiMaxOutputTokens)
  const safetySettings = config.getConfigValue(ConfigParameter.aiSafetySettings).safetySettings
  const systemInstruction = config.getConfigValue(ConfigParameter.aiSystemInstruction)

  const members = guildId ? config.getConfigValue(ConfigParameter.guildMembers)[guildId] : []
  const membersInstruction = formatMembersInstruction(members)

  const genAi = new GenAi({
    apiEndpoint,
    locationId,
    maxOutputTokens,
    modelId,
    projectId,
    safetySettings,
    membersInstruction,
    systemInstruction
  })

  return genAi
}