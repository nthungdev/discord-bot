import type {
  AiProviderConfig,
  AiSafetySettingsConfig,
  BotGuildConfig,
  GuildMembersConfigMember,
  RoastFeatureConfig,
  SmartReplyConfig,
  ValorantFeaturesConfig,
  VoiceBouncerCapabilityConfig,
  VoiceCompanionCapabilityConfig,
} from "../../config/types";
import type { ModelConfig } from "../../genAi/types";

export interface DirectusSystemConfigRaw {
  id: string;
  ai_provider?: AiProviderConfig | null;
  ai_model_id?: string | null;
  ai_api_endpoint?: string | null;
  ai_project_id?: string | null;
  ai_location_id?: string | null;
  ai_max_output_tokens?: number | null;
  ai_max_conversation_history?: number | null;
  ai_safety_settings?:
    | AiSafetySettingsConfig["safetySettings"]
    | AiSafetySettingsConfig
    | null;
  memory_store_type?: "directus" | "local" | "firestore" | null;
  check_in_leaderboard?: string | null;
}

export interface DirectusGuildConfigRaw {
  // Core & Identity
  id: string;
  bot_id?: string | null;
  guild_id: string;
  guild_name?: string | null;
  bot_name?: string | null;
  lock_name?: boolean | null;
  personalization?: string | null;
  personalization_mode?: BotGuildConfig["personalizationMode"] | null;
  system_instruction?: string | null;
  reply_delay?: number | null;
  locale_override?: BotGuildConfig["localeOverride"] | null;
  reply_channel_ids?: string[] | null;
  ignored_channel_ids?: string[] | null;
  respond_to_mentions?: boolean | null;
  chat_bot_model?: ModelConfig | null;
  tools_google_search?: boolean | null;
  tools_discord?: boolean | null;

  // Smart Reply
  smart_reply_enabled?: boolean | null;
  smart_reply_mode?: SmartReplyConfig["mode"] | null;
  smart_reply_classifier_model?: ModelConfig | null;
  smart_reply_chat_bot_model?: ModelConfig | null;
  smart_reply_ambient_confidence_threshold?: number | null;
  smart_reply_debounce_ms?: number | null;
  smart_reply_max_debounce_ms?: number | null;
  smart_reply_session_ttl_seconds?: number | null;
  smart_reply_strategy?: SmartReplyConfig["replyStrategy"] | null;
  smart_reply_coalesce_window_ms?: number | null;
  smart_reply_silence_duration_minutes?: number | null;
  smart_reply_ambient_rate_limit_seconds?: number | null;
  smart_reply_ambient_snapshot_limit?: number | null;
  smart_reply_enable_keyword_dismissal?: boolean | null;
  smart_reply_enable_reaction_dismissal?: boolean | null;
  smart_reply_send_typing_behavior?:
    | SmartReplyConfig["sendTypingBehavior"]
    | null;
  smart_reply_thread_auto_listen?: boolean | null;
  smart_reply_opt_out_topic_tag?: string | null;

  // Roast
  roast_enabled?: boolean | null;
  roast_default_locale?: "vi" | "en" | "en-US" | null;
  roast_locale_override?: RoastFeatureConfig["localeOverride"] | null;
  roast_max_intensity?: RoastFeatureConfig["maxIntensity"] | null;
  roast_allowed_channel_ids?: string[] | null;
  roast_ignored_channel_ids?: string[] | null;
  roast_max_per_day?: number | null;
  roast_target_shield_cooldown_seconds?: number | null;
  roast_caller_cooldown_seconds?: number | null;
  roast_allow_counter_roast?: boolean | null;

  // Moderation
  moderation_enabled?: boolean | null;

  // Voice Bouncer
  voice_bouncer_enabled?: boolean | null;
  voice_bouncer_tag_only_channel_ids?: string[] | null;
  voice_bouncer_tag_only_category_ids?: string[] | null;
  voice_bouncer_exempt_role_ids?: string[] | null;
  voice_bouncer_fallback_channel_id?: string | null;
  voice_bouncer_action?: VoiceBouncerCapabilityConfig["action"] | null;
  voice_bouncer_warning_message?: string | null;

  // Matchmaking
  matchmaking_enabled?: boolean | null;
  matchmaking_lobby_channel_id?: string | null;
  matchmaking_team1_channel_id?: string | null;
  matchmaking_team2_channel_id?: string | null;
  matchmaking_category_id?: string | null;
  matchmaking_map_pool?: string[] | null;
  matchmaking_default_k_factor?: number | null;
  matchmaking_initial_elo?: number | null;
  matchmaking_score_timeout_minutes?: number | null;
  matchmaking_auto_move_players?: boolean | null;

  // Valorant
  valorant_enabled?: boolean | null;
  valorant_compare_enabled?: boolean | null;
  valorant_stats_enabled?: boolean | null;
  valorant_stats_default_period?:
    | NonNullable<ValorantFeaturesConfig["statsSummary"]>["defaultPeriod"]
    | null;
  valorant_auto_recap_enabled?: boolean | null;
  valorant_auto_recap_channel_id?: string | null;
  valorant_auto_recap_min_tier_alert?: number | null;
  valorant_auto_recap_sportscaster_banter?: boolean | null;
  valorant_live_scouting_enabled?: boolean | null;
  valorant_live_scouting_channel_id?: string | null;
  valorant_live_scouting_alert_on_game_start?: boolean | null;
  valorant_rank_role_sync_enabled?: boolean | null;
  valorant_rank_role_mappings?: Record<string, string> | null;
  valorant_tilt_enabled?: boolean | null;
  valorant_tilt_consecutive_losses_threshold?: number | null;
  valorant_tilt_night_owl_hour_start?: number | null;
  valorant_tilt_night_owl_hour_end?: number | null;
  valorant_tilt_dm_alert?: boolean | null;

  // Voice Companion
  voice_companion_enabled?: boolean | null;
  voice_companion_auto_join_channel_id?: string | null;
  voice_companion_inactivity_timeout_minutes?: number | null;
  voice_companion_empty_channel_grace_seconds?: number | null;
  voice_companion_model_id?: VoiceCompanionCapabilityConfig["modelId"] | null;
  voice_companion_voice_name?:
    | VoiceCompanionCapabilityConfig["voiceName"]
    | null;
  voice_companion_system_instruction?: string | null;
  voice_companion_energy_threshold?: number | null;
  voice_companion_barge_in_sensitivity?:
    | VoiceCompanionCapabilityConfig["bargeInSensitivity"]
    | null;
  voice_companion_participation_mode?:
    | VoiceCompanionCapabilityConfig["participationMode"]
    | null;

  // Guild Metadata
  guild_emojis?: Record<string, string[]> | null;
  guild_members?: GuildMembersConfigMember[] | null;
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
  bot_system_config: DirectusSystemConfigRaw;
  bot_guild_configs: DirectusGuildConfigRaw[];
  bot_roast_presets: DirectusRoastPresetRaw[];
  bot_roast_logs: DirectusRoastLogRaw[];
  bot_user_profiles: DirectusUserProfileRaw[];
}
