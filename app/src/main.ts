import { config } from "dotenv";

config({
  path:
    process.env.NODE_ENV === "production"
      ? ".env.production"
      : ".env.development",
});

import { Config, ConfigParameter, resolveConfigSource } from "./config";
import { validateEnvs } from "./helpers";
import { roastLogRepository } from "./infrastructure/repositories";
import server from "./server";
import { getBotManager } from "./services/bot-manager";
import { registerDefaultTools } from "./tools";
import { initFirebaseIfNeeded } from "./utils/firebase";

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

  // Pre-init Firebase only when Remote Config is the active config source
  const initialConfigSource = resolveConfigSource();
  if (initialConfigSource === "remote-config") {
    initFirebaseIfNeeded({
      configSource: initialConfigSource,
      memoryStoreType: process.env.MEMORY_STORE_TYPE,
    });
  }

  // Init Config (Directus, Firebase Remote Config, or local config.json)
  const remoteConfig = Config.getInstance();
  await remoteConfig.init();

  // Initialize Firebase after config resolution if Firestore or Vertex AI is configured
  const configSource = remoteConfig.getConfigSource();
  const memoryStoreType =
    process.env.MEMORY_STORE_TYPE ||
    remoteConfig.getConfigValue(ConfigParameter.memoryStoreType);
  const aiProvider = remoteConfig.getConfigValue(ConfigParameter.aiProvider);
  initFirebaseIfNeeded({
    configSource,
    memoryStoreType,
    aiProvider,
  });

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
