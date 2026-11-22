import fs from "node:fs";
import path from "node:path";
import axios, { type AxiosInstance } from "axios";
import { config } from "dotenv";

// 1. Load app environment file (.env.production / .env.development) when not in test
if (process.env.NODE_ENV !== "test") {
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
  const rootDirectusEnvPath = path.resolve(
    process.cwd(),
    "..",
    ".env.directus",
  );
  if (fs.existsSync(rootDirectusEnvPath)) {
    config({ path: rootDirectusEnvPath });
  }
}

export interface DirectusSetupConfig {
  directusUrl: string;
  adminEmail: string;
  adminPassword: string;
  botStaticToken: string;
  internalWebhookSecret: string;
  webhookReceiverUrl: string;
}

export interface DirectusFieldDefinition {
  field: string;
  type: string;
  schema?: Record<string, unknown> | null;
  meta?: Record<string, unknown>;
}

export interface DirectusCollectionDefinition {
  collection: string;
  meta: {
    note: string;
    icon: string;
    singleton?: boolean;
  };
  schema: Record<string, unknown>;
  fields: DirectusFieldDefinition[];
}

export const LEGACY_GUILD_CONFIG_FIELDS = [
  "enable_ai_roast",
  "default_locale",
  "allowed_channel_ids",
  "max_roasts_per_day",
  "enable_bouncergon",
  "valorant_features",
] as const;

const DEFAULT_BOT_ID = "chatBot";
const MIGRATION_PAGE_SIZE = 100;

export const POLICY_ACTIONS_BY_COLLECTION: Record<string, readonly string[]> = {
  bot_system_config: ["read"],
  bot_guild_configs: ["create", "read", "update"],
  bot_roast_presets: ["read"],
  bot_roast_logs: ["create", "read"],
  bot_match_logs: ["create", "read", "update"],
  bot_user_profiles: ["create", "read", "update"],
};

const GROUP_DEFINITIONS = {
  coreIdentity: "group_core_identity",
  smartReply: "group_smart_reply",
  roast: "group_roast",
  moderation: "group_moderation",
  voiceBouncer: "group_voice_bouncer",
  matchmaking: "group_matchmaking",
  valorant: "group_valorant",
  voiceCompanion: "group_voice_companion",
  guildMetadata: "group_guild_metadata",
} as const;

function createGroupField(
  field: string,
  headerIcon: string,
  start: "open" | "closed" = "closed",
): DirectusFieldDefinition {
  return {
    field,
    type: "alias",
    schema: null,
    meta: {
      interface: "group-detail",
      special: ["alias", "no-data", "group"],
      options: {
        headerIcon,
        start,
      },
    },
  };
}

function createDropdownOptions(
  choices: Array<{ text: string; value: string }>,
  allowNone = false,
): Record<string, unknown> {
  return allowNone ? { choices, allowNone: true } : { choices };
}

const LOCALE_CHOICES = [
  { text: "Vietnamese (vi)", value: "vi" },
  { text: "English (en-US)", value: "en-US" },
];

/**
 * Resolves Directus provisioning configuration from environment variables.
 */
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

