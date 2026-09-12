import {
  Client,
  Events,
  GatewayIntentBits,
  type Interaction,
  type Message,
  type VoiceState,
} from "discord.js";
import { Config } from "../config";
import { getMetricsService } from "../services/metrics";
import type { BotLifecycleStatus, JoinedGuildDetail } from "../shared";
import { ChatCapability } from "./chat-capability";
import { ModerationCapability } from "./moderation-capability";
import type { IBotCapability } from "./types";

/**
 * Unified Discord Bot Engine
 * Coordinates Discord Gateway connection, capability registration, and event pipeline dispatch.
 */
export class DiscordBotEngine {
  private client: Client;
  private capabilities: IBotCapability[] = [];
  private status: BotLifecycleStatus = "STOPPED";
  private startTime = 0;
  private token = "";

  constructor(client?: Client) {
    this.client =
      client ??
      new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildMembers,
          GatewayIntentBits.GuildVoiceStates,
        ],
      });

    // Register built-in capabilities in pipeline priority order
    this.registerCapability(new ModerationCapability());
    this.registerCapability(new ChatCapability());
  }

  /**
   * Registers a capability module into the engine pipeline.
   */
  public registerCapability(capability: IBotCapability): void {
    this.capabilities.push(capability);
  }

  /**
   * Gets all registered capabilities.
   */
  public getCapabilities(): readonly IBotCapability[] {
    return this.capabilities;
  }

  /**
   * Gets the underlying Discord.js client.
   */
  public getClient(): Client {
    return this.client;
  }

  /**
   * Initializes capabilities, binds event pipeline, and logs into Discord Gateway.
   */
  public async start(token?: string): Promise<void> {
    const activeToken = token || process.env.DISCORD_TOKEN;
    if (!activeToken) {
      throw new Error(
        "No Discord bot token provided. Please set DISCORD_TOKEN in environment variables.",
      );
    }
    this.token = activeToken;
    this.status = "INITIALIZING";

    const config = Config.getInstance();

    // Initialize all capabilities
    for (const capability of this.capabilities) {
      await capability.init(this.client, config);
    }

    this.bindEvents();

    try {
      await this.client.login(this.token);
      this.status = "ONLINE";
      this.startTime = Date.now();
      console.info(
        `[DiscordBotEngine] Successfully connected as ${this.client.user?.tag}`,
      );

      getMetricsService().emitActivity({
        botId: "bot",
        type: "bot_status_changed",
        summary: `Bot connected as ${this.client.user?.tag}`,
      });
    } catch (error) {
      this.status = "ERROR";
      console.error("[DiscordBotEngine] Gateway connection error:", error);
      throw error;
    }
  }

  /**
   * Restarts the Discord client connection cleanly.
   */
  public async restart(): Promise<void> {
    console.info("[DiscordBotEngine] Restarting Gateway connection...");
    this.status = "RECONNECTING";
    try {
      this.client.destroy();
      await this.start(this.token);
    } catch (error) {
      this.status = "ERROR";
      throw error;
    }
  }

  /**
   * Disconnects the bot and cleans up all capabilities.
   */
  public async destroy(): Promise<void> {
    for (const capability of this.capabilities) {
      if (capability.destroy) {
        await capability.destroy();
      }
    }
    this.client.destroy();
    this.status = "STOPPED";
  }

  /**
   * Returns current real-time telemetry metrics.
   */
  public getRuntimeMetrics(): import("../shared").BotRuntimeMetrics {
    const isOnline = this.status === "ONLINE" && this.client.isReady();
    const tokenMasked = this.token
      ? `${this.token.substring(0, 6)}...${this.token.substring(this.token.length - 4)}`
      : "******";
    let totalChannelsCount = 0;
    for (const guild of this.client.guilds.cache.values()) {
      totalChannelsCount += guild.channels.cache.size;
    }

    return {
      id: "bot",
      name: this.client.user?.username ?? "Discord Bot",
      botType: "chatBot",
      status: isOnline ? "ONLINE" : this.status,
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      autoStart: true,
      userTag: this.client.user?.tag,
      avatarUrl: this.client.user?.displayAvatarURL(),
      gatewayPingMs: this.client.ws.ping >= 0 ? this.client.ws.ping : 0,
      uptimeSeconds:
        this.startTime > 0
          ? Math.floor((Date.now() - this.startTime) / 1000)
          : 0,
      joinedGuildsCount: this.client.guilds.cache.size,
      totalChannelsCount,
      messageCount24h: 0,
      errorCount24h: 0,
      assignedGuildIds: Array.from(this.client.guilds.cache.keys()),
      tokenMasked,
    };
  }

  /**
   * Inspects detailed guild channel topologies and permissions for connected servers.
   */
  public getJoinedGuildDetails(): JoinedGuildDetail[] {
    return this.client.guilds.cache.map((guild) => {
      const channels = guild.channels.cache
        .filter((ch) => ch.isTextBased() || ch.isVoiceBased())
        .map((ch) => ({
          id: ch.id,
          name: ch.name,
          type: ch.type,
          isVoice: ch.isVoiceBased(),
          isText: ch.isTextBased(),
          parentId: ch.parentId,
        }));

      return {
        id: guild.id,
        name: guild.name,
        icon: guild.iconURL(),
        memberCount: guild.memberCount,
        ownerId: guild.ownerId,
        joinedAt: guild.joinedTimestamp,
        channels,
      };
    });
  }

  private bindEvents(): void {
    this.client.once(Events.ClientReady, (readyClient) => {
      console.info(`[DiscordBotEngine] Client ready: @${readyClient.user.tag}`);
    });

    this.client.on(Events.MessageCreate, (message: Message) => {
      this.dispatchMessagePipeline(message).catch((error) => {
        console.error(
          "[DiscordBotEngine] Uncaught error in message pipeline:",
          error,
        );
      });
    });

    this.client.on(Events.InteractionCreate, (interaction: Interaction) => {
      this.dispatchInteractionPipeline(interaction).catch((error) => {
        console.error(
          "[DiscordBotEngine] Uncaught error in interaction pipeline:",
          error,
        );
      });
    });

    this.client.on(
      Events.VoiceStateUpdate,
      (oldState: VoiceState, newState: VoiceState) => {
        this.dispatchVoiceStatePipeline(oldState, newState).catch((error) => {
          console.error(
            "[DiscordBotEngine] Uncaught error in voice state pipeline:",
            error,
          );
        });
      },
    );
  }

  private async dispatchMessagePipeline(message: Message): Promise<void> {
    if (message.author.bot) return;

    const guildConfig = message.guildId
      ? Config.getInstance().getBotGuildConfig("chatBot", message.guildId)
      : undefined;

    for (const capability of this.capabilities) {
      if (!capability.handleMessage) continue;
      try {
        const intercepted = await capability.handleMessage(
          message,
          guildConfig,
        );
        if (intercepted === true) {
          break;
        }
      } catch (error) {
        console.error(
          `[DiscordBotEngine] Error in capability '${capability.name}' handleMessage:`,
          error,
        );
      }
    }
  }

  private async dispatchInteractionPipeline(
    interaction: Interaction,
  ): Promise<void> {
    const guildConfig = interaction.guildId
      ? Config.getInstance().getBotGuildConfig("chatBot", interaction.guildId)
      : undefined;

    for (const capability of this.capabilities) {
      if (!capability.handleInteraction) continue;
      try {
        await capability.handleInteraction(interaction, guildConfig);
      } catch (error) {
        console.error(
          `[DiscordBotEngine] Error in capability '${capability.name}' handleInteraction:`,
          error,
        );
      }
    }
  }

  private async dispatchVoiceStatePipeline(
    oldState: VoiceState,
    newState: VoiceState,
  ): Promise<void> {
    const guildId = newState.guild.id || oldState.guild.id;
    const guildConfig = guildId
      ? Config.getInstance().getBotGuildConfig("chatBot", guildId)
      : undefined;

    for (const capability of this.capabilities) {
      if (!capability.handleVoiceStateUpdate) continue;
      try {
        await capability.handleVoiceStateUpdate(
          oldState,
          newState,
          guildConfig,
        );
      } catch (error) {
        console.error(
          `[DiscordBotEngine] Error in capability '${capability.name}' handleVoiceStateUpdate:`,
          error,
        );
      }
    }
  }
}

// Global Singleton Instance
let botEngineInstance: DiscordBotEngine | null = null;

export const getBotEngine = (): DiscordBotEngine => {
  if (!botEngineInstance) {
    botEngineInstance = new DiscordBotEngine();
  }
  return botEngineInstance;
};
