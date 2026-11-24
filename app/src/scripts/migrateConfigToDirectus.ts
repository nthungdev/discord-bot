import fs from "node:fs";
import path from "node:path";
import axios, { type AxiosInstance } from "axios";
import { config as loadDotenv } from "dotenv";
import { type AppConfigData, loadLocalConfig } from "../config";
import type { BotGuildConfig } from "../config/types";
import {
  isSafeRecordKey,
  mapAppConfigToDirectusSystemPayload,
  mapBotGuildConfigToDirectusPayload,
} from "../infrastructure/directus/config-mapper";
import type {
  DirectusGuildConfigRaw,
  DirectusSystemConfigRaw,
} from "../infrastructure/directus/types";

const DEFAULT_BOT_ID = "chatBot";
const DEFAULT_DIRECTUS_PORT = "8055";
const DEFAULT_ADMIN_EMAIL = "admin@local.dev";
const DEFAULT_ADMIN_PASSWORD = "adminpassword";
const CONFIG_FLAG_PREFIX = "--config=";
const SHORT_CONFIG_FLAG_PREFIX = "-c=";
const DIRECTUS_REQUEST_TIMEOUT_MS = 15_000;
const DIRECTUS_MAX_REDIRECTS = 0;
const LOCAL_DIRECTUS_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);
/**
 * Schema defaults provisioned by `setupDirectus.ts` for `bot_system_config`.
 * A singleton containing only these defaults (and null/empty for all other fields)
 * is treated as unconfigured so the initial migration applies `config.json`.
 */
const SYSTEM_CONFIG_SCHEMA_DEFAULTS: Readonly<Record<string, unknown>> = {
  ai_provider: "google-genai",
  ai_model_id: "gemini-4-hydrogen",
  ai_api_endpoint: "us-central1-aiplatform.googleapis.com",
  ai_location_id: "us-central1",
  ai_max_output_tokens: 8192,
  ai_max_conversation_history: 60,
  memory_store_type: "firestore",
};

if (process.env.NODE_ENV !== "test") {
  loadDotenv({
    path:
      process.env.NODE_ENV === "production"
        ? ".env.production"
        : ".env.development",
  });
  loadDotenv();

  const rootEnvPath = path.resolve(process.cwd(), "..", ".env");
  if (fs.existsSync(rootEnvPath)) {
    loadDotenv({ path: rootEnvPath });
  }
  const localRootEnvPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(localRootEnvPath)) {
    loadDotenv({ path: localRootEnvPath });
  }
  const rootDirectusEnvPath = path.resolve(
    process.cwd(),
    "..",
    ".env.directus",
  );
  if (fs.existsSync(rootDirectusEnvPath)) {
    loadDotenv({ path: rootDirectusEnvPath });
  }
}

export interface MigrateCliOptions {
  configPath?: string;
  force: boolean;
  dryRun: boolean;
  help: boolean;
}

export interface MigrateConfigOptions {
  configPath?: string;
  force?: boolean;
  dryRun?: boolean;
  client?: AxiosInstance;
  appConfig?: AppConfigData;
}

export interface MigrationSummary {
  dryRun: boolean;
  systemConfig: "updated" | "skipped";
  guilds: {
    created: number;
    updated: number;
    skipped: number;
    total: number;
  };
}

interface DirectusAdminConnectionConfig {
  directusUrl: string;
  adminEmail: string;
  adminPassword: string;
}

