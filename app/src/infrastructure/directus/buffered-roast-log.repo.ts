import { createItems } from "@directus/sdk";
import type { RoastLogEntry } from "../../domain/models/roast-log";
import type { IRoastLogRepository } from "../../domain/repositories/roast-log.repository";
import { directusClient } from "./client";

export class BufferedDirectusRoastLogRepository implements IRoastLogRepository {
  private queue: RoastLogEntry[] = [];
  private flushTimer: NodeJS.Timeout;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxQueueLimit: number;
  private isFlushing = false;

  constructor(batchSize = 25, flushIntervalMs = 10000, maxQueueLimit = 1000) {
    this.batchSize = batchSize;
    this.flushIntervalMs = flushIntervalMs;
    this.maxQueueLimit = maxQueueLimit;

    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);

    // Prevent interval timer from blocking Node.js event loop shutdown
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  record(entry: RoastLogEntry): void {
    if (this.queue.length >= this.maxQueueLimit) {
      console.warn(
        `[BufferedRoastLogRepo] Queue limit (${this.maxQueueLimit}) reached. Dropping oldest log entry.`,
      );
      this.queue.shift();
    }

    this.queue.push(entry);

    if (this.queue.length >= this.batchSize) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.isFlushing || this.queue.length === 0) {
      return;
    }

    this.isFlushing = true;
    const batch = this.queue.splice(0, this.batchSize);

    const records = batch.map((item) => ({
      guild_id: item.guildId,
      channel_id: item.channelId,
      caller_user_id: item.callerId,
      target_user_id: item.targetId,
      topic: item.topic ?? null,
      generated_text: item.generatedText,
      execution_time_ms: item.latencyMs,
      feedback_rating: item.feedbackRating ?? null,
    }));

    try {
      await directusClient.request(createItems("bot_roast_logs", records));
    } catch (error) {
      console.error(
        "[BufferedRoastLogRepo] Failed to flush batch to Directus. Restoring queue:",
        error,
      );
      // Restore the failed batch to the front of the queue
      this.queue.unshift(...batch);
    } finally {
      this.isFlushing = false;
    }
  }

  destroy(): void {
    clearInterval(this.flushTimer);
    // Final synchronous-triggered flush on shutdown
    if (this.queue.length > 0) {
      void this.flush();
    }
  }
}
