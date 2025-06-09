import { config } from "dotenv";
config({
  path:
    process.env.NODE_ENV === "production"
      ? ".env.production"
      : ".env.development",
});

import * as admin from "firebase-admin";
// import { CronJob } from 'cron'
import server from "./server";
import { validateEnvs } from "./helpers";
import { Config } from "./config";
import serviceAccountKey from "../service-account.json";
import PoliceBot from "./bots/police-bot";
import ChatBot from "./bots/chat-bot";

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
  const freeChannelIds = (process.env.FREE_CHANNELS ?? "").split(",");

  const policeBot = new PoliceBot({
    token: POLICE_BOT_TOKEN as string,
    allowedGuildIds,
  });
  await policeBot.login();
  policeBot.listenToNewMessages();

  const chatBot = new ChatBot({
    token: TOKEN as string,
    allowedGuildIds,
    freeChannelIds,
  });
  await chatBot.login();
  chatBot.listenToNewMessages();
  await chatBot.loadCommands();
  chatBot.listenToNewInteractions();

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
