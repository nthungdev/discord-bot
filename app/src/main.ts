import 'dotenv/config'
import { Client, Events, GatewayIntentBits } from 'discord.js';
import app from './app'

const { TOKEN } = process.env
const port: number = 3001

const client = new Client({

  intents: [GatewayIntentBits.Guilds]
});

client.once(Events.ClientReady, readyClient => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});



client.login(TOKEN);

// Run express app
app.listen(port, function () {
  console.log(`App is listening on port ${port} !`)
})