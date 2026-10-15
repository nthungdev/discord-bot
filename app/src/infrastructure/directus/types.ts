export interface DirectusGuildConfigRaw {
  id: string;
  guild_id: string;
  guild_name?: string | null;
  enable_ai_roast?: boolean | null;
  enable_bouncergon?: boolean | null;
  default_locale?: string | null;
  max_roasts_per_day?: number | null;
  allowed_channel_ids?: string[] | null;
  scms_voice_channel_id?: string | null;
  valorant_enabled?: boolean | null;
  valorant_features?:
    | import("../../config/types").ValorantFeaturesConfig
    | null;
}

export interface DirectusRoastPresetRaw {
  id: string;
  preset_name: string;
  system_prompt: string;
  temperature?: number | null;
  is_active?: boolean | null;
  banned_terms?: string[] | null;
}

export interface DirectusRoastLogRaw {
  id?: string;
  guild_id: string;
  channel_id: string;
  caller_user_id: string;
  target_user_id: string;
  topic?: string | null;
  generated_text: string;
  execution_time_ms: number;
  feedback_rating?: number | null;
}

export interface DirectusUserProfileRaw {
  id?: string;
  user_id: string;
  opt_out_roast?: boolean | null;
  opted_out_guild_ids?: string[] | null;
  reputation_score?: number | null;
  riot_id?: string | null;
  riot_region?: string | null;
  riot_puuid?: string | null;
  last_known_match_id?: string | null;
}

export interface DirectusSchema {
  bot_guild_configs: DirectusGuildConfigRaw[];
  bot_roast_presets: DirectusRoastPresetRaw[];
  bot_roast_logs: DirectusRoastLogRaw[];
  bot_user_profiles: DirectusUserProfileRaw[];
}
