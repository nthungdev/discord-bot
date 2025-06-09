import { Client, Events, Interaction, Message } from "discord.js";

export interface BaseBotConfig {
  token: string;
  /** If not empty, the bot will only respond to messages in these guilds */
  allowedGuildIds?: string[];
  /** If not empty, the bot will not respond to messages in these guilds */
  disallowedGuildIds?: string[];
}

export default abstract class BaseBot {
  config: BaseBotConfig;
  protected abstract client: Client;

  constructor(config: BaseBotConfig) {
    this.config = config;
  }

  protected abstract handleNewMessage(message: Message): Promise<void>;
  protected abstract handleNewInteraction(
    interaction: Interaction
  ): Promise<void>;

  listenToNewMessages() {
    this.client.on(Events.MessageCreate, (message) => {
      if (message.inGuild()) {
        const notInAllowedGuilds =
          this.config.allowedGuildIds &&
          !this.config.allowedGuildIds.includes(message.guildId);
        const inDisallowedGuilds =
          this.config.disallowedGuildIds &&
          !!this.config.disallowedGuildIds.includes(message.guildId);
        if (notInAllowedGuilds || inDisallowedGuilds) {
          return;
        }
      }
      this.handleNewMessage(message);
    });
  }

  listenToNewInteractions() {
    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (
        this.config.allowedGuildIds &&
        !this.config.allowedGuildIds.includes(interaction.guildId || "")
      ) {
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
