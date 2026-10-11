import fs from "node:fs";
import path from "node:path";
import axios, { type AxiosInstance } from "axios";
import { config } from "dotenv";

// 1. Load app environment file (.env.production / .env.development)
config({
  path:
    process.env.NODE_ENV === "production"
      ? ".env.production"
      : ".env.development",
});
config();

// 2. Load root-level .env or .env.directus as fallback so custom stack ports/credentials match
const rootEnvPath = path.resolve(process.cwd(), "..", ".env");
if (fs.existsSync(rootEnvPath)) {
  config({ path: rootEnvPath });
}
const localRootEnvPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(localRootEnvPath)) {
  config({ path: localRootEnvPath });
}
const rootDirectusEnvPath = path.resolve(process.cwd(), "..", ".env.directus");
if (fs.existsSync(rootDirectusEnvPath)) {
  config({ path: rootDirectusEnvPath });
}

export interface DirectusSetupConfig {
  directusUrl: string;
  adminEmail: string;
  adminPassword: string;
  botStaticToken: string;
  internalWebhookSecret: string;
  webhookReceiverUrl: string;
}

export function resolveDirectusSetupConfig(
  env: NodeJS.ProcessEnv = process.env,
): DirectusSetupConfig {
  const directusPort = env.DIRECTUS_PORT?.trim() || "8055";
  const defaultUrl = `http://localhost:${directusPort}`;
  const directusUrl = env.DIRECTUS_URL?.trim() || defaultUrl;
  const adminEmail =
    env.ADMIN_EMAIL?.trim() ||
    env.DIRECTUS_ADMIN_EMAIL?.trim() ||
    "admin@local.dev";
  const adminPassword =
    env.ADMIN_PASSWORD?.trim() ||
    env.DIRECTUS_ADMIN_PASSWORD?.trim() ||
    "adminpassword";
  const botStaticToken = env.DIRECTUS_BOT_TOKEN?.trim() || "";

  if (!botStaticToken) {
    throw new Error(
      "Missing required environment variable: DIRECTUS_BOT_TOKEN. Please set DIRECTUS_BOT_TOKEN in app/.env.development or your environment before running setup.",
    );
  }

  const internalWebhookSecret = env.INTERNAL_WEBHOOK_SECRET?.trim() || "";
  const webhookReceiverUrl =
    env.WEBHOOK_RECEIVER_URL?.trim() ||
    "http://host.docker.internal:3001/api/v1/webhooks/cache-invalidate";

  return {
    directusUrl,
    adminEmail,
    adminPassword,
    botStaticToken,
    internalWebhookSecret,
    webhookReceiverUrl,
  };
}

