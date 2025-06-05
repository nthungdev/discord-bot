import { Client, Events } from "discord.js";

export default abstract class BaseBot {
  abstract token: string;
  abstract client: Client;

  login(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.client.once(Events.ClientReady, (readyClient) => {
        console.log(`Ready! Logged in as ${readyClient.user.tag}`);
        resolve();
      });
      this.client.login(this.token);
    });
  }

  abstract activate(): void;
}
