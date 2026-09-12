import { EventEmitter } from "node:events";
import os from "node:os";
import type {
  ActivityLogEvent,
  DashboardStats,
  ProcessTelemetry,
} from "../../shared/types/metrics";
import { getBotManager } from "../bot-manager";

export class MetricsService {
  private eventEmitter = new EventEmitter();
  private messageCountToday = 0;
  private lastResetDay = new Date().getUTCDate();

  constructor() {
    this.eventEmitter.setMaxListeners(100);
  }

  private checkDateReset() {
    const currentDay = new Date().getUTCDate();
    if (currentDay !== this.lastResetDay) {
      this.messageCountToday = 0;
      this.lastResetDay = currentDay;
    }
  }

  incrementMessageCount() {
    this.checkDateReset();
    this.messageCountToday += 1;
  }

  getProcessTelemetry(): ProcessTelemetry {
    const memory = process.memoryUsage();
    return {
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      platform: `${os.platform()} (${os.arch()})`,
    };
  }

  async getDashboardStats(): Promise<DashboardStats> {
    this.checkDateReset();
    const botManager = getBotManager();
    const bots = await botManager.getAllBots();

    const onlineBots = bots.filter((b) => b.status === "ONLINE").length;
    const totalGuilds = bots.reduce((sum, b) => sum + b.joinedGuildsCount, 0);

    const onlinePingBots = bots.filter(
      (b) => b.status === "ONLINE" && b.gatewayPingMs >= 0,
    );
    const avgGatewayPingMs =
      onlinePingBots.length > 0
        ? Math.round(
            onlinePingBots.reduce((sum, b) => sum + b.gatewayPingMs, 0) /
              onlinePingBots.length,
          )
        : 0;

    return {
      totalBots: bots.length,
      onlineBots,
      totalGuilds,
      totalMessagesToday: this.messageCountToday,
      avgGatewayPingMs,
      process: this.getProcessTelemetry(),
      bots,
    };
  }

  emitActivity(
    event: Omit<ActivityLogEvent, "id" | "timestamp">,
  ): ActivityLogEvent {
    const fullEvent: ActivityLogEvent = {
      ...event,
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: Date.now(),
    };
    this.eventEmitter.emit("activity", fullEvent);
    return fullEvent;
  }

  onActivity(listener: (event: ActivityLogEvent) => void) {
    this.eventEmitter.on("activity", listener);
    return () => {
      this.eventEmitter.off("activity", listener);
    };
  }
}

let _metricsService: MetricsService | null = null;

export function getMetricsService(): MetricsService {
  if (!_metricsService) {
    _metricsService = new MetricsService();
  }
  return _metricsService;
}
