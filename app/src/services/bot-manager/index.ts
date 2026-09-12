import type { Client, GuildBasedChannel } from "discord.js";
import type BaseBot from "../../bots/base-bot";
import ChatBot from "../../bots/chat-bot";
import PoliceBot from "../../bots/police-bot";
import { Config, ConfigParameter } from "../../config";
import type { BotConfig } from "../../config/types";
import {
  type BotLifecycleStatus,
  type BotRegistrationInput,
  type BotRuntimeMetrics,
  decryptSecret,
  encryptSecret,
  type IBotRegistryStore,
  type JoinedGuildDetail,
  maskToken,
  type RegisteredBotRecord,
} from "../../shared";
import { getMetricsService } from "../metrics";
import { FirestoreBotRegistryStore } from "./firestore-store";
import { LocalFileBotRegistryStore } from "./local-store";

export class BotManager {
  private store: IBotRegistryStore;
  private activeBots: Map<string, BaseBot> = new Map();
  private botStatuses: Map<string, BotLifecycleStatus> = new Map();
  private botStartTimes: Map<string, number> = new Map();
  private botErrors: Map<string, string> = new Map();
  private isInitialized = false;

  constructor(store?: IBotRegistryStore) {
    if (store) {
      this.store = store;
    } else {
      const storeType =
        process.env.BOT_REGISTRY_STORE_TYPE ||
        (process.env.NODE_ENV === "production" ? "firestore" : "local");
      this.store =
        storeType === "firestore"
          ? new FirestoreBotRegistryStore()
          : new LocalFileBotRegistryStore();
    }
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const existing = await this.store.getAll();
      if (existing.length === 0) {
        // Seed default bots from environment variables if present
        await this.seedDefaultBots();
      }

      // Auto-start configured bots
      const registered = await this.store.getAll();
      for (const bot of registered) {
        if (bot.autoStart) {
          try {
            await this.startBot(bot.id);
          } catch (error) {
            console.error(
              `[BotManager] Auto-start failed for bot ${bot.id}:`,
              error,
            );
          }
        }
      }
    } catch (error) {
      console.error("[BotManager] Initialization error:", error);
    }