export const COLLECTIONS: DirectusCollectionDefinition[] = [
  {
    collection: "bot_system_config",
    meta: {
      note: "Global bot system configuration",
      icon: "tune",
      singleton: true,
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
        field: "ai_provider",
        type: "string",
        schema: { default_value: "google-genai" },
        meta: {
          interface: "select-dropdown",
          options: createDropdownOptions([
            { text: "Antigravity", value: "antigravity" },
            { text: "Google GenAI", value: "google-genai" },
            { text: "Vertex AI", value: "vertex" },
          ]),
        },
      },
      {
        field: "ai_model_id",
        type: "string",
        schema: { default_value: "gemini-3.6-flash" },
        meta: { interface: "input" },
      },
      {
        field: "ai_api_endpoint",
        type: "string",
        schema: { default_value: "us-central1-aiplatform.googleapis.com" },
        meta: { interface: "input" },
      },
      {
        field: "ai_project_id",
        type: "string",
        meta: { interface: "input" },
      },
      {
        field: "ai_location_id",
        type: "string",
        schema: { default_value: "us-central1" },
        meta: { interface: "input" },
      },
      {
        field: "ai_max_output_tokens",
        type: "integer",
        schema: { default_value: 8192 },
        meta: { interface: "input" },
      },
      {
        field: "ai_max_conversation_history",
        type: "integer",
        schema: { default_value: 60 },
        meta: { interface: "input" },
      },
      {
        field: "ai_safety_settings",
        type: "json",
        meta: {
          interface: "input-code",
          options: { language: "json" },
          special: ["cast-json"],
        },
      },
      {
        field: "memory_store_type",
        type: "string",
        schema: { default_value: "firestore" },
        meta: {
          interface: "select-dropdown",
          options: createDropdownOptions([
            { text: "Directus", value: "directus" },
            { text: "Local", value: "local" },
            { text: "Firestore", value: "firestore" },
          ]),
        },
      },
      {
        field: "check_in_leaderboard",
        type: "string",
        meta: { interface: "input" },
      },
    ],
  },
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

      // Group: Core & Identity
      createGroupField(GROUP_DEFINITIONS.coreIdentity, "badge", "open"),
      {
        field: "bot_id",
        type: "string",
        schema: { default_value: DEFAULT_BOT_ID, is_nullable: false },
        meta: {
          interface: "input",
          required: true,
          group: GROUP_DEFINITIONS.coreIdentity,
        },
      },
      {
        field: "guild_id",
        type: "string",
        schema: { is_unique: true, is_nullable: false },
        meta: {
          interface: "input",
          required: true,
          group: GROUP_DEFINITIONS.coreIdentity,
        },
      },
      {
        field: "guild_name",
        type: "string",
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.coreIdentity,
        },
      },
      {
        field: "bot_name",
        type: "string",
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.coreIdentity,
        },
      },
      {
        field: "lock_name",
        type: "boolean",
        schema: { default_value: false },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.coreIdentity,
        },
      },
      {
        field: "personalization",
        type: "text",
        meta: {
          interface: "input-multiline",
          group: GROUP_DEFINITIONS.coreIdentity,
        },
      },
      {
        field: "personalization_mode",
        type: "string",
        schema: { default_value: "overwrite_identity" },
        meta: {
          interface: "select-dropdown",
          options: createDropdownOptions([
            { text: "Overwrite Identity", value: "overwrite_identity" },
            { text: "Extend", value: "extend" },
            { text: "Overwrite All", value: "overwrite_all" },
          ]),
          group: GROUP_DEFINITIONS.coreIdentity,
        },
      },
      {
        field: "system_instruction",
        type: "text",
        meta: {
          interface: "input-multiline",
          group: GROUP_DEFINITIONS.coreIdentity,
        },
      },
      {
        field: "reply_delay",
        type: "integer",
        schema: { default_value: 5000 },
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.coreIdentity,
        },
      },
      {
        field: "locale_override",
        type: "string",
        meta: {
          interface: "select-dropdown",
          options: createDropdownOptions(LOCALE_CHOICES, true),
          group: GROUP_DEFINITIONS.coreIdentity,
        },
      },
      {
        field: "reply_channel_ids",
        type: "json",
        meta: {
          interface: "tags",
          special: ["cast-json"],
          group: GROUP_DEFINITIONS.coreIdentity,
        },
      },
      {
        field: "ignored_channel_ids",
        type: "json",
        meta: {
          interface: "tags",
          special: ["cast-json"],
          group: GROUP_DEFINITIONS.coreIdentity,
        },
      },
      {
        field: "respond_to_mentions",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.coreIdentity,
        },
      },
      {
        field: "chat_bot_model",
        type: "json",
        meta: {
          interface: "input-code",
          options: { language: "json" },
          special: ["cast-json"],
          group: GROUP_DEFINITIONS.coreIdentity,
        },
      },
      {
        field: "tools_google_search",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.coreIdentity,
        },
      },
      {
        field: "tools_discord",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.coreIdentity,
        },
      },

      // Group: Smart Reply
      createGroupField(GROUP_DEFINITIONS.smartReply, "forum"),
      {
        field: "smart_reply_enabled",
        type: "boolean",
        schema: { default_value: false },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.smartReply,
        },
      },
      {
        field: "smart_reply_mode",
        type: "string",
        schema: { default_value: "mentions_and_vocative" },
        meta: {
          interface: "select-dropdown",
          options: createDropdownOptions([
            { text: "Disabled", value: "disabled" },
            { text: "Mentions & Vocative", value: "mentions_and_vocative" },
            { text: "Ambient Intent", value: "ambient_intent" },
          ]),
          group: GROUP_DEFINITIONS.smartReply,
        },
      },
      {
        field: "smart_reply_classifier_model",
        type: "json",
        meta: {
          interface: "input-code",
          options: { language: "json" },
          special: ["cast-json"],
          group: GROUP_DEFINITIONS.smartReply,
        },
      },
      {
        field: "smart_reply_chat_bot_model",
        type: "json",
        meta: {
          interface: "input-code",
          options: { language: "json" },
          special: ["cast-json"],
          group: GROUP_DEFINITIONS.smartReply,
        },
      },
      {
        field: "smart_reply_ambient_confidence_threshold",
        type: "float",
        schema: { default_value: 0.75 },
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.smartReply,
        },
      },
      {
        field: "smart_reply_debounce_ms",
        type: "integer",
        schema: { default_value: 3500 },
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.smartReply,
        },
      },
      {
        field: "smart_reply_max_debounce_ms",
        type: "integer",
        schema: { default_value: 8000 },
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.smartReply,
        },
      },
      {
        field: "smart_reply_session_ttl_seconds",
        type: "integer",
        schema: { default_value: 45 },
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.smartReply,
        },
      },
      {
        field: "smart_reply_strategy",
        type: "string",
        schema: { default_value: "hybrid" },
        meta: {
          interface: "select-dropdown",
          options: createDropdownOptions([
            { text: "Independent", value: "independent" },
            { text: "Coalesced", value: "coalesced" },
            { text: "Hybrid", value: "hybrid" },
          ]),
          group: GROUP_DEFINITIONS.smartReply,
        },
      },
      {
        field: "smart_reply_coalesce_window_ms",
        type: "integer",
        schema: { default_value: 1500 },
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.smartReply,
        },
      },
      {
        field: "smart_reply_silence_duration_minutes",
        type: "integer",
        schema: { default_value: 10 },
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.smartReply,
        },
      },
      {
        field: "smart_reply_ambient_rate_limit_seconds",
        type: "integer",
        schema: { default_value: 120 },
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.smartReply,
        },
      },
      {
        field: "smart_reply_ambient_snapshot_limit",
        type: "integer",
        schema: { default_value: 5 },
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.smartReply,
        },
      },
      {
        field: "smart_reply_enable_keyword_dismissal",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.smartReply,
        },
      },
      {
        field: "smart_reply_enable_reaction_dismissal",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.smartReply,
        },
      },
      {
        field: "smart_reply_send_typing_behavior",
        type: "string",
        schema: { default_value: "deferred_for_ambient" },
        meta: {
          interface: "select-dropdown",
          options: createDropdownOptions([
            { text: "Immediate for All", value: "immediate_for_all" },
            { text: "Deferred for Ambient", value: "deferred_for_ambient" },
            { text: "Disabled", value: "disabled" },
          ]),
          group: GROUP_DEFINITIONS.smartReply,
        },
      },
      {
        field: "smart_reply_thread_auto_listen",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.smartReply,
        },
      },
      {
        field: "smart_reply_opt_out_topic_tag",
        type: "string",
        schema: { default_value: "[no-bot]" },
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.smartReply,
        },
      },

      // Group: Roast
      createGroupField(GROUP_DEFINITIONS.roast, "local_fire_department"),
      {
        field: "roast_enabled",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.roast,
        },
      },
      {
        field: "roast_default_locale",
        type: "string",
        schema: { default_value: "vi" },
        meta: {
          interface: "select-dropdown",
          options: createDropdownOptions(LOCALE_CHOICES),
          group: GROUP_DEFINITIONS.roast,
        },
      },
      {
        field: "roast_locale_override",
        type: "string",
        meta: {
          interface: "select-dropdown",
          options: createDropdownOptions(LOCALE_CHOICES, true),
          group: GROUP_DEFINITIONS.roast,
        },
      },
      {
        field: "roast_max_intensity",
        type: "string",
        schema: { default_value: "savage" },
        meta: {
          interface: "select-dropdown",
          options: createDropdownOptions([
            { text: "Mild", value: "mild" },
            { text: "Medium", value: "medium" },
            { text: "Savage", value: "savage" },
          ]),
          group: GROUP_DEFINITIONS.roast,
        },
      },
      {
        field: "roast_allowed_channel_ids",
        type: "json",
        meta: {
          interface: "tags",
          special: ["cast-json"],
          group: GROUP_DEFINITIONS.roast,
        },
      },
      {
        field: "roast_ignored_channel_ids",
        type: "json",
        meta: {
          interface: "tags",
          special: ["cast-json"],
          group: GROUP_DEFINITIONS.roast,
        },
      },
      {
        field: "roast_max_per_day",
        type: "integer",
        schema: { default_value: 10 },
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.roast,
        },
      },
      {
        field: "roast_target_shield_cooldown_seconds",
        type: "integer",
        schema: { default_value: 300 },
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.roast,
        },
      },
      {
        field: "roast_caller_cooldown_seconds",
        type: "integer",
        schema: { default_value: 60 },
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.roast,
        },
      },
      {
        field: "roast_allow_counter_roast",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.roast,
        },
      },

      // Group: Moderation
      createGroupField(GROUP_DEFINITIONS.moderation, "shield"),
      {
        field: "moderation_enabled",
        type: "boolean",
        schema: { default_value: false },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.moderation,
        },
      },

      // Group: Voice Bouncer
      createGroupField(GROUP_DEFINITIONS.voiceBouncer, "record_voice_over"),
      {
        field: "voice_bouncer_enabled",
        type: "boolean",
        schema: { default_value: false },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.voiceBouncer,
        },
      },
      {
        field: "voice_bouncer_tag_only_channel_ids",
        type: "json",
        meta: {
          interface: "tags",
          special: ["cast-json"],
          group: GROUP_DEFINITIONS.voiceBouncer,
        },
      },
      {
        field: "voice_bouncer_tag_only_category_ids",
        type: "json",
        meta: {
          interface: "tags",
          special: ["cast-json"],
          group: GROUP_DEFINITIONS.voiceBouncer,
        },
      },
      {
        field: "voice_bouncer_exempt_role_ids",
        type: "json",
        meta: {
          interface: "tags",
          special: ["cast-json"],
          group: GROUP_DEFINITIONS.voiceBouncer,
        },
      },
      {
        field: "voice_bouncer_fallback_channel_id",
        type: "string",
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.voiceBouncer,
        },
      },
      {
        field: "voice_bouncer_action",
        type: "string",
        schema: { default_value: "disconnect" },
        meta: {
          interface: "select-dropdown",
          options: createDropdownOptions([
            { text: "Disconnect", value: "disconnect" },
            { text: "Move to Fallback", value: "move" },
          ]),
          group: GROUP_DEFINITIONS.voiceBouncer,
        },
      },
      {
        field: "voice_bouncer_warning_message",
        type: "text",
        meta: {
          interface: "input-multiline",
          group: GROUP_DEFINITIONS.voiceBouncer,
        },
      },

      // Group: Matchmaking
      createGroupField(GROUP_DEFINITIONS.matchmaking, "sports_esports"),
      {
        field: "matchmaking_enabled",
        type: "boolean",
        schema: { default_value: false },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.matchmaking,
        },
      },
      {
        field: "matchmaking_lobby_channel_id",
        type: "string",
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.matchmaking,
        },
      },
      {
        field: "matchmaking_team1_channel_id",
        type: "string",
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.matchmaking,
        },
      },
      {
        field: "matchmaking_team2_channel_id",
        type: "string",
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.matchmaking,
        },
      },
      {
        field: "matchmaking_category_id",
        type: "string",
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.matchmaking,
        },
      },
      {
        field: "matchmaking_map_pool",
        type: "json",
        meta: {
          interface: "tags",
          special: ["cast-json"],
          group: GROUP_DEFINITIONS.matchmaking,
        },
      },
      {
        field: "matchmaking_default_k_factor",
        type: "integer",
        schema: { default_value: 32 },
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.matchmaking,
        },
      },
      {
        field: "matchmaking_initial_elo",
        type: "integer",
        schema: { default_value: 1000 },
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.matchmaking,
        },
      },
      {
        field: "matchmaking_score_timeout_minutes",
        type: "integer",
        schema: { default_value: 120 },
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.matchmaking,
        },
      },
      {
        field: "matchmaking_auto_move_players",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.matchmaking,
        },
      },

      // Group: Valorant
      createGroupField(GROUP_DEFINITIONS.valorant, "videogame_asset"),
      {
        field: "valorant_enabled",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.valorant,
        },
      },
      {
        field: "valorant_compare_enabled",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.valorant,
        },
      },
      {
        field: "valorant_stats_enabled",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.valorant,
        },
      },
      {
        field: "valorant_stats_default_period",
        type: "string",
        schema: { default_value: "recent_20" },
        meta: {
          interface: "select-dropdown",
          options: createDropdownOptions([
            { text: "Recent 20", value: "recent_20" },
            { text: "Current Act", value: "current_act" },
            { text: "All Time", value: "all_time" },
          ]),
          group: GROUP_DEFINITIONS.valorant,
        },
      },
      {
        field: "valorant_auto_recap_enabled",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.valorant,
        },
      },
      {
        field: "valorant_auto_recap_channel_id",
        type: "string",
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.valorant,
        },
      },
      {
        field: "valorant_auto_recap_min_tier_alert",
        type: "integer",
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.valorant,
        },
      },
      {
        field: "valorant_auto_recap_sportscaster_banter",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.valorant,
        },
      },
      {
        field: "valorant_live_scouting_enabled",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.valorant,
        },
      },
      {
        field: "valorant_live_scouting_channel_id",
        type: "string",
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.valorant,
        },
      },
      {
        field: "valorant_live_scouting_alert_on_game_start",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.valorant,
        },
      },
      {
        field: "valorant_rank_role_sync_enabled",
        type: "boolean",
        schema: { default_value: false },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.valorant,
        },
      },
      {
        field: "valorant_rank_role_mappings",
        type: "json",
        meta: {
          interface: "input-code",
          options: { language: "json" },
          special: ["cast-json"],
          group: GROUP_DEFINITIONS.valorant,
        },
      },
      {
        field: "valorant_tilt_enabled",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.valorant,
        },
      },
      {
        field: "valorant_tilt_consecutive_losses_threshold",
        type: "integer",
        schema: { default_value: 3 },
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.valorant,
        },
      },
      {
        field: "valorant_tilt_night_owl_hour_start",
        type: "integer",
        schema: { default_value: 1 },
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.valorant,
        },
      },
      {
        field: "valorant_tilt_night_owl_hour_end",
        type: "integer",
        schema: { default_value: 5 },
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.valorant,
        },
      },
      {
        field: "valorant_tilt_dm_alert",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.valorant,
        },
      },

      // Group: Voice Companion
      createGroupField(GROUP_DEFINITIONS.voiceCompanion, "headset_mic"),
      {
        field: "voice_companion_enabled",
        type: "boolean",
        schema: { default_value: false },
        meta: {
          interface: "boolean",
          group: GROUP_DEFINITIONS.voiceCompanion,
        },
      },
      {
        field: "voice_companion_auto_join_channel_id",
        type: "string",
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.voiceCompanion,
        },
      },
      {
        field: "voice_companion_inactivity_timeout_minutes",
        type: "integer",
        schema: { default_value: 15 },
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.voiceCompanion,
        },
      },
      {
        field: "voice_companion_empty_channel_grace_seconds",
        type: "integer",
        schema: { default_value: 60 },
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.voiceCompanion,
        },
      },
      {
        field: "voice_companion_model_id",
        type: "string",
        schema: { default_value: "gemini-3.8-live" },
        meta: {
          interface: "select-dropdown",
          options: createDropdownOptions([
            { text: "Gemini 3.8 Live", value: "gemini-3.8-live" },
          ]),
          group: GROUP_DEFINITIONS.voiceCompanion,
        },
      },
      {
        field: "voice_companion_voice_name",
        type: "string",
        schema: { default_value: "Aoede" },
        meta: {
          interface: "select-dropdown",
          options: createDropdownOptions([
            { text: "Puck", value: "Puck" },
            { text: "Charon", value: "Charon" },
            { text: "Kore", value: "Kore" },
            { text: "Fenrir", value: "Fenrir" },
            { text: "Aoede", value: "Aoede" },
          ]),
          group: GROUP_DEFINITIONS.voiceCompanion,
        },
      },
      {
        field: "voice_companion_system_instruction",
        type: "text",
        meta: {
          interface: "input-multiline",
          group: GROUP_DEFINITIONS.voiceCompanion,
        },
      },
      {
        field: "voice_companion_energy_threshold",
        type: "float",
        schema: { default_value: 0.012 },
        meta: {
          interface: "input",
          group: GROUP_DEFINITIONS.voiceCompanion,
        },
      },
      {
        field: "voice_companion_barge_in_sensitivity",
        type: "string",
        schema: { default_value: "normal" },
        meta: {
          interface: "select-dropdown",
          options: createDropdownOptions([
            { text: "High", value: "high" },
            { text: "Normal", value: "normal" },
            { text: "Low", value: "low" },
          ]),
          group: GROUP_DEFINITIONS.voiceCompanion,
        },
      },
      {
        field: "voice_companion_participation_mode",
        type: "string",
        schema: { default_value: "ambient" },
        meta: {
          interface: "select-dropdown",
          options: createDropdownOptions([
            { text: "Ambient", value: "ambient" },
            { text: "Addressed Only", value: "addressed_only" },
            { text: "Push to Talk", value: "push_to_talk" },
          ]),
          group: GROUP_DEFINITIONS.voiceCompanion,
        },
      },

      // Group: Guild Metadata
      createGroupField(GROUP_DEFINITIONS.guildMetadata, "dataset"),
      {
        field: "guild_emojis",
        type: "json",
        meta: {
          interface: "input-code",
          options: { language: "json" },
          special: ["cast-json"],
          group: GROUP_DEFINITIONS.guildMetadata,
        },
      },
      {
        field: "guild_members",
        type: "json",
        meta: {
          interface: "input-code",
          options: { language: "json" },
          special: ["cast-json"],
          group: GROUP_DEFINITIONS.guildMetadata,
        },
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
      {
        field: "riot_id",
        type: "string",
        meta: { interface: "input" },
      },
      {
        field: "riot_region",
        type: "string",
        meta: { interface: "input" },
      },
      {
        field: "riot_puuid",
        type: "string",
        meta: { interface: "input" },
      },
      {
        field: "last_known_match_id",
        type: "string",
        meta: { interface: "input" },
      },
    ],
  },
];

