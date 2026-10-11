export interface RoastLogEntry {
  guildId: string;
  channelId: string;
  callerId: string;
  targetId: string;
  topic?: string;
  generatedText: string;
  latencyMs: number;
  feedbackRating?: number;
}
