export type AiChatMessage = {
  author: 'bot' | 'user'
  content: string
}

export type DiscordMessageMention = {
  id: string,
  nickname: string,
  username: string,
}

export type DiscordMessage = {
  authorId: string,
  authorDisplayName: string,
  authorUsername: string,
  content: string,
  cleanContent: string,
  mentions: DiscordMessageMention[],
}