import { config } from "dotenv";
import { deployGuildCommands } from "../discord/deployCommands";

config({
  path:
    process.env.NODE_ENV === "production"
      ? ".env.production"
      : ".env.development",
});

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  const guildArgIndex = args.findIndex(
    (arg) => arg === "--guild" || arg === "-g",
  );
  let guildId: string | undefined;

  if (guildArgIndex !== -1 && args[guildArgIndex + 1]) {
    guildId = args[guildArgIndex + 1];
  } else {
    guildId =
      args.find((arg) => !arg.startsWith("-")) || process.env.DISCORD_GUILD_ID;
  }

  const localeArgIndex = args.findIndex(
    (arg) => arg === "--locale" || arg === "-l",
  );
  const localeOverride =
    localeArgIndex !== -1 && args[localeArgIndex + 1]
      ? args[localeArgIndex + 1]
      : null;

  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!(token && clientId)) {
    console.error(
      "❌ Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in environment variables.",
    );
    process.exit(1);
  }

  if (!guildId) {
    console.error(
      "❌ Target guild ID is required.\nUsage: pnpm deploy-commands <guildId> [--locale vi|en-US]",
    );
    process.exit(1);
  }

  console.log(`🚀 Deploying slash commands to guild: ${guildId}...`);
  await deployGuildCommands(token, clientId, guildId, localeOverride);
  console.log("✅ Command deployment completed!");
}

if (require.main === module) {
  run().catch((error) => {
    console.error("❌ Failed to deploy commands:", error);
    process.exit(1);
  });
}
