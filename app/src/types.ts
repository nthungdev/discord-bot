import { ChatInputCommandInteraction } from "discord.js";

export type UserActorInfo = {
  userId?: string;
  username?: string;
  displayName?: string;
};

export type AiChatMessage = {
  author: "bot" | "user";
  content: string;
  userId?: string;
  username?: string;
  displayName?: string;
  timestamp?: number;
};

export type StoredAiChatMessage = {
  author: "bot" | "user";
  content: string;
  userId?: string;
  username?: string;
  displayName?: string;
  timestamp: number;
};

export type ConversationDocument = {
  botId: string;
  botType?: string;
  channelId: string;
  guildId?: string;
  messages: StoredAiChatMessage[];
  updatedAt: number | FirebaseFirestore.FieldValue;
  createdAt?: number | FirebaseFirestore.FieldValue;
};

export type AiPromptResponse = {
  content: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
};

export type AiPromptFile = {
  uri: string;
  mimeType: string;
};

export type AiPrompt = {
  text: string;
  files?: AiPromptFile[];
  history?: AiChatMessage[];
};

export type DiscordUser = {
  id: string;
  nickname: string;
  username: string;
};

export type DiscordMessageAttachment = {
  uri: string;
  mimeType: string;
};

export type DiscordMessage = {
  authorId: string;
  authorDisplayName: string;
  authorUsername: string;
  content: string;
  cleanContent: string;
  /** store message reference (exists when replying to a message) */
  reference?: {
    authorUsername: string;
    content: string;
    cleanContent: string;
    attachments: DiscordMessageAttachment[];
  };
  mentions: DiscordUser[];
  attachments: DiscordMessageAttachment[];
};

export type AppCommand = {
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};
