import type { BotRuntimeMetrics } from "./bot-registry";

export interface ProcessTelemetry {
  rssBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  uptimeSeconds: number;
  nodeVersion: string;
  platform: string;
}

export interface DashboardStats {
  totalBots: number;
  onlineBots: number;
  totalGuilds: number;
  totalMessagesToday: number;
  avgGatewayPingMs: number;
  process: ProcessTelemetry;
  bots: BotRuntimeMetrics[];
}

export interface ActivityLogEvent {
  id: string;
  timestamp: number;
  type:
    | "message_received"
    | "bot_replied"
    | "moderation_action"
    | "command_executed"
    | "bot_status_changed"
    | "error";
  botId: string;
  guildId?: string;
  channelId?: string;
  userId?: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface TelemetryTickEvent {
  timestamp: number;
  stats: DashboardStats;
}