    this.isInitialized = true;
  }

  private async seedDefaultBots(): Promise<void> {
    const { CHATBOT_TOKEN, POLICE_BOT_TOKEN } = process.env;
    const now = Date.now();

    if (CHATBOT_TOKEN) {
      const chatBotRecord: RegisteredBotRecord = {
        id: "chatBot",
        name: "Gemini Chat Bot",
        botType: "chatBot",
        clientId: process.env.DISCORD_CLIENT_ID || "",
        encryptedToken: encryptSecret(CHATBOT_TOKEN),
        autoStart: true,
        assignedGuildIds: [],
        createdAt: now,
        updatedAt: now,
      };
      await this.store.save(chatBotRecord);
    }

    if (POLICE_BOT_TOKEN) {
      const policeBotRecord: RegisteredBotRecord = {
        id: "policeBot",
        name: "Police Moderation Bot",
        botType: "policeBot",
        clientId: process.env.POLICE_BOT_CLIENT_ID || "",
        encryptedToken: encryptSecret(POLICE_BOT_TOKEN),
        autoStart: true,
        assignedGuildIds: [],
        createdAt: now,
        updatedAt: now,
      };
      await this.store.save(policeBotRecord);
    }
  }

  async registerBot(input: BotRegistrationInput): Promise<RegisteredBotRecord> {
    const now = Date.now();
    const existing = await this.store.get(input.id);
    if (existing) {
      throw new Error(`Bot with ID '${input.id}' already exists.`);
    }

    const record: RegisteredBotRecord = {
      id: input.id,
      name: input.name,
      botType: input.botType,
      clientId: input.clientId,
      encryptedToken: encryptSecret(input.token),
      autoStart: input.autoStart ?? true,
      assignedGuildIds: input.assignedGuildIds ?? [],
      customConfigOverrides: input.customConfigOverrides,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.save(record);

    getMetricsService().emitActivity({
      type: "bot_status_changed",
      botId: record.id,
      summary: `Bot '${record.name}' (${record.id}) was registered`,
    });

    if (record.autoStart) {
      await this.startBot(record.id);
    }

    return record;
  }

  async unregisterBot(id: string): Promise<void> {
    await this.stopBot(id);
    await this.store.delete(id);

    this.botStatuses.delete(id);
    this.botStartTimes.delete(id);
    this.botErrors.delete(id);

    getMetricsService().emitActivity({
      type: "bot_status_changed",
      botId: id,
      summary: `Bot '${id}' was unregistered`,
    });
  }

  async updateBot(
    id: string,
    updates: Partial<BotRegistrationInput>,
  ): Promise<RegisteredBotRecord> {
    const existing = await this.store.get(id);
    if (!existing) {
      throw new Error(`Bot with ID '${id}' not found.`);
    }

    const updated: RegisteredBotRecord = {
      ...existing,
      name: updates.name ?? existing.name,
      botType: updates.botType ?? existing.botType,
      clientId: updates.clientId ?? existing.clientId,
      encryptedToken: updates.token
        ? encryptSecret(updates.token)
        : existing.encryptedToken,
      autoStart: updates.autoStart ?? existing.autoStart,
      assignedGuildIds: updates.assignedGuildIds ?? existing.assignedGuildIds,
      customConfigOverrides:
        updates.customConfigOverrides ?? existing.customConfigOverrides,
      updatedAt: Date.now(),
    };

    await this.store.save(updated);
    return updated;
  }

  async startBot(id: string): Promise<void> {
    const record = await this.store.get(id);
    if (!record) {
      throw new Error(`Bot with ID '${id}' not registered.`);
    }

    if (this.activeBots.has(id)) {
      return; // Already running
    }

    this.botStatuses.set(id, "INITIALIZING");
    this.botErrors.delete(id);

    try {
      const plainToken = decryptSecret(record.encryptedToken);
      let botPolicies: BotConfig = { guilds: {} };
      try {
        const currentPolicies = Config.getInstance().getConfigValue(
          ConfigParameter.bots,
        );
        botPolicies = (record.id === "policeBot"
          ? currentPolicies.policeBot
          : currentPolicies.chatBot) || { guilds: {} };
      } catch {
        // Fallback
      }

      let botInstance: BaseBot;
      if (record.botType === "policeBot") {
        botInstance = new PoliceBot({
          id: record.id,
          token: plainToken,
          botConfig: botPolicies,
        });
        await botInstance.login();
        botInstance.listenToNewMessages();
      } else {
        // default / chatBot
        const chatBot = new ChatBot({
          id: record.id,
          token: plainToken,
          botConfig: botPolicies,
        });
        await chatBot.login();
        chatBot.listenToNewMessages();
        await chatBot.loadCommands();
        chatBot.listenToNewInteractions();
        botInstance = chatBot;
      }

      this.activeBots.set(id, botInstance);
      this.botStatuses.set(id, "ONLINE");
      this.botStartTimes.set(id, Date.now());

      getMetricsService().emitActivity({
        type: "bot_status_changed",
        botId: id,
        summary: `Bot '${record.name}' logged in and is ONLINE`,
      });
    } catch (error) {
      const errMsg =
        error instanceof Error ? error.message : "Unknown login error";
      this.botStatuses.set(id, "ERROR");
      this.botErrors.set(id, errMsg);

      getMetricsService().emitActivity({
        type: "error",
        botId: id,
        summary: `Failed to start bot '${record.name}': ${errMsg}`,
      });
      throw error;
    }
  }

  async stopBot(id: string): Promise<void> {
    const bot = this.activeBots.get(id);
    if (!bot) {
      this.botStatuses.set(id, "STOPPED");
      return;
    }

    try {
      await bot.destroy();
    } catch (err) {
      console.warn(`[BotManager] Error destroying client for ${id}:`, err);
    }

    this.activeBots.delete(id);
    this.botStatuses.set(id, "STOPPED");
    this.botStartTimes.delete(id);

    getMetricsService().emitActivity({
      type: "bot_status_changed",
      botId: id,
      summary: `Bot '${id}' was STOPPED`,
    });
  }

  async restartBot(id: string): Promise<void> {
    await this.stopBot(id);
    await this.startBot(id);
  }

  getActiveBot(id: string): BaseBot | undefined {
    return this.activeBots.get(id);
  }

  async getBot(id: string): Promise<BotRuntimeMetrics | null> {
    const record = await this.store.get(id);
    if (!record) return null;
    return this.buildRuntimeMetrics(record);
  }

  async getAllBots(): Promise<BotRuntimeMetrics[]> {
    const records = await this.store.getAll();
    return Promise.all(records.map((r) => this.buildRuntimeMetrics(r)));
  }

  private buildRuntimeMetrics(record: RegisteredBotRecord): BotRuntimeMetrics {
    const active = this.activeBots.get(record.id);
    const client: Client | undefined = active?.getClient();
    const status: BotLifecycleStatus =
      this.botStatuses.get(record.id) || "STOPPED";

    const ping =
      client?.ws?.ping !== undefined && client.ws.ping >= 0
        ? client.ws.ping
        : -1;
    const uptimeSeconds = this.botStartTimes.has(record.id)
      ? Math.floor(
          (Date.now() - (this.botStartTimes.get(record.id) || 0)) / 1000,
        )
      : 0;

    const joinedGuilds = client?.guilds?.cache ? client.guilds.cache.size : 0;
    const totalChannels = client?.channels?.cache
      ? client.channels.cache.size
      : 0;

    const plainToken = decryptSecret(record.encryptedToken);

    return {
      id: record.id,
      name: record.name,
      botType: record.botType,
      status,
      clientId: record.clientId,
      autoStart: record.autoStart,
      userTag: client?.user?.tag,
      avatarUrl: client?.user?.displayAvatarURL(),
      gatewayPingMs: ping,
      uptimeSeconds,
      joinedGuildsCount: joinedGuilds,
      totalChannelsCount: totalChannels,
      messageCount24h: 0,
      errorCount24h: this.botErrors.has(record.id) ? 1 : 0,
      lastError: this.botErrors.get(record.id),
      lastStartedAt: this.botStartTimes.get(record.id),
      assignedGuildIds: record.assignedGuildIds,
      tokenMasked: maskToken(plainToken),
    };
  }

  async getJoinedGuildDetails(botId: string): Promise<JoinedGuildDetail[]> {
    const bot = this.activeBots.get(botId);
    if (!bot) return [];

    const client = bot.getClient();
    if (!client?.guilds?.cache) return [];

    const results: JoinedGuildDetail[] = [];
    const botConfig = Config.getInstance().getConfigValue(ConfigParameter.bots);

    for (const guild of client.guilds.cache.values()) {
      const channels: GuildBasedChannel[] = Array.from(
        guild.channels.cache.values(),
      );
      const summaryChannels = channels.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        parentId: c.parentId,
        isText: c.isTextBased(),
        isVoice: c.isVoiceBased(),
      }));

      const guildPolicy =
        botId === "policeBot"
          ? botConfig.policeBot?.guilds?.[guild.id]
          : botConfig.chatBot?.guilds?.[guild.id];

      results.push({
        id: guild.id,
        name: guild.name,
        icon: guild.iconURL(),
        memberCount: guild.memberCount,
        channels: summaryChannels,
        botConfig: guildPolicy,
      });
    }

    return results;
  }
}

let _botManager: BotManager | null = null;

export function getBotManager(): BotManager {
  if (!_botManager) {
    _botManager = new BotManager();
  }
  return _botManager;
}
