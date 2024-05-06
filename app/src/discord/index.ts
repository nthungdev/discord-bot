import { Client, Events, GatewayIntentBits } from 'discord.js'
import { handleChatbot } from './chatbot'

const client = new Client({
  // Specify what kind of data the client receives
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
  ],
})

/**
 * Resolves when the bot is logged in
 * @param token the bot's token
 */
export const login = async (token: string) => {
  return new Promise<void>((resolve) => {
    client.once(Events.ClientReady, (readyClient) => {
      console.log(`Ready! Logged in as ${readyClient.user.tag}`)
      resolve()
    })
    client.login(token)
  })
}

export const registerChatbot = () => {
  // handleChatbot({
  //   allowedServers: ['1233630823496814593'],
  //   freeChannels: ['1234931286062272512']
  // })
  client.on('messageCreate', handleChatbot({
    allowedServers: (process.env.ALLOWED_SERVERS ?? '').split(','),
    freeChannels: (process.env.FREE_CHANNELS ?? '').split(',')
  }))
}

export default client
