import { type Client, type Message, userMention } from "discord.js";
import { detectRacistViolations } from "../bots/police-bot/detector";
import { getRandomPoliceGif } from "../bots/police-bot/utils";
import type { Config } from "../config";
import type { BotGuildConfig } from "../config/types";
import { getMetricsService } from "../services/metrics";
import type { IBotCapability } from "./types";

/**
 * Moderation Capability (Police Bot Module)
 * Evaluates messages for hate speech, censored terms, and policy violations.
 * Intercepts and deletes offending messages before downstream AI processing.
 */
export class ModerationCapability implements IBotCapability {
  readonly id = "moderation";
  readonly name = "Police Moderation Engine";

  init(_client: Client, _config: Config): void {
    console.info("[ModerationCapability] Initialized.");
  }

  async handleMessage(
    message: Message,
    guildConfig?: BotGuildConfig,
  ): Promise<boolean | undefined> {
    if (message.author.bot || !message.guild) {
      return undefined;
    }

    // Respect guild-level ignored channels
    if (guildConfig?.ignoredChannelIds?.includes(message.channelId)) {
      return undefined;
    }

    const violations = detectRacistViolations(message.content);
    if (violations.length === 0) {
      return undefined; // Clean message, continue downstream
    }

    // Violation detected - intercept and moderate
    console.warn(
      `[ModerationCapability] Violation detected in #${message.channel.id} by @${message.author.tag}: ${violations
        .map((v) => v.reason)
        .join(", ")}`,
    );

    try {
      // 1. Delete offending message if bot has permissions
      if (message.deletable) {
        await message.delete();
      }

      // 2. Post warning gif & alert
      const gif = getRandomPoliceGif();
      const warningMessage = `${userMention(
        message.author.id,
      )} 🚨 **Message deleted for policy violation:** ${violations
        .map((v) => v.reason)
        .join(", ")}.\n${gif}`;

      if (message.channel.isSendable()) {
        await message.channel.send(warningMessage);
      }

      // 3. Log to telemetry stream
      getMetricsService().emitActivity({
        botId: "bot",
        type: "moderation_action",
        summary: `Deleted message from @${message.author.username} in #${message.channel.id} for: ${violations[0]?.reason}`,
        guildId: message.guild.id,
        channelId: message.channel.id,
        userId: message.author.id,
      });

      return true; // Intercepted - stop pipeline propagation
    } catch (error) {
      console.error(
        "[ModerationCapability] Error executing moderation action:",
        error,
      );
      return undefined;
    }
  }
}
