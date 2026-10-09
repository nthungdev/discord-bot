import { config } from "dotenv";
import { deployGuildCommands } from "../discord/deployCommands";

config({
  path:
    process.env.NODE_ENV === "production"
      ? ".env.production"
      : ".env.development",
});

export const SUPPORTED_LOCALES = ["vi", "en-US"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export interface DeployArgsResult {
  guildId?: string;
  localeOverride?: SupportedLocale | null;
  error?: string;
}

interface FlagParseState {
  guildId?: string;
  localeOverride?: SupportedLocale | null;
  positionals: string[];
}

function extractFlagValue(
  flag: string,
  value: string | undefined,
): string | { error: string } {
  if (!value || value.startsWith("-")) {
    return { error: `Missing value for ${flag} flag.` };
  }
  return value;
}

function validateLocale(value: string): SupportedLocale | { error: string } {
  if (!SUPPORTED_LOCALES.includes(value as SupportedLocale)) {
    return {
      error: `Unsupported locale "${value}". Supported values are: ${SUPPORTED_LOCALES.join(", ")}`,
    };
  }
  return value as SupportedLocale;
}

function handleFlag(
  arg: string,
  next: string | undefined,
  state: FlagParseState,
): { consumedNext: boolean; error?: string } {
  if (arg === "--guild" || arg === "-g") {
    const parsed = extractFlagValue(arg, next);
    if (typeof parsed !== "string") {
      return { consumedNext: false, error: parsed.error };
    }
    state.guildId = parsed;
    return { consumedNext: true };
  }

  if (arg === "--locale" || arg === "-l") {
    const parsed = extractFlagValue(arg, next);
    if (typeof parsed !== "string") {
      return { consumedNext: false, error: parsed.error };
    }
    const validated = validateLocale(parsed);
    if (typeof validated !== "string") {
      return { consumedNext: false, error: validated.error };
    }
    state.localeOverride = validated;
    return { consumedNext: true };
  }

  if (arg.startsWith("-")) {
    return { consumedNext: false, error: `Unknown flag: ${arg}` };
  }

  state.positionals.push(arg);
  return { consumedNext: false };
}

/**
 * Parses and validates CLI arguments for slash command deployment.
 */
export function parseDeployArgs(args: readonly string[]): DeployArgsResult {
  const state: FlagParseState = { positionals: [] };

  for (let i = 0; i < args.length; i++) {
    const res = handleFlag(args[i], args[i + 1], state);
    if (res.error) {
      return { error: res.error };
    }
    if (res.consumedNext) {
      i++;
    }
  }

  return {
    guildId: state.guildId ?? state.positionals[0],
    localeOverride: state.localeOverride ?? null,
  };
}

export async function run(
  args: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const parsed = parseDeployArgs(args);
  if (parsed.error) {
    console.error(`❌ ${parsed.error}`);
    console.error(
      "Usage: pnpm deploy-commands <guildId> [--locale vi|en-US] [--guild <guildId>]",
    );
    process.exit(1);
  }

  const guildId = parsed.guildId || process.env.DISCORD_GUILD_ID;
  const localeOverride = parsed.localeOverride;

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
