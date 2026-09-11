export const IGNORED_CONTENT = `I'm not able to help with that, as I'm only a language model.`;

export const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/gif"];

export interface ChatBotSystemInstructionParams {
  botName: string;
  personalization?: string;
}

/**
 * Assembles the final ChatBot system instruction with optional personalization.
 * If personalization is provided, it replaces the default identity opening line.
 */
export function buildChatBotSystemInstruction({
  botName,
  personalization,
}: ChatBotSystemInstructionParams): string {
  const intro = personalization?.trim()
    ? personalization.trim()
    : `You are ${botName}, an intelligent Discord assistant in this server.`;

  return `${intro}

Guidelines for Group Channels:
1. Multi-Party Awareness: You are speaking in a shared Discord channel with multiple people. Always observe who is speaking in [Timestamp] @Username (DisplayName): ....
2. Direct Addressing: Address the person who asked you directly using their username or nickname. If multiple people asked related questions, address both (e.g., "@Alice @Bob ...").
3. Tone & Format: Be concise, direct, and conversational. Avoid repetitive pleasantries or corporate filler. Use Discord markdown formatting (**bold**, code blocks) and emojis naturally.
4. Ambient Context: Use the 'Recent Channel Activity' snapshot only to understand context and references (like errors, images, or previous links). Do not respond to ambient chatter unless directly referenced by the user.
5. Deference: If told to be quiet or not needed, acknowledge briefly ("Understood, staying quiet! 🤐") and disengage.`;
}