interface GuildMigrationEntry {
  botId: string;
  guildId: string;
  guildConfig: BotGuildConfig;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildGuildCompositeKey(botId: string, guildId: string): string {
  return JSON.stringify([botId || DEFAULT_BOT_ID, guildId]);
}

function formatSafeErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    return status ? `HTTP ${status}: ${error.message}` : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Strips Axios request config (headers, tokens, passwords) from thrown errors.
 */
export function toSafeError(error: unknown): Error {
  if (axios.isAxiosError(error)) {
    return new Error(formatSafeErrorMessage(error));
  }
  return error instanceof Error ? error : new Error(String(error));
}

function validateDirectusUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid DIRECTUS_URL: "${rawUrl}" is not a valid URL.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Invalid DIRECTUS_URL protocol "${parsed.protocol}": only http: and https: are allowed.`,
    );
  }
  if (parsed.username || parsed.password) {
    throw new Error(
      "Invalid DIRECTUS_URL: embedded username/password credentials in the URL are not allowed.",
    );
  }

  return rawUrl.replace(/\/+$/, "");
}

function isLocalDirectusUrl(directusUrl: string): boolean {
  const { hostname } = new URL(directusUrl);
  return LOCAL_DIRECTUS_HOSTNAMES.has(hostname.toLowerCase());
}

/**
 * Resolves Directus Admin API connection details from environment variables.
 */
export function resolveDirectusAdminConfig(
  env: NodeJS.ProcessEnv = process.env,
): DirectusAdminConnectionConfig {
  const directusPort = env.DIRECTUS_PORT?.trim() || DEFAULT_DIRECTUS_PORT;
  const rawDirectusUrl =
    env.DIRECTUS_URL?.trim() || `http://localhost:${directusPort}`;
  const directusUrl = validateDirectusUrl(rawDirectusUrl);

  const rawAdminEmail =
    env.DIRECTUS_ADMIN_EMAIL?.trim() || env.ADMIN_EMAIL?.trim() || "";
  const rawAdminPassword =
    env.DIRECTUS_ADMIN_PASSWORD?.trim() || env.ADMIN_PASSWORD?.trim() || "";

  const isLocal = isLocalDirectusUrl(directusUrl);
  if (
    (env.NODE_ENV === "production" || !isLocal) &&
    !(rawAdminEmail && rawAdminPassword)
  ) {
    throw new Error(
      "DIRECTUS_ADMIN_EMAIL and DIRECTUS_ADMIN_PASSWORD must be explicitly configured when NODE_ENV=production or targeting a non-local DIRECTUS_URL.",
    );
  }

  return {
    directusUrl,
    adminEmail: rawAdminEmail || DEFAULT_ADMIN_EMAIL,
    adminPassword: rawAdminPassword || DEFAULT_ADMIN_PASSWORD,
  };
}

/**
 * Authenticates against the Directus Admin API and returns a Bearer-authenticated Axios instance.
 */
async function authenticateAdmin(
  connection: DirectusAdminConnectionConfig,
): Promise<AxiosInstance> {
  let token: unknown;
  try {
    const loginRes = await axios.post(
      `${connection.directusUrl}/auth/login`,
      {
        email: connection.adminEmail,
        password: connection.adminPassword,
      },
      {
        timeout: DIRECTUS_REQUEST_TIMEOUT_MS,
        maxRedirects: DIRECTUS_MAX_REDIRECTS,
      },
    );
    token = loginRes.data?.data?.access_token;
  } catch (error) {
    throw toSafeError(error);
  }

  if (typeof token !== "string" || token.length === 0) {
    throw new Error(
      "Directus admin authentication succeeded without returning an access token.",
    );
  }

  const client = axios.create({
    baseURL: connection.directusUrl,
    headers: { Authorization: `Bearer ${token}` },
    timeout: DIRECTUS_REQUEST_TIMEOUT_MS,
    maxRedirects: DIRECTUS_MAX_REDIRECTS,
  });
  client.interceptors.response.use(
    (response) => response,
    (error) => Promise.reject(toSafeError(error)),
  );
  return client;
}

function parseInlineConfigFlag(arg: string): string | null {
  let prefix: string | null = null;
  if (arg.startsWith(CONFIG_FLAG_PREFIX)) {
    prefix = CONFIG_FLAG_PREFIX;
  } else if (arg.startsWith(SHORT_CONFIG_FLAG_PREFIX)) {
    prefix = SHORT_CONFIG_FLAG_PREFIX;
  }
  if (!prefix) {
    return null;
  }

  const value = arg.slice(prefix.length).trim();
  if (!value) {
    throw new Error(`Missing file path after ${prefix.slice(0, -1)} option.`);
  }
  return value;
}

