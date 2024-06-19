import { Client, Collection, Events, GatewayIntentBits } from 'discord.js'
import { handleChatbot } from './chatbot'
import { parseCommands } from './helpers'
import { AppCommand } from '../types'

const client = new Client({
  // Specify what kind of data the client receives
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
  ],
})

// TODO consider extending the Client class to have this prop.
// READ: https://www.typescriptlang.org/docs/handbook/declaration-merging.html#module-augmentation
export const commands = new Collection<string, AppCommand>()

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
  client.on(Events.MessageCreate, handleChatbot({
    allowedServers: (process.env.ALLOWED_SERVERS ?? '').split(','),
    freeChannels: (process.env.FREE_CHANNELS ?? '').split(',')
  }))
}

/**
 * Make sure the commands are deployed before logging in
 */
export const loadCommands = async () => {
  const commandsToReg = await parseCommands()
  commandsToReg.forEach((command) => {
    commands.set(command.data.name, command);
  })
  console.log(`Loaded ${commands.size} commands.`)
}

export default client
