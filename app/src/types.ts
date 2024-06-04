import { ChatInputCommandInteraction } from 'discord.js'

export type AiChatMessage = {
  author: 'bot' | 'user'
  content: string
}

export type AiPromptResponse = {
  content: string,
  data?: any,
}

export type AiPromptFile = {
  uri: string,
  mimeType: string
}

export type AiPrompt = {
  text: string,
  files: AiPromptFile[],
  history: AiChatMessage[],
}

export type DiscordMessageMention = {
  id: string
  nickname: string
  username: string
}

export type DiscordMessageAttachment = {
  uri: string
  mimeType: string
}

export type DiscordMessage = {
  authorId: string
  authorDisplayName: string
  authorUsername: string
  content: string
  cleanContent: string
  /** store message reference (exists when replying to a message) */
  reference?: {
    authorUsername: string
    content: string
    cleanContent: string,
    attachments: DiscordMessageAttachment[],
  }
  mentions: DiscordMessageMention[],
  attachments: DiscordMessageAttachment[],
}

export type AppCommand = {
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>
}
