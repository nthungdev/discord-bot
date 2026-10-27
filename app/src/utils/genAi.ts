import type { Guild } from "discord.js";
import { Config, ConfigParameter } from "../config";
import type { GuildMembersConfigMember } from "../config/types";
import { replaceWithUserMentions } from "../discord/helpers";
import { createGenAi, type GenAi, type GenAiConfig } from "../genAi";
import type { AiPrompt, DiscordUser } from "../types";
import { getEmojiMap, replaceEmojis } from "./emoji";

const formatMembersInstruction = (members: GuildMembersConfigMember[]) => {
  if (!members) return "";

  const shuffledMembers = members.toSorted(() => Math.random() - 0.5);
  const membersString = shuffledMembers
    .map(
      ({ name, gender, username }) =>
        `${name} (gender: ${gender}, username: @${username})`,
    )
    .join(", ");
  return `Some of the members are: ${membersString}`;
};

export interface GetGenAiConfig extends Partial<GenAiConfig> {
  guildId?: string | null;
  botId?: string | null;
}

const DEFAULT_AI_PROVIDER: GetGenAiConfig["provider"] = "google-genai";

/**
 * Resolves the API key for a specified AI provider, defaulting to Gemini.
 * Leaves room to extend to other providers (e.g. OpenAI, Anthropic).
 */
export const resolveProviderApiKey = (
  provider = "gemini",
): string | undefined => {
  switch (provider.toLowerCase()) {
    case "antigravity":
    case "agy":
      return undefined;
    case "gemini":
    case "google-genai":
      return process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    default:
      return process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  }
};

function resolveSystemInstruction(
  config: GetGenAiConfig,
  remoteConfig: Config,
): string | undefined {
  if (config.systemInstruction) {
    return config.systemInstruction;
  }
  if (!(config.guildId && config.botId)) {
    return undefined;
  }
  const bots = remoteConfig.getConfigValue(ConfigParameter.bots);
  return bots[config.botId]?.guilds?.[config.guildId]?.systemInstruction;
}

interface ResolvedAntigravityOptions {
  antigravityCommand?: string;
  antigravityConfigDir?: string;
  antigravityEffort?: string;
  antigravityTimeoutMs?: number;
}

function resolveAntigravityOptions(
  config: GetGenAiConfig,
): ResolvedAntigravityOptions {
  const timeoutEnv = process.env.ANTIGRAVITY_TIMEOUT_MS;
  const antigravityTimeoutMs =
    config.antigravityTimeoutMs ??
    (timeoutEnv ? Number(timeoutEnv) : undefined);

  return {
    antigravityCommand:
      config.antigravityCommand ??
      process.env.ANTIGRAVITY_COMMAND ??
      process.env.AGY_CLI_PATH ??
      process.env.ANTIGRAVITY_CLI_PATH,
    antigravityConfigDir:
      config.antigravityConfigDir ?? process.env.ANTIGRAVITY_CONFIG_DIR,
    antigravityEffort:
      config.antigravityEffort ?? process.env.ANTIGRAVITY_EFFORT,
    antigravityTimeoutMs,
  };
}

/**
 * @return GenAi with config values from Config
 */
export const getGenAi = (config: GetGenAiConfig = {}): GenAi => {
  const remoteConfig = Config.getInstance();
  const provider =
    config.provider ??
    remoteConfig.getConfigValue(ConfigParameter.aiProvider) ??
    DEFAULT_AI_PROVIDER;

  const apiKey =
    config.apiKey ??
    (provider === "antigravity" ? undefined : resolveProviderApiKey(provider));

  const apiEndpoint =
    config.apiEndpoint ??
    remoteConfig.getConfigValue(ConfigParameter.aiApiEndpoint);
  const locationId =
    config.locationId ??
    remoteConfig.getConfigValue(ConfigParameter.aiLocationId);
  const projectId =
    config.projectId ??
    remoteConfig.getConfigValue(ConfigParameter.aiProjectId);
  const modelId =
    config.modelId ?? remoteConfig.getConfigValue(ConfigParameter.aiModelId);
  const maxOutputTokens =
    config.maxOutputTokens ??
    remoteConfig.getConfigValue(ConfigParameter.aiMaxOutputTokens);
  const safetySettings =
    config.safetySettings ??
    remoteConfig.getConfigValue(ConfigParameter.aiSafetySettings)
      .safetySettings;

  const systemInstruction = resolveSystemInstruction(config, remoteConfig);

  const members = config.guildId
    ? remoteConfig.getConfigValue(ConfigParameter.guildMembers)[config.guildId]
    : [];
  const membersInstruction =
    config.membersInstruction ?? formatMembersInstruction(members);

  const agyOptions = resolveAntigravityOptions(config);

  const genAiConfig: GenAiConfig = {
    apiKey,
    provider,
    apiEndpoint,
    locationId,
    maxOutputTokens,
    modelId,
    projectId,
    safetySettings,
    membersInstruction,
    systemInstruction,
    ...agyOptions,
  };

  return createGenAi(genAiConfig);
};

export const generateChatMessageWithGenAi = async (
  genAi: GenAi,
  prompt: AiPrompt,
  users: DiscordUser[],
  guild?: Guild | null,
) => {
  await genAi.init();

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
