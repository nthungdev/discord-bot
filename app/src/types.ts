export type AiChatMessage = {
  author: 'bot' | 'user'
  content: string
}

export type DiscordMessage = {
  authorId: string,
  authorDisplayName: string,
  content: string,
  cleanContent: string,
}