function readNextConfigPath(argv: readonly string[], index: number): string {
  const flag = argv[index];
  const nextArg = argv[index + 1];
  const trimmed = nextArg?.trim() ?? "";
  if (!trimmed || trimmed.startsWith("-")) {
    throw new Error(`Missing file path after ${flag} option.`);
  }
  return trimmed;
}

/**
 * Parses command-line arguments for the `directus:migrate-config` script.
 */
export function parseCliArgs(argv: readonly string[]): MigrateCliOptions {
  const options: MigrateCliOptions = {
    force: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const inlineConfig = parseInlineConfigFlag(arg);
    if (inlineConfig !== null) {
      options.configPath = inlineConfig;
      continue;
    }

    switch (arg) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--force":
      case "-f":
        options.force = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--config":
      case "-c":
        options.configPath = readNextConfigPath(argv, i);
        i += 1;
        break;
      default:
        throw new Error(`Unknown CLI option: ${arg}`);
    }
  }

  return options;
}

function loadValidatedExplicitConfig(configPath: string): AppConfigData {
  const trimmed = configPath.trim();
  if (!trimmed) {
    throw new Error("Explicit --config path cannot be empty.");
  }
  const resolvedPath = path.resolve(trimmed);
  if (!(fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile())) {
    throw new Error(
      `Configuration file not found or is not a regular file: ${resolvedPath}`,
    );
  }
  return loadLocalConfig(resolvedPath);
}

function hasConfiguredSystemValues(
  existing: DirectusSystemConfigRaw | Record<string, unknown> | null,
): boolean {
  if (!existing || typeof existing !== "object") {
    return false;
  }
  for (const [key, value] of Object.entries(existing)) {
    if (key === "id" || value === null || value === undefined) {
      continue;
    }
    if (
      Object.hasOwn(SYSTEM_CONFIG_SCHEMA_DEFAULTS, key) &&
      value === SYSTEM_CONFIG_SCHEMA_DEFAULTS[key]
    ) {
      continue;
    }
    return true;
  }
  return false;
}

function extractSingletonRecord(
  data: unknown,
): DirectusSystemConfigRaw | Record<string, unknown> | null {
  if (Array.isArray(data)) {
    return (data[0] as Record<string, unknown> | undefined) ?? null;
  }
  if (isPlainRecord(data)) {
    return data;
  }
  return null;
}

async function migrateSystemConfig(
  client: AxiosInstance,
  appConfig: AppConfigData,
  options: { force: boolean; dryRun: boolean },
): Promise<"updated" | "skipped"> {
  const systemPayload = mapAppConfigToDirectusSystemPayload(appConfig);
  const existingRes = await client.get("/items/bot_system_config");
  const existingSingleton = extractSingletonRecord(existingRes.data?.data);

  if (hasConfiguredSystemValues(existingSingleton) && !options.force) {
    console.info(
      "[MigrateConfig] Skipping bot_system_config (already configured; pass --force to overwrite).",
    );
    return "skipped";
  }

  const actionLabel = options.dryRun ? "[DryRun] Would update" : "Updating";
  console.info(`[MigrateConfig] ${actionLabel} bot_system_config singleton.`);
  if (!options.dryRun) {
    await client.patch("/items/bot_system_config", systemPayload);
  }
  return "updated";
}

function collectGuildEntries(appConfig: AppConfigData): GuildMigrationEntry[] {
  const entries: GuildMigrationEntry[] = [];
  if (!isPlainRecord(appConfig.bots)) {
    return entries;
  }

  for (const [botId, botConfig] of Object.entries(appConfig.bots)) {
    if (
      !(
        isSafeRecordKey(botId) &&
        isPlainRecord(botConfig) &&
        isPlainRecord(botConfig.guilds)
      )
    ) {
      continue;
    }
    for (const [guildId, guildConfig] of Object.entries(botConfig.guilds)) {
      if (!(isSafeRecordKey(guildId) && isPlainRecord(guildConfig))) {
        continue;
      }
      entries.push({
        botId,
        guildId,
        guildConfig: guildConfig as unknown as BotGuildConfig,
      });
    }
  }

  return entries;
}

