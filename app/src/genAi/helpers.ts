import type { GenAiConfig } from "./types";

/** Sampling params to spread into a provider request; omits unset keys so the model default applies. */
export const buildSamplingConfig = ({
  temperature,
  topP,
}: Pick<GenAiConfig, "temperature" | "topP">): {
  temperature?: number;
  topP?: number;
} => ({
  ...(temperature === undefined ? {} : { temperature }),
  ...(topP === undefined ? {} : { topP }),
});

export const IGNORED_CONTENT = `I'm not able to help with that, as I'm only a language model.`;

export const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/gif"];

export type PersonalizationMode =
  | "overwrite_identity"
  | "extend"
  | "overwrite_all";

export const CHAT_BOT_PERMANENT_GUIDELINES = `Guidelines for Group Channels:
1. Multi-Party Awareness: You are speaking in a shared Discord channel with multiple people. Always observe who is speaking in [Timestamp] @Username (DisplayName): ....
2. Direct Addressing & Mentions: When addressing or mentioning any user, ALWAYS format their mention as @username using their exact username (e.g., @alice, @bob; do not wrap in backticks or code blocks). Do NOT use display names, nicknames, or raw Discord IDs in mentions (system post-processing will automatically map @username to Discord's native user mention format). If multiple people asked related questions, address each by username (e.g., @alice @bob ...).
3. Tone & Format: Text like a human in a Discord group chat. Keep replies short (1-2 sentences by default) unless the user explicitly asks for detail. Avoid greetings, closings, bullet lists, and bold headers in casual chat; use code blocks only for actual code or commands.
4. Ambient Context: Use the 'Recent Channel Activity' snapshot only to understand context and references (like errors, images, or previous links). Do not respond to ambient chatter unless directly referenced by the user.
5. Deference: If told to be quiet or not needed, acknowledge in a few casual words and stop replying.`;

export const POLICE_BOT_PERMANENT_GUIDELINES = `Guidelines for Moderation & Police Enforcement:
1. Role & Authority: You are a strict, witty, and sarcastic server police bot enforcing server rules and conduct policies.
2. Direct Action & Mentions: When reprimanding violations, warning members, or addressing someone, ALWAYS format their mention as @username using their exact username (e.g., @alice; do not wrap in backticks or code blocks). Do NOT use display names, nicknames, or raw Discord IDs in mentions (system post-processing will automatically map @username to Discord's native user mention format).
3. Brevity & Punchiness: Keep responses concise, assertive, and humorous. Do not repeat banned or offensive words verbatim.
4. Tone & Style: Be sarcastic, authoritative, and sharp. Never apologize for enforcing rules. Use Discord formatting and at most one emoji at the end when appropriate.
5. Impartiality: Enforce rules decisively without engaging in endless debates.`;

export const BOT_NAME_PLACEHOLDER_PATTERN = /\{\{\s*botName\s*\}\}/g;
export const BOT_ALIASES_PLACEHOLDER_PATTERN = /\{\{\s*aliases\s*\}\}/g;

export interface PersonaPlaceholderValues {
  botName: string;
  aliases?: readonly string[];
}

/**
 * Substitutes `{{botName}}` and `{{aliases}}` in a persona/system instruction template.
 * `{{aliases}}` renders a comma-separated list, or an empty string when there are none.
 */
export function renderPersonaPlaceholders(
  template: string,
  { botName, aliases = [] }: PersonaPlaceholderValues,
): string {
  const aliasList = aliases.join(", ");
  // Function replacers keep `$&`/`$1` sequences in Discord nicknames literal.
  return template
    .replace(BOT_NAME_PLACEHOLDER_PATTERN, () => botName)
    .replace(BOT_ALIASES_PLACEHOLDER_PATTERN, () => aliasList);
}

/**
 * Builds the "People may also call you" line, or an empty string when there are no aliases.
 */
export function buildBotAliasLine(aliases: readonly string[] = []): string {
  if (aliases.length === 0) {
    return "";
  }
  return `People may also call you: ${aliases.join(", ")}.`;
}

interface SystemInstructionTemplate {
  defaultIntro: string;
  guidelines: string;
}

interface BotSystemInstructionParams {
  botName: string;
  aliases?: readonly string[];
  personalization?: string;
  mode?: PersonalizationMode;
}