const COLLECTIONS = [
  {
    collection: "bot_guild_configs",
    meta: { note: "Guild configuration and feature flags", icon: "settings" },
    schema: {},
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, special: ["uuid"] },
      },
      {
        field: "guild_id",
        type: "string",
        schema: { is_unique: true, is_nullable: false },
        meta: { interface: "input", required: true },
      },
      {
        field: "guild_name",
        type: "string",
        meta: { interface: "input" },
      },
      {
        field: "enable_ai_roast",
        type: "boolean",
        schema: { default_value: true },
        meta: { interface: "boolean" },
      },
      {
        field: "enable_bouncergon",
        type: "boolean",
        schema: { default_value: false },
        meta: { interface: "boolean" },
      },
      {
        field: "default_locale",
        type: "string",
        schema: { default_value: "vi" },
        meta: { interface: "select-dropdown" },
      },
      {
        field: "max_roasts_per_day",
        type: "integer",
        schema: { default_value: 10 },
        meta: { interface: "input" },
      },
      {
        field: "allowed_channel_ids",
        type: "json",
        meta: { interface: "tags" },
      },
      {
        field: "scms_voice_channel_id",
        type: "string",
        meta: { interface: "input" },
      },
    ],
  },
  {
    collection: "bot_roast_presets",
    meta: {
      note: "System prompts and parameters for AI Roast",
      icon: "psychology",
    },
    schema: {},
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, special: ["uuid"] },
      },
      {
        field: "preset_name",
        type: "string",
        schema: { is_unique: true, is_nullable: false },
        meta: { interface: "input", required: true },
      },
      {
        field: "system_prompt",
        type: "text",
        schema: { is_nullable: false },
        meta: { interface: "input-multiline" },
      },
      {
        field: "temperature",
        type: "float",
        schema: { default_value: 0.8 },
        meta: { interface: "input" },
      },
      {
        field: "is_active",
        type: "boolean",
        schema: { default_value: true },
        meta: { interface: "boolean" },
      },
      {
        field: "banned_terms",
        type: "json",
        meta: { interface: "tags" },
      },
    ],
  },
  {
    collection: "bot_roast_logs",
    meta: { note: "Audit log and telemetry for roasts", icon: "history_edu" },
    schema: {},
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, special: ["uuid"] },
      },
      { field: "guild_id", type: "string", meta: { interface: "input" } },
      { field: "channel_id", type: "string", meta: { interface: "input" } },
      {
        field: "caller_user_id",
        type: "string",
        meta: { interface: "input" },
      },
      {
        field: "target_user_id",
        type: "string",
        meta: { interface: "input" },
      },
      { field: "topic", type: "string", meta: { interface: "input" } },
      {
        field: "generated_text",
        type: "text",
        meta: { interface: "input-multiline" },
      },
      {
        field: "execution_time_ms",
        type: "integer",
        meta: { interface: "input" },
      },
      {
        field: "feedback_rating",
        type: "integer",
        meta: { interface: "input" },
      },
    ],
  },
  {
    collection: "bot_match_logs",
    meta: { note: "Bouncergon 10-man match records", icon: "sports_esports" },
    schema: {},
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, special: ["uuid"] },
      },
      { field: "guild_id", type: "string", meta: { interface: "input" } },
      { field: "team_a_roster", type: "json", meta: { interface: "tags" } },
      { field: "team_b_roster", type: "json", meta: { interface: "tags" } },
      {
        field: "score_team_a",
        type: "integer",
        meta: { interface: "input" },
      },
      {
        field: "score_team_b",
        type: "integer",
        meta: { interface: "input" },
      },
      { field: "winner", type: "string", meta: { interface: "input" } },
      { field: "mvp_user_id", type: "string", meta: { interface: "input" } },
    ],
  },
  {
    collection: "bot_user_profiles",
    meta: { note: "User privacy opt-out and reputation", icon: "badge" },
    schema: {},
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, special: ["uuid"] },
      },
      {
        field: "user_id",
        type: "string",
        schema: { is_unique: true, is_nullable: false },
        meta: { interface: "input", required: true },
      },
      {
        field: "opt_out_roast",
        type: "boolean",
        schema: { default_value: false },
        meta: { interface: "boolean" },
      },
      {
        field: "opted_out_guild_ids",
        type: "json",
        meta: { interface: "tags" },
      },
      {
        field: "reputation_score",
        type: "integer",
        schema: { default_value: 1000 },
        meta: { interface: "input" },
      },
    ],
  },
];