function sanitizeGuildEmojisMap(
  rawEmojis: unknown,
): Record<string, string[]> | undefined {
  if (!isPlainRecord(rawEmojis)) {
    return undefined;
  }
  const sanitized: Record<string, string[]> = {};
  for (const [emojiKey, names] of Object.entries(rawEmojis)) {
    if (!(isSafeRecordKey(emojiKey) && Array.isArray(names))) {
      continue;
    }
    Object.defineProperty(sanitized, emojiKey, {
      value: names.filter((name): name is string => typeof name === "string"),
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return sanitized;
}

function buildGuildMigrationPayload(
  entry: GuildMigrationEntry,
  appConfig: AppConfigData,
): Partial<DirectusGuildConfigRaw> {
  const payload: Partial<DirectusGuildConfigRaw> = {
    ...mapBotGuildConfigToDirectusPayload(
      entry.botId,
      entry.guildId,
      entry.guildConfig,
    ),
  };

  if (
    isPlainRecord(appConfig.guildEmojis) &&
    Object.hasOwn(appConfig.guildEmojis, entry.guildId)
  ) {
    const sanitizedEmojis = sanitizeGuildEmojisMap(
      appConfig.guildEmojis[entry.guildId],
    );
    if (sanitizedEmojis !== undefined) {
      payload.guild_emojis = sanitizedEmojis;
    }
  }

  if (
    isPlainRecord(appConfig.guildMembers) &&
    Object.hasOwn(appConfig.guildMembers, entry.guildId)
  ) {
    const members = appConfig.guildMembers[entry.guildId];
    if (Array.isArray(members)) {
      payload.guild_members = members;
    }
  }

  return payload;
}

async function fetchExistingGuildRowsByKey(
  client: AxiosInstance,
): Promise<Map<string, DirectusGuildConfigRaw>> {
  const res = await client.get("/items/bot_guild_configs?limit=-1");
  const rows = Array.isArray(res.data?.data)
    ? (res.data.data as DirectusGuildConfigRaw[])
    : [];
  const indexed = new Map<string, DirectusGuildConfigRaw>();

  for (const row of rows) {
    if (!isSafeRecordKey(row.guild_id)) {
      continue;
    }
    const botId = row.bot_id || DEFAULT_BOT_ID;
    if (!isSafeRecordKey(botId)) {
      continue;
    }
    indexed.set(buildGuildCompositeKey(botId, row.guild_id), row);
  }

  return indexed;
}

function encodeExistingGuildRowId(
  id: unknown,
  entry: GuildMigrationEntry,
): string {
  const isValidStringId = typeof id === "string" && id.trim().length > 0;
  const isValidNumberId = typeof id === "number" && Number.isFinite(id);
  if (!(isValidStringId || isValidNumberId)) {
    throw new Error(
      `Invalid or missing Directus record id for bot=${entry.botId} guild=${entry.guildId}.`,
    );
  }
  return encodeURIComponent(String(id).trim());
}

async function migrateSingleGuildEntry(
  client: AxiosInstance,
  entry: GuildMigrationEntry,
  appConfig: AppConfigData,
  existing: DirectusGuildConfigRaw | undefined,
  options: { force: boolean; dryRun: boolean },
): Promise<"created" | "updated" | "skipped"> {
  if (existing && !options.force) {
    console.info(
      `[MigrateConfig] Skipping bot=${entry.botId} guild=${entry.guildId} (already exists; pass --force to overwrite).`,
    );
    return "skipped";
  }

  const payload = buildGuildMigrationPayload(entry, appConfig);
  if (existing) {
    const encodedId = encodeExistingGuildRowId(existing.id, entry);
    const prefix = options.dryRun ? "[DryRun] Would update" : "Updating";
    console.info(
      `[MigrateConfig] ${prefix} bot=${entry.botId} guild=${entry.guildId} (id=${encodedId}).`,
    );
    if (!options.dryRun) {
      await client.patch(`/items/bot_guild_configs/${encodedId}`, payload);
    }
    return "updated";
  }

  const prefix = options.dryRun ? "[DryRun] Would create" : "Creating";
  console.info(
    `[MigrateConfig] ${prefix} bot=${entry.botId} guild=${entry.guildId}.`,
  );
  if (!options.dryRun) {
    await client.post("/items/bot_guild_configs", payload);
  }
  return "created";
}

async function migrateGuildConfigs(
  client: AxiosInstance,
  appConfig: AppConfigData,
  options: { force: boolean; dryRun: boolean },
): Promise<MigrationSummary["guilds"]> {
  const existingByKey = await fetchExistingGuildRowsByKey(client);
  const entries = collectGuildEntries(appConfig);
  const summary: MigrationSummary["guilds"] = {
    created: 0,
    updated: 0,
    skipped: 0,
    total: entries.length,
  };

  for (const entry of entries) {
    const existing = existingByKey.get(
      buildGuildCompositeKey(entry.botId, entry.guildId),
    );
    const outcome = await migrateSingleGuildEntry(
      client,
      entry,
      appConfig,
      existing,
      options,
    );
    summary[outcome] += 1;
  }

  return summary;
}

/**
 * Idempotently migrates local `config.json` system and per-guild settings into Directus.
 */
export async function migrateConfigToDirectus(
  options: MigrateConfigOptions = {},
): Promise<MigrationSummary> {
  const force = Boolean(options.force);
  const dryRun = Boolean(options.dryRun);
  const appConfig =
    options.appConfig ??
    (options.configPath !== undefined
      ? loadValidatedExplicitConfig(options.configPath)
      : loadLocalConfig());

  let client = options.client;
  if (!client) {
    const connection = resolveDirectusAdminConfig();
    console.info(
      `[MigrateConfig] Connecting to Directus at ${connection.directusUrl}...`,
    );
    client = await authenticateAdmin(connection);
  }

  try {
    const systemConfig = await migrateSystemConfig(client, appConfig, {
      force,
      dryRun,
    });
    const guilds = await migrateGuildConfigs(client, appConfig, {
      force,
      dryRun,
    });

    return {
      dryRun,
      systemConfig,
      guilds,
    };
  } catch (error) {
    throw toSafeError(error);
  }
}

function printCliHelp(): void {
  console.log(`
Usage: pnpm --prefix app directus:migrate-config [options]

Migrates local app/config.json system and per-guild settings into Directus idempotently.

Options:
  -c, --config <path>   Path to config.json (defaults to standard config lookup)
  -f, --force           Overwrite existing Directus system and guild rows
  --dry-run             Print planned operations without mutating Directus
  -h, --help            Show this help message
`);
}

if (require.main === module) {
  let cliOptions: MigrateCliOptions;
  try {
    cliOptions = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    console.error(
      "[MigrateConfig] Invalid arguments:",
      formatSafeErrorMessage(error),
    );
    process.exit(1);
  }

  if (cliOptions.help) {
    printCliHelp();
    process.exit(0);
  }

  migrateConfigToDirectus({
    configPath: cliOptions.configPath,
    force: cliOptions.force,
    dryRun: cliOptions.dryRun,
  })
    .then((summary) => {
      console.info(
        `[MigrateConfig] Completed (dryRun=${summary.dryRun}): systemConfig=${summary.systemConfig}, guilds={created=${summary.guilds.created}, updated=${summary.guilds.updated}, skipped=${summary.guilds.skipped}, total=${summary.guilds.total}}`,
      );
    })
    .catch((error) => {
      console.error(
        "[MigrateConfig] Migration failed:",
        formatSafeErrorMessage(error),
      );
      process.exit(1);
    });
}