function withAliasLine(intro: string, aliases: readonly string[]): string {
  const aliasLine = buildBotAliasLine(aliases);
  return aliasLine ? `${intro}\n${aliasLine}` : intro;
}

function assembleSystemInstruction(
  { botName, aliases = [], personalization, mode }: BotSystemInstructionParams,
  { defaultIntro, guidelines }: SystemInstructionTemplate,
): string {
  const trimmed = personalization
    ? renderPersonaPlaceholders(personalization, { botName, aliases }).trim()
    : undefined;

  if (mode === "overwrite_all" && trimmed) {
    return trimmed;
  }

  if (mode === "extend" && trimmed) {
    return `${withAliasLine(defaultIntro, aliases)}\n\n${guidelines}\n\nAdditional Server Directives:\n${trimmed}`;
  }

  const intro = trimmed || defaultIntro;
  return `${withAliasLine(intro, aliases)}\n\n${guidelines}`;
}

export interface ChatBotSystemInstructionParams {
  botName: string;
  aliases?: readonly string[];
  personalization?: string;
  mode?: PersonalizationMode;
}

/**
 * Assembles the final ChatBot system instruction with options to extend or overwrite.
 * - 'overwrite_identity' (default): Replaces the opening identity line with personalization while retaining core conversation guidelines.
 * - 'extend': Keeps default identity and core guidelines, appending personalization as additional rules.
 * - 'overwrite_all': Fully replaces the system instruction with personalization.
 * `{{botName}}`/`{{aliases}}` placeholders are rendered in every mode; the alias line is
 * appended to the identity line except in 'overwrite_all'.
 */
export function buildChatBotSystemInstruction({
  botName,
  aliases = [],
  personalization,
  mode = "overwrite_identity",
}: ChatBotSystemInstructionParams): string {
  return assembleSystemInstruction(
    { botName, aliases, personalization, mode },
    {
      defaultIntro: `You are ${botName}, an intelligent Discord assistant in this server.`,
      guidelines: CHAT_BOT_PERMANENT_GUIDELINES,
    },
  );
}

export interface PoliceBotSystemInstructionParams {
  botName: string;
  aliases?: readonly string[];
  personalization?: string;
  mode?: PersonalizationMode;
}

/**
 * Assembles the final PoliceBot system instruction with options to extend or overwrite.
 * - 'overwrite_identity' (default): Replaces the opening identity line with personalization while retaining core moderation guidelines.
 * - 'extend': Keeps default identity and core guidelines, appending personalization as additional rules.
 * - 'overwrite_all': Fully replaces the system instruction with personalization.
 * `{{botName}}`/`{{aliases}}` placeholders are rendered in every mode; the alias line is
 * appended to the identity line except in 'overwrite_all'.
 */
export function buildPoliceBotSystemInstruction({
  botName,
  aliases = [],
  personalization,
  mode = "overwrite_identity",
}: PoliceBotSystemInstructionParams): string {
  return assembleSystemInstruction(
    { botName, aliases, personalization, mode },
    {
      defaultIntro: `You are ${botName}, a moderation police bot dedicated to enforcing server rules.`,
      guidelines: POLICE_BOT_PERMANENT_GUIDELINES,
    },
  );
}

export interface GuildPersonaConfig {
  botName?: string;
  personalization?: string;
  personalizationMode?: PersonalizationMode;
  systemInstruction?: string;
}

/**
 * Resolves a guild's system instruction for a bot kind using the live bot identity.
 * With `botName` configured, the persona builder runs; otherwise the legacy raw
 * `systemInstruction` is returned with placeholders rendered (no lines appended).
 */
export function resolveGuildSystemInstruction(
  kind: "chatBot" | "policeBot",
  guildConfig: GuildPersonaConfig | undefined,
  identity: PersonaPlaceholderValues,
): string | undefined {
  if (!guildConfig?.botName) {
    return guildConfig?.systemInstruction
      ? renderPersonaPlaceholders(guildConfig.systemInstruction, identity)
      : guildConfig?.systemInstruction;
  }

  const build =
    kind === "policeBot"
      ? buildPoliceBotSystemInstruction
      : buildChatBotSystemInstruction;
  return build({
    botName: identity.botName,
    aliases: identity.aliases,
    personalization:
      guildConfig.personalization ?? guildConfig.systemInstruction,
    mode: guildConfig.personalizationMode,
  });
}
