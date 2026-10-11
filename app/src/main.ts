import { config } from "dotenv";

config({
  path:
    process.env.NODE_ENV === "production"
      ? ".env.production"
      : ".env.development",
});

import * as admin from "firebase-admin";
import serviceAccountKey from "../service-account.json";
import { Config } from "./config";
import { validateEnvs } from "./helpers";
import { roastLogRepository } from "./infrastructure/repositories";
import server from "./server";
import { getBotManager } from "./services/bot-manager";
import { registerDefaultTools } from "./tools";

const { PORT, NODE_ENV } = process.env;
const port: number | string = PORT || 3001;

console.info(`Running in ${NODE_ENV || "development"} mode`);

const main = async () => {
  const validEnvs = validateEnvs();
  if (!validEnvs) {
    process.exit(1);
  }

  // Register default tools into registry
  registerDefaultTools();

  // Init Firebase
  admin.initializeApp({
    credential: admin.credential.cert(
      serviceAccountKey as admin.ServiceAccount,
    ),
  });

  // Init Remote Config
  const remoteConfig = Config.getInstance();
  await remoteConfig.init();

  // Initialize BotManager (seeds default bots from env and auto-starts enabled instances)
  const botManager = getBotManager();
  await botManager.init();

  const httpServer = server.listen(port, () => {
    console.log(`Express app & management server listening on port ${port}!`);
  });

  const gracefulShutdown = async (signal: string) => {
    console.info(`[Process] Received ${signal}. Starting graceful shutdown...`);
    httpServer.close();
    try {
      await roastLogRepository.destroy();
      console.info("[Process] Roast log queue drained successfully.");
    } catch (err) {
      console.error("[Process] Error draining roast log queue:", err);
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
};

main();