async function authenticate(
  setupConfig: DirectusSetupConfig,
): Promise<AxiosInstance> {
  const loginRes = await axios.post(`${setupConfig.directusUrl}/auth/login`, {
    email: setupConfig.adminEmail,
    password: setupConfig.adminPassword,
  });
  const token = loginRes.data.data.access_token;
  return axios.create({
    baseURL: setupConfig.directusUrl,
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function ensureCollectionFields(
  client: AxiosInstance,
  collection: string,
  fields: DirectusFieldDefinition[],
): Promise<Set<string>> {
  const createdFields = new Set<string>();
  try {
    const fieldsRes = await client.get(`/fields/${collection}`);
    const existingFieldNames = new Set(
      (fieldsRes.data?.data || []).map((f: { field: string }) => f.field),
    );
    for (const field of fields) {
      if (!existingFieldNames.has(field.field)) {
        console.log(
          `Adding missing field ${field.field} to collection ${collection}...`,
        );
        await client.post(`/fields/${collection}`, field);
        createdFields.add(field.field);
      }
    }
    return createdFields;
  } catch (err: unknown) {
    console.error(
      `[SetupDirectus] Failed to synchronize fields for collection ${collection}:`,
      err instanceof Error ? err.message : String(err),
    );
    throw err;
  }
}

/**
 * Creates missing Directus collections and synchronizes missing fields on existing ones.
 * Returns a map of collection name to the set of fields newly created during this run.
 */
export async function ensureCollections(
  client: AxiosInstance,
): Promise<Map<string, Set<string>>> {
  const res = await client.get("/collections");
  const existingNames = new Set(
    res.data.data.map((c: { collection: string }) => c.collection),
  );
  const createdFieldsByCollection = new Map<string, Set<string>>();

  for (const col of COLLECTIONS) {
    if (!existingNames.has(col.collection)) {
      console.log(`Creating collection ${col.collection}...`);
      await client.post("/collections", col);
      createdFieldsByCollection.set(
        col.collection,
        new Set(col.fields.map((f) => f.field)),
      );
    } else {
      const createdFields = await ensureCollectionFields(
        client,
        col.collection,
        col.fields,
      );
      createdFieldsByCollection.set(col.collection, createdFields);
    }
  }

  return createdFieldsByCollection;
}

const GUILD_CONFIG_DEFAULT_BY_FIELD = new Map<string, unknown>(
  (COLLECTIONS.find((c) => c.collection === "bot_guild_configs")?.fields ?? [])
    .filter((f) => f.schema && "default_value" in f.schema)
    .map((f) => [f.field, f.schema?.default_value]),
);

function isNullish(value: unknown): boolean {
  return value === null || value === undefined;
}

function setIfTargetEmpty(
  row: Record<string, unknown>,
  payload: Record<string, unknown>,
  targetKey: string,
  sourceValue: unknown,
  forceOverwriteFields?: ReadonlySet<string>,
): void {
  if (isNullish(sourceValue)) {
    return;
  }
  const schemaDefault = GUILD_CONFIG_DEFAULT_BY_FIELD.get(targetKey);
  const holdsSchemaDefault =
    schemaDefault !== undefined && row[targetKey] === schemaDefault;
  const shouldWrite =
    isNullish(row[targetKey]) ||
    Boolean(forceOverwriteFields?.has(targetKey)) ||
    holdsSchemaDefault;
  if (shouldWrite && row[targetKey] !== sourceValue) {
    payload[targetKey] = sourceValue;
  }
}

function parseLegacyStringArray(rawValue: unknown): string[] | null {
  if (Array.isArray(rawValue)) {
    return rawValue.filter((item): item is string => typeof item === "string");
  }
  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is string => typeof item === "string",
        );
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

function parseLegacyValorantFeatures(
  rawValue: unknown,
): Record<string, unknown> | null {
  if (isNullish(rawValue)) {
    return null;
  }
  if (typeof rawValue === "string") {
    try {
      const parsed: unknown = JSON.parse(rawValue);
      return isPlainRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isPlainRecord(rawValue) ? rawValue : null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNestedRecord(
  parent: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const child = parent[key];
  return isPlainRecord(child) ? child : undefined;
}

const VALORANT_LEGACY_MAPPINGS: ReadonlyArray<{
  section: string;
  sourceKey: string;
  targetField: string;
}> = [
  {
    section: "compare",
    sourceKey: "enabled",
    targetField: "valorant_compare_enabled",
  },
  {
    section: "statsSummary",
    sourceKey: "enabled",
    targetField: "valorant_stats_enabled",
  },
  {
    section: "statsSummary",
    sourceKey: "defaultPeriod",
    targetField: "valorant_stats_default_period",
  },
  {
    section: "autoRecap",
    sourceKey: "enabled",
    targetField: "valorant_auto_recap_enabled",
  },
  {
    section: "autoRecap",
    sourceKey: "channelId",
    targetField: "valorant_auto_recap_channel_id",
  },
  {
    section: "autoRecap",
    sourceKey: "minTierAlert",
    targetField: "valorant_auto_recap_min_tier_alert",
  },
  {
    section: "autoRecap",
    sourceKey: "sportscasterBanter",
    targetField: "valorant_auto_recap_sportscaster_banter",
  },
  {
    section: "liveScouting",
    sourceKey: "enabled",
    targetField: "valorant_live_scouting_enabled",
  },
  {
    section: "liveScouting",
    sourceKey: "channelId",
    targetField: "valorant_live_scouting_channel_id",
  },
  {
    section: "liveScouting",
    sourceKey: "alertOnGameStart",
    targetField: "valorant_live_scouting_alert_on_game_start",
  },
  {
    section: "rankRoleSync",
    sourceKey: "enabled",
    targetField: "valorant_rank_role_sync_enabled",
  },
  {
    section: "rankRoleSync",
    sourceKey: "roleMappings",
    targetField: "valorant_rank_role_mappings",
  },
  {
    section: "tiltProtection",
    sourceKey: "enabled",
    targetField: "valorant_tilt_enabled",
  },
  {
    section: "tiltProtection",
    sourceKey: "consecutiveLossesThreshold",
    targetField: "valorant_tilt_consecutive_losses_threshold",
  },
  {
    section: "tiltProtection",
    sourceKey: "nightOwlHourStart",
    targetField: "valorant_tilt_night_owl_hour_start",
  },
  {
    section: "tiltProtection",
    sourceKey: "nightOwlHourEnd",
    targetField: "valorant_tilt_night_owl_hour_end",
  },
  {
    section: "tiltProtection",
    sourceKey: "dmAlert",
    targetField: "valorant_tilt_dm_alert",
  },
];

const REQUIRED_MIGRATION_TARGET_FIELDS: readonly string[] = [
  "bot_id",
  "roast_enabled",
  "roast_default_locale",
  "roast_allowed_channel_ids",
  "roast_max_per_day",
  "voice_bouncer_enabled",
  ...VALORANT_LEGACY_MAPPINGS.map((m) => m.targetField),
];

/**
 * Computes a backfill payload for a single `bot_guild_configs` row
 * from legacy columns into the flattened schema columns.
 */
export function buildLegacyBackfillPayload(
  row: Record<string, unknown>,
  forceOverwriteFields?: ReadonlySet<string>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (typeof row.bot_id !== "string" || row.bot_id.trim() === "") {
    payload.bot_id = DEFAULT_BOT_ID;
  }

  setIfTargetEmpty(
    row,
    payload,
    "roast_enabled",
    row.enable_ai_roast,
    forceOverwriteFields,
  );
  setIfTargetEmpty(
    row,
    payload,
    "roast_allowed_channel_ids",
    parseLegacyStringArray(row.allowed_channel_ids),
    forceOverwriteFields,
  );
  setIfTargetEmpty(
    row,
    payload,
    "roast_max_per_day",
    row.max_roasts_per_day,
    forceOverwriteFields,
  );
  setIfTargetEmpty(
    row,
    payload,
    "voice_bouncer_enabled",
    row.enable_bouncergon,
    forceOverwriteFields,
  );

  if (
    typeof row.default_locale === "string" &&
    row.default_locale.trim() !== ""
  ) {
    const trimmedLocale = row.default_locale.trim();
    const normalizedLocale = trimmedLocale === "en" ? "en-US" : trimmedLocale;
    setIfTargetEmpty(
      row,
      payload,
      "roast_default_locale",
      normalizedLocale,
      forceOverwriteFields,
    );
  }

  const legacyValorant = parseLegacyValorantFeatures(row.valorant_features);
  if (legacyValorant) {
    for (const mapping of VALORANT_LEGACY_MAPPINGS) {
      const sectionObj = getNestedRecord(legacyValorant, mapping.section);
      if (sectionObj) {
        setIfTargetEmpty(
          row,
          payload,
          mapping.targetField,
          sectionObj[mapping.sourceKey],
          forceOverwriteFields,
        );
      }
    }
  }

  return payload;
}

function assertMigrationTargetFieldsExist(
  existingFieldNames: ReadonlySet<string>,
): void {
  const missingTargets = REQUIRED_MIGRATION_TARGET_FIELDS.filter(
    (field) => !existingFieldNames.has(field),
  );
  if (missingTargets.length > 0) {
    throw new Error(
      `Cannot migrate legacy bot_guild_configs columns; missing target fields: ${missingTargets.join(", ")}`,
    );
  }
}

function validateRowIdForPatch(row: Record<string, unknown>): string {
  const rawId = row.id;
  const isValidStringId = typeof rawId === "string" && rawId.trim() !== "";
  const isValidNumberId = typeof rawId === "number" && Number.isFinite(rawId);
  if (!(isValidStringId || isValidNumberId)) {
    throw new Error(
      `Cannot patch migrated bot_guild_configs row without valid id (guild_id: ${String(row.guild_id ?? "unknown")})`,
    );
  }
  return String(rawId).trim();
}

async function migrateGuildConfigPage(
  client: AxiosInstance,
  rows: Record<string, unknown>[],
  newlyCreatedFields?: ReadonlySet<string>,
): Promise<void> {
  for (const row of rows) {
    const payload = buildLegacyBackfillPayload(row, newlyCreatedFields);
    if (Object.keys(payload).length === 0) {
      continue;
    }
    const safeId = validateRowIdForPatch(row);
    await client.patch(
      `/items/bot_guild_configs/${encodeURIComponent(safeId)}`,
      payload,
    );
  }
}

/**
 * Backfills data from legacy `bot_guild_configs` columns into the flattened columns
 * and deletes the legacy columns only after all row updates succeed.
 */
export async function migrateLegacyGuildConfigColumns(
  client: AxiosInstance,
  newlyCreatedFields?: ReadonlySet<string>,
): Promise<void> {
  const fieldsRes = await client.get("/fields/bot_guild_configs");
  const existingFieldNames = new Set<string>(
    (fieldsRes.data?.data || []).map((f: { field: string }) => f.field),
  );

  const legacyFieldsPresent = LEGACY_GUILD_CONFIG_FIELDS.filter((field) =>
    existingFieldNames.has(field),
  );

  if (legacyFieldsPresent.length === 0) {
    console.log(
      "[SetupDirectus] No legacy bot_guild_configs columns detected. Skipping migration.",
    );
    return;
  }

  assertMigrationTargetFieldsExist(existingFieldNames);

  console.log(
    `[SetupDirectus] Migrating legacy bot_guild_configs columns: ${legacyFieldsPresent.join(", ")}`,
  );

  let page = 1;
  while (true) {
    const rowsRes = await client.get("/items/bot_guild_configs", {
      params: {
        limit: MIGRATION_PAGE_SIZE,
        page,
        sort: "id",
      },
    });
    const rows: Record<string, unknown>[] = rowsRes.data?.data || [];
    if (rows.length === 0) {
      break;
    }
    await migrateGuildConfigPage(client, rows, newlyCreatedFields);
    if (rows.length < MIGRATION_PAGE_SIZE) {
      break;
    }
    page += 1;
  }

  // Only remove legacy fields once every row patch has completed without error
  for (const legacyField of legacyFieldsPresent) {
    console.log(
      `[SetupDirectus] Dropping legacy field bot_guild_configs.${legacyField}...`,
    );
    await client.delete(
      `/fields/bot_guild_configs/${encodeURIComponent(legacyField)}`,
    );
  }
}

interface DirectusPermissionRecord {
  id?: string | number;
  collection: string;
  action: string;
}

const MANAGED_COLLECTION_NAMES = new Set(
  COLLECTIONS.map((col) => col.collection),
);

function getAllowedPolicyActions(collection: string): readonly string[] {
  if (collection in POLICY_ACTIONS_BY_COLLECTION) {
    return POLICY_ACTIONS_BY_COLLECTION[collection];
  }
  return MANAGED_COLLECTION_NAMES.has(collection) ? ["read"] : [];
}

async function revokeDisallowedPermissions(
  client: AxiosInstance,
  existingPerms: DirectusPermissionRecord[],
): Promise<Set<string>> {
  const validPermSet = new Set<string>();
  for (const perm of existingPerms) {
    const allowedActions = getAllowedPolicyActions(perm.collection);
    if (allowedActions.includes(perm.action)) {
      validPermSet.add(`${perm.collection}:${perm.action}`);
    } else if (perm.id !== undefined) {
      await client.delete(
        `/permissions/${encodeURIComponent(String(perm.id))}`,
      );
    }
  }
  return validPermSet;
}

/**
 * Ensures the `bot-service-policy` exists, enforces non-admin flags,
 * revokes excess permissions, and grants least-privilege collection permissions.
 */
export async function ensurePolicy(client: AxiosInstance): Promise<string> {
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
  } else {
    await client.patch(`/policies/${encodeURIComponent(policyId)}`, {
      app_access: false,
      admin_access: false,
    });
  }

  const existingPermsRes = await client.get(
    `/permissions?filter[policy][_eq]=${encodeURIComponent(policyId)}&limit=-1`,
  );
  const existingPerms: DirectusPermissionRecord[] =
    existingPermsRes.data.data || [];
  const validPermSet = await revokeDisallowedPermissions(client, existingPerms);

  for (const col of COLLECTIONS) {
    const actions = getAllowedPolicyActions(col.collection);
    for (const action of actions) {
      const key = `${col.collection}:${action}`;
      if (!validPermSet.has(key)) {
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

export const CACHE_INVALIDATION_FLOW_NAME = "bot-cache-invalidation";
export const CACHE_INVALIDATION_OPERATION_KEY = "webhook_request";
export const CACHE_INVALIDATION_OPERATION_NAME =
  "Send Cache Invalidation Webhook";
export const CACHE_INVALIDATION_FLOW_COLLECTIONS = [
  "bot_system_config",
  "bot_guild_configs",
  "bot_roast_presets",
] as const;
export const CACHE_INVALIDATION_FLOW_SCOPES = [
  "items.create",
  "items.update",
  "items.delete",
] as const;

/**
 * Provisions or updates the Directus flow and request operation for outgoing cache invalidation webhooks.
 *
 * Directus 11+ replaces legacy webhooks with Flows and Operations. This ensures an active action event
 * flow targeting bot collections triggers an HTTP POST request to the bot's webhook receiver.
 *
 * @param client Authenticated Directus Axios client
 * @param setupConfig Directus setup configuration containing webhook secret and receiver URL
 */
export async function ensureWebhook(
  client: AxiosInstance,
  setupConfig: DirectusSetupConfig,
): Promise<void> {
  if (!setupConfig.internalWebhookSecret) {
    console.log(
      "[SetupDirectus] Notice: INTERNAL_WEBHOOK_SECRET is not configured. Skipping webhook provisioning.",
    );
    return;
  }
  try {
    const flowsRes = await client.get(
      `/flows?filter[name][_eq]=${CACHE_INVALIDATION_FLOW_NAME}`,
    );
    const existingFlow = flowsRes.data?.data?.[0];
    let flowId = existingFlow?.id;

    const flowOptions = {
      type: "action",
      scope: CACHE_INVALIDATION_FLOW_SCOPES,
      collections: CACHE_INVALIDATION_FLOW_COLLECTIONS,
    };

    if (!flowId) {
      console.log("Provisioning cache invalidation flow...");
      const createFlowRes = await client.post("/flows", {
        name: CACHE_INVALIDATION_FLOW_NAME,
        icon: "bolt",
        status: "active",
        trigger: "event",
        options: flowOptions,
      });
      flowId = createFlowRes.data?.data?.id;
    } else {
      await client.patch(`/flows/${flowId}`, {
        status: "active",
        trigger: "event",
        options: flowOptions,
      });
    }

    if (!flowId) {
      throw new Error("Failed to obtain flow ID for cache invalidation.");
    }

    const operationsRes = await client.get(
      `/operations?filter[flow][_eq]=${flowId}&filter[key][_eq]=${CACHE_INVALIDATION_OPERATION_KEY}`,
    );
    const existingOperation = operationsRes.data?.data?.[0];

    const operationPayload = {
      name: CACHE_INVALIDATION_OPERATION_NAME,
      key: CACHE_INVALIDATION_OPERATION_KEY,
      type: "request",
      position_x: 10,
      position_y: 10,
      flow: flowId,
      options: {
        method: "POST",
        url: setupConfig.webhookReceiverUrl,
        headers: [
          {
            header: "x-webhook-secret",
            value: setupConfig.internalWebhookSecret,
          },
        ],
        body: "{{$trigger}}",
      },
    };

    let operationId = existingOperation?.id;
    if (!existingOperation) {
      console.log("Provisioning cache invalidation webhook operation...");
      const createOpRes = await client.post("/operations", operationPayload);
      operationId = createOpRes.data?.data?.id;
    } else {
      await client.patch(`/operations/${existingOperation.id}`, {
        name: operationPayload.name,
        type: "request",
        options: operationPayload.options,
      });
    }

    if (!operationId) {
      throw new Error("Failed to obtain operation ID for cache invalidation.");
    }

    const flowRes = await client.get(`/flows/${flowId}`);
    if (flowRes.data?.data?.operation !== operationId) {
      await client.patch(`/flows/${flowId}`, {
        operation: operationId,
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
): Promise<void> {
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

async function ensurePresets(client: AxiosInstance): Promise<void> {
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

/**
 * Executes the full Directus provisioning, schema migration, RBAC, and webhook setup.
 */
export async function runDirectusSetup(): Promise<void> {
  const setupConfig = resolveDirectusSetupConfig();
  console.log(`Connecting to Directus at ${setupConfig.directusUrl}...`);
  const client = await authenticate(setupConfig);
  console.log("Logged in as admin.");

  const createdFieldsByCollection = await ensureCollections(client);
  await migrateLegacyGuildConfigColumns(
    client,
    createdFieldsByCollection.get("bot_guild_configs"),
  );
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
