import { config } from 'dotenv'
config({
  path:
    process.env.NODE_ENV === 'production'
      ? '.env.production'
      : '.env.development',
})

import client, { commands, login, registerChatbot, registerCommands } from './discord'
import { CronJob } from 'cron'
import app from './app'
import { Events } from 'discord.js'

const { TOKEN, PORT, CLIENT_ID } = process.env
const port: number | string = PORT || 3001

const main = async () => {
  // Validate environment variables
  const requiredEnvs = [
    'TOKEN',
    'SLEEP_REMINDER_SERVER_ID',
    'AI_API_KEY',
    'CLIENT_ID'
  ]
  const missingEnvs = requiredEnvs.filter((env) => !(env in process.env))
  if (missingEnvs.length !== 0) {
    console.error(
      `Missing ${missingEnvs
        .map((env) => `'${env}'`)
        .join(' ')} environment variables!`
    )
    process.exit(1)
  }

  registerChatbot()


  // registerCommands('1233630823496814593')
  // Bluegon Land guild id
  await registerCommands(TOKEN as string, CLIENT_ID as string, '1233630823496814593')

  // Log the bot into Discord
  await login(TOKEN as string)

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await (command as { execute: (interaction: any) => Promise<void> }).execute(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
      }
    }
  });

  // registerCommands('')


  const job = new CronJob(
    '1 0 0 1 * *', // on 00:01 AM of the first of every month
    () => {
      // TODO check in counter
    }, // onTick
    null, // onComplete
    true, // start
    'America/New_York' // timeZone
  );

  // Run express app
  app.listen(port, function () {
    console.log(`App is listening on port ${port} !`)
  })
}

main()
