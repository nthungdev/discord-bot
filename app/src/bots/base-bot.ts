import { Client, Events, Message } from "discord.js";

export interface BaseBotConfig {
  token: string;
  allowedGuildIds?: string[];
  disallowedGuildIds?: string[];
}

export default abstract class BaseBot {
  config: BaseBotConfig;
  protected abstract client: Client;

  constructor(config: BaseBotConfig) {
    this.config = config;
  }

  abstract activate(): void;

  protected abstract handleNewMessage(message: Message): Promise<void>;

  listenToNewMessages() {
    this.client.on(Events.MessageCreate, (message) => {
      if (message.inGuild()) {
        const notInAllowedGuilds = !this.config.allowedGuildIds?.includes(
          message.guildId
        );
        const inDisallowedGuilds = !!this.config.disallowedGuildIds?.includes(
          message.guildId
        );
        if (notInAllowedGuilds || inDisallowedGuilds) {
          return;
        }
      }
      this.handleNewMessage(message);
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
