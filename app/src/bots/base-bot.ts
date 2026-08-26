import { Client, Events, Interaction, Message } from "discord.js";
import { BotConfig } from "../config/types";

export interface BaseBotConfig {
  token: string;
  botConfig: BotConfig;
}

export default abstract class BaseBot {
  config: BaseBotConfig;
  protected abstract client: Client;

  constructor(config: BaseBotConfig) {
    this.config = config;
  }

  public get botId(): string {
    return this.client.user?.id ?? "default-bot";
  }

  protected abstract handleNewMessage(message: Message): Promise<void>;
  protected abstract handleNewInteraction(
    interaction: Interaction
  ): Promise<void>;

  protected getGuildConfig(guildId?: string | null) {
    if (!guildId) {
      return undefined;
    }

    const guildConfig = this.config.botConfig.guilds?.[guildId];
    if (!guildConfig) {
      return undefined;
    }

    return {
      replyChannelIds: guildConfig.replyChannelIds ?? [],
      ignoredChannelIds: guildConfig.ignoredChannelIds ?? [],
      respondToMentions: guildConfig.respondToMentions ?? false,
    };
  }

  protected shouldHandleMessage(message: Message) {
    if (!message.inGuild()) {
      return false;
    }

    const guildConfig = this.getGuildConfig(message.guildId);
    if (!guildConfig) {
      return false;
    }

    return !guildConfig.ignoredChannelIds.includes(message.channelId);
  }

  protected shouldReplyToMessage(message: Message) {
    if (!this.shouldHandleMessage(message)) {
      return false;
    }

    const guildConfig = this.getGuildConfig(message.guildId);
    if (!guildConfig) {
      return false;
    }

    const respondsInChannel = guildConfig.replyChannelIds.includes(
      message.channelId
    );
    const respondsToMention =
      guildConfig.respondToMentions &&
      !!message.mentions.members?.has(this.client.user?.id ?? "");

    return respondsInChannel || respondsToMention;
  }

  listenToNewMessages() {
    this.client.on(Events.MessageCreate, (message) => {
      if (message.inGuild() && !this.getGuildConfig(message.guildId)) {
        return;
      }

      this.handleNewMessage(message);
    });
  }

  listenToNewInteractions() {
    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!this.getGuildConfig(interaction.guildId)) {
        return;
      }

      this.handleNewInteraction(interaction);
    });
  }

  login(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.client.once(Events.ClientReady, (readyClient) => {
        console.log(`Ready! Logged in as ${readyClient.user.tag}`);
        resolve();
      });
      this.client.login(this.config.token);
    });
  }
}
