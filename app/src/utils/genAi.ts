import { Guild } from "discord.js";
import { GenAi } from "../genAi"
import { ConfigParameter, Config } from "../config"
import { GuildMembersConfigMember } from "../config/types";
import { replaceWithUserMentions } from "../discord/helpers";
import { DiscordUser } from "../types";
import { getEmojiMap, replaceEmojis } from "./emoji";

const formatMembersInstruction = (members: GuildMembersConfigMember[]) => {
  if (!members) return ''

  const shuffledMembers = members.toSorted(() => Math.random() - 0.5);
  const membersString = shuffledMembers.map(({ name, gender, username }) => `${name} (gender: ${gender}, username: @${username})`).join(', ');
  return `Some of the members are: ${membersString}`
}

export interface GenAiConfig {
  guildId?: string | null
}

/**
 * @return GenAi with config values from Config
 */
export const getGenAi = ({ guildId }: GenAiConfig = {}) => {
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

export const generateChatMessageWithGenAi = async (genAi: GenAi, promptText: string, users: DiscordUser[], guild?: Guild | null) => {
  await genAi.init()
  const { content, data } = await genAi.generate({ text: promptText })

  // replace @<username> in message with @<user id>
  const contentWithMentions = replaceWithUserMentions(
    content,
    users
  )

  let finalContent = contentWithMentions
    if (guild) {
      finalContent = replaceEmojis(
        contentWithMentions,
        getEmojiMap(guild)
      )
    }

  return { content: finalContent, data }
}