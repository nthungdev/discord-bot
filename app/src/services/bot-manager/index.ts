import {
  type DiscordBotEngine,
  getBotEngine,
} from "../../capabilities/bot-engine";
import { deployGuildCommands } from "../../discord/deployCommands";
import type { BotRuntimeMetrics, JoinedGuildDetail } from "../../shared";
import { getGuildLocaleStore } from "../locale/store";

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

    // Auto-deploy slash commands in background if configured via environment
    void this.autoDeployConfiguredGuildCommands();
  }

  /**
   * Automatically deploys slash commands to guilds specified in AUTO_DEPLOY_COMMAND_GUILDS.
   */
  async autoDeployConfiguredGuildCommands(): Promise<void> {
    const rawSetting = process.env.AUTO_DEPLOY_COMMAND_GUILDS;
    if (!rawSetting) {
      return;
    }

    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.DISCORD_CLIENT_ID;
    if (!(token && clientId)) {
      console.warn(
        "[BotManager] Cannot auto-deploy commands: DISCORD_TOKEN or DISCORD_CLIENT_ID is missing.",
      );
      return;
    }

    if (rawSetting.trim().toLowerCase() === "all") {
      try {
        const guilds = await this.getJoinedGuildDetails();
        for (const guild of guilds) {
          await this.deployGuildCommandsSilently(guild.id);
        }
      } catch (error) {
        console.error(
          "[BotManager] Error fetching joined guilds for auto-deployment:",
          error,
        );
      }
      return;
    }

    const guildIds = rawSetting
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    for (const guildId of guildIds) {
      await this.deployGuildCommandsSilently(guildId);
    }
  }

  /**
   * Deploys slash commands to a single guild and logs any errors without throwing.
   */
  private async deployGuildCommandsSilently(guildId: string): Promise<void> {
    try {
      console.info(
        `[BotManager] Auto-deploying commands to guild '${guildId}'...`,
      );
      await this.deployGuildCommands(guildId);
      console.info(
        `[BotManager] Successfully auto-deployed commands to guild '${guildId}'.`,
      );
    } catch (error) {
      console.error(
        `[BotManager] Failed to auto-deploy commands to guild '${guildId}':`,
        error,
      );
    }
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
   * Deploys slash commands to a target server with guild locale filtering.
   */
  async deployGuildCommands(
    guildId: string,
    localeOverride?: string | null,
  ): Promise<void> {
    const token = process.env.DISCORD_TOKEN || "";
    const clientId = process.env.DISCORD_CLIENT_ID || "";
    if (!(token && clientId)) {
      throw new Error(
        "Missing DISCORD_TOKEN or DISCORD_CLIENT_ID for command deployment.",
      );
    }
    const resolvedLocale =
      localeOverride !== undefined
        ? localeOverride
        : getGuildLocaleStore().getLocale(guildId);
    const effectiveLocale = resolvedLocale === "auto" ? null : resolvedLocale;
    await deployGuildCommands(token, clientId, guildId, effectiveLocale);
  }
}

let botManagerInstance: BotManager | null = null;

export const getBotManager = (): BotManager => {
  if (!botManagerInstance) {
    botManagerInstance = new BotManager();
  }
  return botManagerInstance;
};
