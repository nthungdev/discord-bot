import { Client, Events, GatewayIntentBits } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

/**
 * Resolves when the bot is logged in
 * @param token the bot's token
 * @returns
 */
const login = async (token: string) => {
  return new Promise<void>((resolve, reject) => {

    client.once(Events.ClientReady, readyClient => {
      console.log(`Ready! Logged in as ${readyClient.user.tag}`);
      resolve()
    });

    client.login(token);
  })
}

export { login }

export default client