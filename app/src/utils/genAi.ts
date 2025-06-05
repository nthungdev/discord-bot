import { Guild } from "discord.js";
import { GenAi, GenAiConfig } from "../genAi";
import { ConfigParameter, Config } from "../config";
import { GuildMembersConfigMember } from "../config/types";
import { replaceWithUserMentions } from "../discord/helpers";
import { AiPrompt, DiscordUser } from "../types";
import { getEmojiMap, replaceEmojis } from "./emoji";

const formatMembersInstruction = (members: GuildMembersConfigMember[]) => {
  if (!members) return "";

  const shuffledMembers = members.toSorted(() => Math.random() - 0.5);
  const membersString = shuffledMembers
    .map(
      ({ name, gender, username }) =>
        `${name} (gender: ${gender}, username: @${username})`
    )
    .join(", ");
  return `Some of the members are: ${membersString}`;
};

export interface GetGenAiConfig extends Partial<GenAiConfig> {
  guildId?: string | null;
}

/**
 * @return GenAi with config values from Config
 */
export const getGenAi = (config: GetGenAiConfig = {}) => {
  const remoteConfig = Config.getInstance();
  const apiEndpoint =
    config.apiEndpoint ||
    remoteConfig.getConfigValue(ConfigParameter.aiApiEndpoint);
  const locationId =
    config.locationId ||
    remoteConfig.getConfigValue(ConfigParameter.aiLocationId);
  const projectId =
    config.projectId ||
    remoteConfig.getConfigValue(ConfigParameter.aiProjectId);
  const modelId =
    config.modelId || remoteConfig.getConfigValue(ConfigParameter.aiModelId);
  const maxOutputTokens =
    config.maxOutputTokens ||
    remoteConfig.getConfigValue(ConfigParameter.aiMaxOutputTokens);
  const safetySettings =
    config.safetySettings ||
    remoteConfig.getConfigValue(ConfigParameter.aiSafetySettings)
      .safetySettings;
  const systemInstruction =
    config.systemInstruction ||
    remoteConfig.getConfigValue(ConfigParameter.aiSystemInstruction);

  const members = config.guildId
    ? remoteConfig.getConfigValue(ConfigParameter.guildMembers)[config.guildId]
    : [];
  const membersInstruction = config.membersInstruction || formatMembersInstruction(members);

  const genAiConfig = {
    apiEndpoint,
    locationId,
    maxOutputTokens,
    modelId,
    projectId,
    safetySettings,
    membersInstruction,
    systemInstruction,
  };

  const genAi = new GenAi(genAiConfig);

  return genAi;
};

export const generateChatMessageWithGenAi = async (
  genAi: GenAi,
  prompt: AiPrompt,
  users: DiscordUser[],
  guild?: Guild | null
) => {
  await genAi.init();
  console.log(prompt.files);

  const allowFileMimeTypes = ["image/png", "image/jpeg", "image/webp"];

  if (prompt.files?.some((f) => !allowFileMimeTypes.includes(f.mimeType))) {
    return {
      content: "I can't process this file type :(",
      data: null,
    };
  }

  const { content, data } = await genAi.generate(prompt);

  // replace @<username> in message with @<user id>
  const contentWithMentions = replaceWithUserMentions(content, users);

  let finalContent = contentWithMentions;
  if (guild) {
    finalContent = replaceEmojis(contentWithMentions, getEmojiMap(guild));
  }

  return { content: finalContent, data };
};
