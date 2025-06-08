import { config } from "dotenv";
config({
  path:
    process.env.NODE_ENV === "production"
      ? ".env.production"
      : ".env.development",
});

import { Events } from "discord.js";
import * as admin from "firebase-admin";
// import { CronJob } from 'cron'
import client, {
  commands,
  login,
  registerChatbot,
  loadCommands,
} from "./discord";
import server from "./server";
import { validateEnvs } from "./helpers";
import { AppCommand } from "./types";
import { Config } from "./config";
import serviceAccountKey from "../service-account.json";
import PoliceBot from "./bots/police-bot";

const { TOKEN, POLICE_BOT_TOKEN, PORT, NODE_ENV } = process.env;
const port: number | string = PORT || 3001;

console.info(`Running in ${NODE_ENV || "development"} mode`);

const main = async () => {
  const validEnvs = validateEnvs();
  if (!validEnvs) {
    process.exit(1);
  }

  // Init Firebase
  admin.initializeApp({
    credential: admin.credential.cert(
      serviceAccountKey as admin.ServiceAccount
    ),
  });

  // Init Remote Config
  await Config.getInstance().init();

  const allowedGuildIds = (process.env.ALLOWED_SERVERS ?? "").split(",");

  registerChatbot();

  await loadCommands();

  // Log the bot into Discord
  await login(TOKEN as string);

  const policeBot = new PoliceBot({
    token: POLICE_BOT_TOKEN as string,
    allowedGuildIds,
  });
  await policeBot.login();
  policeBot.listenToNewMessages();

  // TODO refactor this into a separate file
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (!allowedGuildIds.includes(interaction.guildId || "")) {
      return;
    }

    const command = commands.get(interaction.commandName);

    if (!command) {
      console.error(
        `No command matching ${interaction.commandName} was found.`
      );
      return;
    }

    try {
      await (command as AppCommand).execute(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "There was an error while executing this command!",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "There was an error while executing this command!",
          ephemeral: true,
        });
      }
    }
  });

  // const job = new CronJob(
  //   '1 0 0 1 * *', // on 00:01 AM of the first of every month
  //   () => {
  //     // TODO check in counter
  //   }, // onTick
  //   null, // onComplete
  //   true, // start
  //   'America/New_York' // timeZone
  // );

  server.listen(port, function () {
    console.log(`Express app is listening on port ${port} !`);
  });
};

main();