async function authenticate(
  config: DirectusSetupConfig,
): Promise<AxiosInstance> {
  const loginRes = await axios.post(`${config.directusUrl}/auth/login`, {
    email: config.adminEmail,
    password: config.adminPassword,
  });
  const token = loginRes.data.data.access_token;
  return axios.create({
    baseURL: config.directusUrl,
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function ensureCollections(client: AxiosInstance) {
  const res = await client.get("/collections");
  const existingNames = new Set(
    res.data.data.map((c: { collection: string }) => c.collection),
  );

  for (const col of COLLECTIONS) {
    if (!existingNames.has(col.collection)) {
      console.log(`Creating collection ${col.collection}...`);
      await client.post("/collections", col);
    }
  }
}

async function ensurePolicy(client: AxiosInstance): Promise<string> {
  const policiesRes = await client.get(
    "/policies?filter[name][_eq]=bot-service-policy",
  );
  let policyId = policiesRes.data.data[0]?.id;

  if (!policyId) {
    console.log("Creating bot-service-policy...");
    const createPolicyRes = await client.post("/policies", {
      name: "bot-service-policy",
      icon: "smart_toy",
      description: "Policy for Discord Bot backend",
      app_access: false,
      admin_access: false,
    });
    policyId = createPolicyRes.data.data.id;
  }

  const existingPermsRes = await client.get(
    `/permissions?filter[policy][_eq]=${policyId}&limit=-1`,
  );
  const existingPerms: Array<{ collection: string; action: string }> =
    existingPermsRes.data.data || [];
  const existingPermSet = new Set(
    existingPerms.map((p) => `${p.collection}:${p.action}`),
  );

  const actions = ["create", "read", "update", "delete"];
  for (const col of COLLECTIONS) {
    for (const action of actions) {
      const key = `${col.collection}:${action}`;
      if (!existingPermSet.has(key)) {
        await client.post("/permissions", {
          policy: policyId,
          collection: col.collection,
          action,
          permissions: {},
          validation: {},
          fields: ["*"],
        });
      }
    }
  }

  return policyId;
}

async function ensureWebhook(
  client: AxiosInstance,
  config: DirectusSetupConfig,
) {
  if (!config.internalWebhookSecret) {
    console.log(
      "[SetupDirectus] Notice: INTERNAL_WEBHOOK_SECRET is not configured. Skipping webhook provisioning.",
    );
    return;
  }
  try {
    const webhooksRes = await client.get(
      "/webhooks?filter[name][_eq]=bot-cache-invalidation",
    );
    if (webhooksRes.data.data.length === 0) {
      console.log("Provisioning cache invalidation webhook...");
      await client.post("/webhooks", {
        name: "bot-cache-invalidation",
        method: "POST",
        url: config.webhookReceiverUrl,
        status: "active",
        data: true,
        actions: ["create", "update", "delete"],
        collections: ["bot_guild_configs", "bot_roast_presets"],
        headers: [
          {
            header: "x-webhook-secret",
            value: config.internalWebhookSecret,
          },
        ],
      });
    }
  } catch (err: unknown) {
    const errorDetails = axios.isAxiosError(err)
      ? err.response?.data || err.message
      : String(err);
    console.warn(
      "[SetupDirectus] Notice: could not automatically provision webhook:",
      errorDetails,
    );
  }
}

async function ensureRoleAndAccess(
  client: AxiosInstance,
  policyId: string,
): Promise<string> {
  const rolesRes = await client.get("/roles?filter[name][_eq]=bot-service");
  let roleId = rolesRes.data.data[0]?.id;

  if (!roleId) {
    console.log("Creating bot-service role...");
    const createRoleRes = await client.post("/roles", {
      name: "bot-service",
      icon: "smart_toy",
      description: "Service role for Discord Bot backend",
    });
    roleId = createRoleRes.data.data.id;
  }

  const accessRes = await client.get(
    `/access?filter[role][_eq]=${roleId}&filter[policy][_eq]=${policyId}`,
  );
  if (accessRes.data.data.length === 0) {
    console.log("Linking policy to role via /access...");
    await client.post("/access", {
      role: roleId,
      policy: policyId,
    });
  }

  return roleId;
}

async function ensureServiceUser(
  client: AxiosInstance,
  roleId: string,
  botToken: string,
) {
  const usersRes = await client.get(
    "/users?filter[email][_eq]=bot-service@local.dev",
  );
  const userId = usersRes.data.data[0]?.id;

  if (!userId) {
    console.log("Creating bot-service user with static token...");
    await client.post("/users", {
      first_name: "Bot",
      last_name: "Service",
      email: "bot-service@local.dev",
      role: roleId,
      token: botToken,
      status: "active",
    });
  } else {
    await client.patch(`/users/${userId}`, { token: botToken });
  }
}

async function ensurePresets(client: AxiosInstance) {
  const presetsRes = await client.get(
    "/items/bot_roast_presets?filter[preset_name][_eq]=default",
  );
  if (presetsRes.data.data.length === 0) {
    console.log("Seeding default roast preset...");
    await client.post("/items/bot_roast_presets", {
      preset_name: "default",
      system_prompt:
        "You are a sharp, witty Discord bot comedian. Generate a playful, comedic roast of the targeted user based on the provided context.",
      temperature: 0.8,
      is_active: true,
      banned_terms: ["hate speech", "slur", "harassment"],
    });
  }
}

export async function runDirectusSetup(): Promise<void> {
  const setupConfig = resolveDirectusSetupConfig();
  console.log(`Connecting to Directus at ${setupConfig.directusUrl}...`);
  const client = await authenticate(setupConfig);
  console.log("Logged in as admin.");

  await ensureCollections(client);
  const policyId = await ensurePolicy(client);
  const roleId = await ensureRoleAndAccess(client, policyId);
  await ensureServiceUser(client, roleId, setupConfig.botStaticToken);
  await ensurePresets(client);
  await ensureWebhook(client, setupConfig);

  console.log("Directus setup completed successfully!");
}

if (require.main === module) {
  runDirectusSetup().catch((err) => {
    console.error("Setup failed:", err.response?.data || err.message);
    process.exit(1);
  });
}
