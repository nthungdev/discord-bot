export const IGNORED_CONTENT = `I'm not able to help with that, as I'm only a language model.`;

export const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/gif"];

export type PersonalizationMode =
  | "overwrite_identity"
  | "extend"
  | "overwrite_all";

export const CHAT_BOT_PERMANENT_GUIDELINES = `Guidelines for Group Channels:
1. Multi-Party Awareness: You are speaking in a shared Discord channel with multiple people. Always observe who is speaking in [Timestamp] @Username (DisplayName): ....
2. Direct Addressing & Mentions: When addressing or mentioning any user, ALWAYS format their mention as "@username" using their exact username (e.g., "@alice", "@bob"). Do NOT use display names, nicknames, or raw Discord IDs in mentions (system post-processing will automatically map "@username" to Discord's native user mention format). If multiple people asked related questions, address each by username (e.g., "@alice @bob ...").
3. Tone & Format: Be concise, direct, and conversational. Avoid repetitive pleasantries or corporate filler. Use Discord markdown formatting (**bold**, code blocks) and emojis naturally.
4. Ambient Context: Use the 'Recent Channel Activity' snapshot only to understand context and references (like errors, images, or previous links). Do not respond to ambient chatter unless directly referenced by the user.
5. Deference: If told to be quiet or not needed, acknowledge briefly ("Understood, staying quiet! 🤐") and disengage.`;

export const POLICE_BOT_PERMANENT_GUIDELINES = `Guidelines for Moderation & Police Enforcement:
1. Role & Authority: You are a strict, witty, and sarcastic server police bot enforcing server rules and conduct policies.
2. Direct Action & Mentions: When reprimanding violations, warning members, or addressing someone, ALWAYS format their mention as "@username" using their exact username (e.g., "@alice"). Do NOT use display names, nicknames, or raw Discord IDs in mentions (system post-processing will automatically map "@username" to Discord's native user mention format).
3. Brevity & Punchiness: Keep responses concise, assertive, and humorous. Do not repeat banned or offensive words verbatim.
4. Tone & Style: Be sarcastic, authoritative, and sharp. Never apologize for enforcing rules. Use Discord formatting and at most one emoji at the end when appropriate.
5. Impartiality: Enforce rules decisively without engaging in endless debates.`;

export interface ChatBotSystemInstructionParams {
  botName: string;
  personalization?: string;
  mode?: PersonalizationMode;
}

/**
 * Assembles the final ChatBot system instruction with options to extend or overwrite.
 * - 'overwrite_identity' (default): Replaces the opening identity line with personalization while retaining core conversation guidelines.
 * - 'extend': Keeps default identity and core guidelines, appending personalization as additional rules.
 * - 'overwrite_all': Fully replaces the system instruction with personalization.
 */
export function buildChatBotSystemInstruction({
  botName,
  personalization,
  mode = "overwrite_identity",
}: ChatBotSystemInstructionParams): string {
  const trimmed = personalization?.trim();

  if (mode === "overwrite_all" && trimmed) {
    return trimmed;
  }

  const defaultIntro = `You are ${botName}, an intelligent Discord assistant in this server.`;

  if (mode === "extend" && trimmed) {
    return `${defaultIntro}\n\n${CHAT_BOT_PERMANENT_GUIDELINES}\n\nAdditional Server Directives:\n${trimmed}`;
  }

  const intro = trimmed || defaultIntro;
  return `${intro}\n\n${CHAT_BOT_PERMANENT_GUIDELINES}`;
}

export interface PoliceBotSystemInstructionParams {
  botName: string;
  personalization?: string;
  mode?: PersonalizationMode;
}

/**
 * Assembles the final PoliceBot system instruction with options to extend or overwrite.
 * - 'overwrite_identity' (default): Replaces the opening identity line with personalization while retaining core moderation guidelines.
 * - 'extend': Keeps default identity and core guidelines, appending personalization as additional rules.
 * - 'overwrite_all': Fully replaces the system instruction with personalization.
 */
export function buildPoliceBotSystemInstruction({
  botName,
  personalization,
  mode = "overwrite_identity",
}: PoliceBotSystemInstructionParams): string {
  const trimmed = personalization?.trim();

  if (mode === "overwrite_all" && trimmed) {
    return trimmed;
  }

  const defaultIntro = `You are ${botName}, a moderation police bot dedicated to enforcing server rules.`;

  if (mode === "extend" && trimmed) {
    return `${defaultIntro}\n\n${POLICE_BOT_PERMANENT_GUIDELINES}\n\nAdditional Server Directives:\n${trimmed}`;
  }

  const intro = trimmed || defaultIntro;
  return `${intro}\n\n${POLICE_BOT_PERMANENT_GUIDELINES}`;
}
