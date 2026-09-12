import {
  type DiscordBotEngine,
  getBotEngine,
} from "../../capabilities/bot-engine";
import { deployGuildCommands } from "../../discord/deployCommands";
import type { BotRuntimeMetrics, JoinedGuildDetail } from "../../shared";

/**
 * Bot & Server Connection Manager
 * Coordinates the unified DiscordBotEngine lifecycle, server connections, and slash command deployment.
 */
export class BotManager {
  private engine: DiscordBotEngine;
  private isInitialized = false;

  constructor(engine?: DiscordBotEngine) {
    this.engine = engine ?? getBotEngine();
  }

  /**
   * Initializes and starts the unified bot engine.
   */
  async init(): Promise<void> {
    if (this.isInitialized) return;

    const token = process.env.DISCORD_TOKEN;
    if (token) {
      try {
        await this.engine.start(token);
      } catch (error) {
        console.error("[BotManager] Error starting Discord bot engine:", error);
      }
    } else {
      console.warn(
        "[BotManager] DISCORD_TOKEN is not set; bot engine not started.",
      );
    }

    this.isInitialized = true;
  }

  /**
   * Returns runtime metrics for the unified bot.
   */
  async getAllBots(): Promise<BotRuntimeMetrics[]> {
    return [this.engine.getRuntimeMetrics()];
  }

  /**
   * Returns runtime metrics for the bot.
   */
  async getBot(id: string): Promise<BotRuntimeMetrics | null> {
    const metrics = this.engine.getRuntimeMetrics();
    if (id === "bot" || id === "chatBot" || id === metrics.id) {
      return metrics;
    }
    return metrics;
  }

  /**
   * Returns the underlying engine instance.
   */
  getEngine(): DiscordBotEngine {
    return this.engine;
  }

  /**
   * Returns the Discord OAuth2 bot installation / invite URL.
   */
  getBotInviteUrl(): string {
    const clientId = process.env.DISCORD_CLIENT_ID || "";
    // Standard Administrator permissions (8) or customizable permissions
    return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`;
  }

  /**
   * Starts the bot engine.
   */
  async startBot(_id?: string): Promise<void> {
    await this.engine.start(process.env.DISCORD_TOKEN);
  }

  /**
   * Stops the bot engine.
   */
  async stopBot(_id?: string): Promise<void> {
    await this.engine.destroy();
  }

  /**
   * Restarts the bot Gateway connection.
   */
  async restartBot(_id?: string): Promise<void> {
    await this.engine.restart();
  }

  /**
   * Returns joined server details (channels, members, presence).
   */
  async getJoinedGuildDetails(_id?: string): Promise<JoinedGuildDetail[]> {
    return this.engine.getJoinedGuildDetails();
  }

  /**
   * Deploys slash commands to a target server.
   */
  async deployGuildCommands(guildId: string): Promise<void> {
    const token = process.env.DISCORD_TOKEN || "";
    const clientId = process.env.DISCORD_CLIENT_ID || "";
    if (!(token && clientId)) {
      throw new Error(
        "Missing DISCORD_TOKEN or DISCORD_CLIENT_ID for command deployment.",
      );
    }
    await deployGuildCommands(token, clientId, guildId);
  }
}

let botManagerInstance: BotManager | null = null;

export const getBotManager = (): BotManager => {
  if (!botManagerInstance) {
    botManagerInstance = new BotManager();
  }
  return botManagerInstance;
};
