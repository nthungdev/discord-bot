import fs from 'node:fs'
import path from 'node:path'
import { Client, Collection, Events, GatewayIntentBits, REST, Routes } from 'discord.js'
import { handleChatbot } from './chatbot'

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
export const commands = new Collection()

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

export const registerCommands = async (token: string, clientId: string, guildId: string) => {
  const commandsToReg = [];
  // Grab all the command folders from the commands directory you created earlier
  const foldersPath = path.join(__dirname, 'commands');
  const commandFolders = fs.readdirSync(foldersPath);

  for (const folder of commandFolders) {
    // Grab all the command files from the commands directory you created earlier
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts'));
    // Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const command = require(filePath);
      if ('data' in command && 'execute' in command) {
        commandsToReg.push(command.data.toJSON());
      } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
      }
    }
  }

  // Construct and prepare an instance of the REST module
  const rest = new REST().setToken(token);

  // deploy commands
  try {
    console.log(`Started refreshing ${commandsToReg.length} application (/) commands.`);

    // The put method is used to fully refresh all commands in the guild with the current set
    const data = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commandsToReg },
    ) as any[]; // Add type assertion here

    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    // And of course, make sure you catch and log any errors!
    console.error(error);
  }


  (() => {
    const foldersPath = path.join(__dirname, 'commands');
    const commandFolders = fs.readdirSync(foldersPath);

    for (const folder of commandFolders) {
      const commandsPath = path.join(foldersPath, folder);
      const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts'));
      for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
          commands.set(command.data.name, command);
        } else {
          console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
      }
    }
  })()
}

export default client
