import type { AppConfigData } from "../../config";
import type {
  AiSafetySettingsConfig,
  BotConfig,
  BotGuildConfig,
  BotGuildToolsConfig,
  BotsConfig,
  GuildEmojisConfig,
  GuildMembersConfig,
  GuildMembersConfigMember,
  MatchmakingCapabilityConfig,
  ModerationCapabilityConfig,
  RoastFeatureConfig,
  SmartReplyConfig,
  ValorantCapabilityConfig,
  ValorantFeaturesConfig,
  VoiceBouncerCapabilityConfig,
  VoiceCompanionCapabilityConfig,
} from "../../config/types";
import type { ModelConfig } from "../../genAi/types";
import type { DirectusGuildConfigRaw, DirectusSystemConfigRaw } from "./types";

const DEFAULT_BOT_ID = "chatBot";
const LOCALE_EN_SHORT = "en";
const LOCALE_EN_US = "en-US";
const LOCALE_VI = "vi";
const VALID_MEMORY_STORE_TYPES = new Set(["directus", "local", "firestore"]);
const VALID_AI_PROVIDERS = new Set(["google-genai", "vertex", "antigravity"]);
const VALID_ROAST_INTENSITIES = new Set(["mild", "medium", "savage"]);
const VALID_PERSONALIZATION_MODES = new Set([
  "overwrite_identity",
  "extend",
  "overwrite_all",
]);
const VALID_SMART_REPLY_MODES = new Set([
  "disabled",
  "mentions_and_vocative",
  "ambient_intent",
]);
const VALID_SMART_REPLY_STRATEGIES = new Set([
  "independent",
  "coalesced",
  "hybrid",
]);
const VALID_SEND_TYPING_BEHAVIORS = new Set([
  "immediate_for_all",
  "deferred_for_ambient",
  "disabled",
]);
const VALID_VOICE_BOUNCER_ACTIONS = new Set(["disconnect", "move"]);
const VALID_VALORANT_STATS_PERIODS = new Set([
  "recent_20",
  "current_act",
  "all_time",
]);
const VALID_VOICE_COMPANION_MODEL_IDS = new Set(["gemini-3.8-live"]);
const VALID_VOICE_COMPANION_VOICE_NAMES = new Set([
  "Puck",
  "Charon",
  "Kore",
  "Fenrir",
  "Aoede",
]);
const VALID_VOICE_COMPANION_BARGE_IN = new Set(["high", "normal", "low"]);
const VALID_VOICE_COMPANION_PARTICIPATION = new Set([
  "ambient",
  "addressed_only",
  "push_to_talk",
]);

export const FORBIDDEN_RECORD_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

/**
 * Checks whether a dynamic record key is a non-empty string and not a prototype-polluting key.
 */
export function isSafeRecordKey(key: unknown): key is string {
  return (
    typeof key === "string" && key.length > 0 && !FORBIDDEN_RECORD_KEYS.has(key)
  );
}

function setSafeProperty<T extends object>(
  target: T,
  key: string,
  value: unknown,
): void {
  if (!isSafeRecordKey(key)) {
    return;
  }
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

function pickBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function pickString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function pickNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function pickFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function pickPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function pickNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function pickEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
): T | undefined {
  return typeof value === "string" && allowed.has(value)
    ? (value as T)
    : undefined;
}

function assignDefined<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function nonEmptyOrUndefined<T extends object>(obj: T): T | undefined {
  return Object.keys(obj).length > 0 ? obj : undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string");
}

function cloneStringArray(
  value: readonly string[] | undefined,
): string[] | undefined {
  return value ? [...value] : undefined;
}

function parseStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (isSafeRecordKey(k) && typeof v === "string") {
      setSafeProperty(result, k, v);
    }
  }
  return result;
}

function cloneStringRecord(
  value: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!value) {
    return undefined;
  }
  const cloned: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (isSafeRecordKey(k) && typeof v === "string") {
      setSafeProperty(cloned, k, v);
    }
  }
  return cloned;
}

function parseModelConfig(value: unknown): ModelConfig | undefined {
  if (
    !isPlainRecord(value) ||
    typeof value.modelId !== "string" ||
    !value.modelId
  ) {
    return undefined;
  }
  const model: ModelConfig = { modelId: value.modelId };
  if (
    value.provider === "google-genai" ||
    value.provider === "vertex" ||
    value.provider === "antigravity"
  ) {
    model.provider = value.provider;
  }
  const temperature = pickFiniteNumber(value.temperature);
  if (temperature !== undefined) {
    model.temperature = temperature;
  }
  const maxOutputTokens = pickFiniteNumber(value.maxOutputTokens);
  if (maxOutputTokens !== undefined) {
    model.maxOutputTokens = maxOutputTokens;
  }
  const topP = pickFiniteNumber(value.topP);
  if (topP !== undefined) {
    model.topP = topP;
  }
  return model;
}

function cloneModelConfig(
  value: ModelConfig | undefined,
): ModelConfig | undefined {
  return value ? { ...value } : undefined;
}

function normalizeLocale(value: unknown): "vi" | "en-US" | undefined {
  if (value === LOCALE_VI) {
    return LOCALE_VI;
  }
  if (value === LOCALE_EN_US || value === LOCALE_EN_SHORT) {
    return LOCALE_EN_US;
  }
  return undefined;
}

function parseSafetySettingEntries(
  entries: unknown[],
): AiSafetySettingsConfig["safetySettings"] {
  const valid: AiSafetySettingsConfig["safetySettings"] = [];
  for (const entry of entries) {
    if (
      isPlainRecord(entry) &&
      typeof entry.category === "string" &&
      typeof entry.threshold === "string"
    ) {
      valid.push({ category: entry.category, threshold: entry.threshold });
    }
  }
  return valid;
}

function parseSafetySettings(
  value: DirectusSystemConfigRaw["ai_safety_settings"],
): AiSafetySettingsConfig | undefined {
  if (Array.isArray(value)) {
    return { safetySettings: parseSafetySettingEntries(value) };
  }
  if (isPlainRecord(value) && Array.isArray(value.safetySettings)) {
    return { safetySettings: parseSafetySettingEntries(value.safetySettings) };
  }
  return undefined;
}

function parseGuildEmojisMap(
  value: unknown,
): Record<string, string[]> | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const result: Record<string, string[]> = {};
  for (const [emoji, names] of Object.entries(value)) {
    if (!isSafeRecordKey(emoji)) {
      continue;
    }
    const parsedNames = parseStringArray(names);
    if (parsedNames) {
      setSafeProperty(result, emoji, parsedNames);
    }
  }
  return result;
}

function parseGuildMembersArray(
  value: unknown,
): GuildMembersConfigMember[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const members: GuildMembersConfigMember[] = [];
  for (const item of value) {
    if (
      isPlainRecord(item) &&
      typeof item.username === "string" &&
      typeof item.name === "string" &&
      typeof item.gender === "string"
    ) {
      members.push({
        username: item.username,
        name: item.name,
        gender: item.gender,
      });
    }
  }
  return members;
}

function extractCompareConfig(
  raw: DirectusGuildConfigRaw,
): ValorantFeaturesConfig["compare"] | undefined {
  const enabled = pickBoolean(raw.valorant_compare_enabled);
  if (enabled === undefined) {
    return undefined;
  }
  return { enabled };
}

function extractStatsSummaryConfig(
  raw: DirectusGuildConfigRaw,
): ValorantFeaturesConfig["statsSummary"] | undefined {
  const result: NonNullable<ValorantFeaturesConfig["statsSummary"]> = {};
  assignDefined(result, "enabled", pickBoolean(raw.valorant_stats_enabled));
  assignDefined(
    result,
    "defaultPeriod",
    pickEnum<
      NonNullable<
        NonNullable<ValorantFeaturesConfig["statsSummary"]>["defaultPeriod"]
      >
    >(raw.valorant_stats_default_period, VALID_VALORANT_STATS_PERIODS),
  );
  return nonEmptyOrUndefined(result);
}

function extractAutoRecapConfig(
  raw: DirectusGuildConfigRaw,
): ValorantFeaturesConfig["autoRecap"] | undefined {
  const result: NonNullable<ValorantFeaturesConfig["autoRecap"]> = {};
  assignDefined(
    result,
    "enabled",
    pickBoolean(raw.valorant_auto_recap_enabled),
  );
  assignDefined(
    result,
    "channelId",
    pickString(raw.valorant_auto_recap_channel_id),
  );
  assignDefined(
    result,
    "minTierAlert",
    pickFiniteNumber(raw.valorant_auto_recap_min_tier_alert),
  );
  assignDefined(
    result,
    "sportscasterBanter",
    pickBoolean(raw.valorant_auto_recap_sportscaster_banter),
  );
  return nonEmptyOrUndefined(result);
}

function extractLiveScoutingConfig(
  raw: DirectusGuildConfigRaw,
): ValorantFeaturesConfig["liveScouting"] | undefined {
  const result: NonNullable<ValorantFeaturesConfig["liveScouting"]> = {};
  assignDefined(
    result,
    "enabled",
    pickBoolean(raw.valorant_live_scouting_enabled),
  );
  assignDefined(
    result,
    "channelId",
    pickString(raw.valorant_live_scouting_channel_id),
  );
  assignDefined(
    result,
    "alertOnGameStart",
    pickBoolean(raw.valorant_live_scouting_alert_on_game_start),
  );
  return nonEmptyOrUndefined(result);
}

function extractRankRoleSyncConfig(
  raw: DirectusGuildConfigRaw,
): ValorantFeaturesConfig["rankRoleSync"] | undefined {
  const result: NonNullable<ValorantFeaturesConfig["rankRoleSync"]> = {};
  assignDefined(
    result,
    "enabled",
    pickBoolean(raw.valorant_rank_role_sync_enabled),
  );
  assignDefined(
    result,
    "roleMappings",
    parseStringRecord(raw.valorant_rank_role_mappings),
  );
  return nonEmptyOrUndefined(result);
}

function extractTiltProtectionConfig(
  raw: DirectusGuildConfigRaw,
): ValorantFeaturesConfig["tiltProtection"] | undefined {
  const result: NonNullable<ValorantFeaturesConfig["tiltProtection"]> = {};
  assignDefined(result, "enabled", pickBoolean(raw.valorant_tilt_enabled));
  assignDefined(
    result,
    "consecutiveLossesThreshold",
    pickFiniteNumber(raw.valorant_tilt_consecutive_losses_threshold),
  );
  assignDefined(
    result,
    "nightOwlHourStart",
    pickFiniteNumber(raw.valorant_tilt_night_owl_hour_start),
  );
  assignDefined(
    result,
    "nightOwlHourEnd",
    pickFiniteNumber(raw.valorant_tilt_night_owl_hour_end),
  );
  assignDefined(result, "dmAlert", pickBoolean(raw.valorant_tilt_dm_alert));
  return nonEmptyOrUndefined(result);
}

/**
 * Reconstructs a nested `ValorantFeaturesConfig` from flattened `valorant_*` Directus columns.
 */
export function extractValorantFeaturesFromRaw(
  raw: DirectusGuildConfigRaw,
): ValorantFeaturesConfig | undefined {
  const features: ValorantFeaturesConfig = {};
  assignDefined(features, "compare", extractCompareConfig(raw));
  assignDefined(features, "statsSummary", extractStatsSummaryConfig(raw));
  assignDefined(features, "autoRecap", extractAutoRecapConfig(raw));
  assignDefined(features, "liveScouting", extractLiveScoutingConfig(raw));
  assignDefined(features, "rankRoleSync", extractRankRoleSyncConfig(raw));
  assignDefined(features, "tiltProtection", extractTiltProtectionConfig(raw));
  return nonEmptyOrUndefined(features);
}

/**
 * Decomposes a nested `ValorantFeaturesConfig` into flattened `valorant_*` Directus columns.
 */
export function flattenValorantFeaturesToRaw(
  features?: ValorantFeaturesConfig,
): Partial<DirectusGuildConfigRaw> {
  if (!features) {
    return {};
  }
  const payload: Partial<DirectusGuildConfigRaw> = {};
  assignDefined(payload, "valorant_compare_enabled", features.compare?.enabled);
  assignDefined(
    payload,
    "valorant_stats_enabled",
    features.statsSummary?.enabled,
  );
  assignDefined(
    payload,
    "valorant_stats_default_period",
    features.statsSummary?.defaultPeriod,
  );
  assignDefined(
    payload,
    "valorant_auto_recap_enabled",
    features.autoRecap?.enabled,
  );
  assignDefined(
    payload,
    "valorant_auto_recap_channel_id",
    features.autoRecap?.channelId,
  );
  assignDefined(
    payload,
    "valorant_auto_recap_min_tier_alert",
    features.autoRecap?.minTierAlert,
  );
  assignDefined(
    payload,
    "valorant_auto_recap_sportscaster_banter",
    features.autoRecap?.sportscasterBanter,
  );
  assignDefined(
    payload,
    "valorant_live_scouting_enabled",
    features.liveScouting?.enabled,
  );
  assignDefined(
    payload,
    "valorant_live_scouting_channel_id",
    features.liveScouting?.channelId,
  );
  assignDefined(
    payload,
    "valorant_live_scouting_alert_on_game_start",
    features.liveScouting?.alertOnGameStart,
  );
  assignDefined(
    payload,
    "valorant_rank_role_sync_enabled",
    features.rankRoleSync?.enabled,
  );
  assignDefined(
    payload,
    "valorant_rank_role_mappings",
    cloneStringRecord(features.rankRoleSync?.roleMappings),
  );
  assignDefined(
    payload,
    "valorant_tilt_enabled",
    features.tiltProtection?.enabled,
  );
  assignDefined(
    payload,
    "valorant_tilt_consecutive_losses_threshold",
    features.tiltProtection?.consecutiveLossesThreshold,
  );
  assignDefined(
    payload,
    "valorant_tilt_night_owl_hour_start",
    features.tiltProtection?.nightOwlHourStart,
  );
  assignDefined(
    payload,
    "valorant_tilt_night_owl_hour_end",
    features.tiltProtection?.nightOwlHourEnd,
  );
  assignDefined(
    payload,
    "valorant_tilt_dm_alert",
    features.tiltProtection?.dmAlert,
  );
  return payload;
}

function extractToolsConfig(
  row: DirectusGuildConfigRaw,
): BotGuildToolsConfig | undefined {
  const result: BotGuildToolsConfig = {};
  assignDefined(result, "googleSearch", pickBoolean(row.tools_google_search));
  assignDefined(result, "discord", pickBoolean(row.tools_discord));
  return nonEmptyOrUndefined(result);
}

function extractSmartReplyConfig(
  row: DirectusGuildConfigRaw,
): SmartReplyConfig | undefined {
  const result: SmartReplyConfig = {};
  assignDefined(result, "enabled", pickBoolean(row.smart_reply_enabled));
  assignDefined(
    result,
    "mode",
    pickEnum<NonNullable<SmartReplyConfig["mode"]>>(
      row.smart_reply_mode,
      VALID_SMART_REPLY_MODES,
    ),
  );
  assignDefined(
    result,
    "classifierModel",
    parseModelConfig(row.smart_reply_classifier_model),
  );
  assignDefined(
    result,
    "chatBotModel",
    parseModelConfig(row.smart_reply_chat_bot_model),
  );
  assignDefined(
    result,
    "ambientConfidenceThreshold",
    pickFiniteNumber(row.smart_reply_ambient_confidence_threshold),
  );
  assignDefined(
    result,
    "debounceMs",
    pickFiniteNumber(row.smart_reply_debounce_ms),
  );
  assignDefined(
    result,
    "maxDebounceMs",
    pickFiniteNumber(row.smart_reply_max_debounce_ms),
  );
  assignDefined(
    result,
    "sessionTtlSeconds",
    pickFiniteNumber(row.smart_reply_session_ttl_seconds),
  );
  assignDefined(
    result,
    "replyStrategy",
    pickEnum<NonNullable<SmartReplyConfig["replyStrategy"]>>(
      row.smart_reply_strategy,
      VALID_SMART_REPLY_STRATEGIES,
    ),
  );
  assignDefined(
    result,
    "coalesceWindowMs",
    pickFiniteNumber(row.smart_reply_coalesce_window_ms),
  );
  assignDefined(
    result,
    "silenceDurationMinutes",
    pickFiniteNumber(row.smart_reply_silence_duration_minutes),
  );
  assignDefined(
    result,
    "ambientRateLimitSeconds",
    pickFiniteNumber(row.smart_reply_ambient_rate_limit_seconds),
  );
  assignDefined(
    result,
    "ambientSnapshotLimit",
    pickFiniteNumber(row.smart_reply_ambient_snapshot_limit),
  );
  assignDefined(
    result,
    "enableKeywordDismissal",
    pickBoolean(row.smart_reply_enable_keyword_dismissal),
  );
  assignDefined(
    result,
    "enableReactionDismissal",
    pickBoolean(row.smart_reply_enable_reaction_dismissal),
  );
  assignDefined(
    result,
    "sendTypingBehavior",
    pickEnum<NonNullable<SmartReplyConfig["sendTypingBehavior"]>>(
      row.smart_reply_send_typing_behavior,
      VALID_SEND_TYPING_BEHAVIORS,
    ),
  );
  assignDefined(
    result,
    "threadAutoListen",
    pickBoolean(row.smart_reply_thread_auto_listen),
  );
  assignDefined(
    result,
    "optOutTopicTag",
    pickString(row.smart_reply_opt_out_topic_tag),
  );
  return nonEmptyOrUndefined(result);
}

function extractRoastConfig(
  row: DirectusGuildConfigRaw,
): RoastFeatureConfig | undefined {
  const result: RoastFeatureConfig = {};
  assignDefined(result, "enabled", pickBoolean(row.roast_enabled));
  assignDefined(
    result,
    "defaultLocale",
    normalizeLocale(row.roast_default_locale),
  );
  assignDefined(
    result,
    "localeOverride",
    normalizeLocale(row.roast_locale_override),
  );
  assignDefined(
    result,
    "maxIntensity",
    pickEnum<NonNullable<RoastFeatureConfig["maxIntensity"]>>(
      row.roast_max_intensity,
      VALID_ROAST_INTENSITIES,
    ),
  );
  assignDefined(
    result,
    "allowedChannelIds",
    parseStringArray(row.roast_allowed_channel_ids),
  );
  assignDefined(
    result,
    "ignoredChannelIds",
    parseStringArray(row.roast_ignored_channel_ids),
  );
  assignDefined(result, "maxPerDay", pickFiniteNumber(row.roast_max_per_day));
  assignDefined(
    result,
    "targetShieldCooldownSeconds",
    pickFiniteNumber(row.roast_target_shield_cooldown_seconds),
  );
  assignDefined(
    result,
    "callerCooldownSeconds",
    pickFiniteNumber(row.roast_caller_cooldown_seconds),
  );
  assignDefined(
    result,
    "allowCounterRoast",
    pickBoolean(row.roast_allow_counter_roast),
  );
  return nonEmptyOrUndefined(result);
}

function extractModerationConfig(
  row: DirectusGuildConfigRaw,
): ModerationCapabilityConfig | undefined {
  const enabled = pickBoolean(row.moderation_enabled);
  if (enabled === undefined) {
    return undefined;
  }
  return { enabled };
}

function extractVoiceBouncerConfig(
  row: DirectusGuildConfigRaw,
): VoiceBouncerCapabilityConfig | undefined {
  const result: VoiceBouncerCapabilityConfig = {};
  assignDefined(result, "enabled", pickBoolean(row.voice_bouncer_enabled));
  assignDefined(
    result,
    "tagOnlyVoiceChannelIds",
    parseStringArray(row.voice_bouncer_tag_only_channel_ids),
  );
  assignDefined(
    result,
    "tagOnlyCategoryIds",
    parseStringArray(row.voice_bouncer_tag_only_category_ids),
  );
  assignDefined(
    result,
    "exemptRoleIds",
    parseStringArray(row.voice_bouncer_exempt_role_ids),
  );
  assignDefined(
    result,
    "fallbackChannelId",
    pickString(row.voice_bouncer_fallback_channel_id),
  );
  assignDefined(
    result,
    "action",
    pickEnum<NonNullable<VoiceBouncerCapabilityConfig["action"]>>(
      row.voice_bouncer_action,
      VALID_VOICE_BOUNCER_ACTIONS,
    ),
  );
  assignDefined(
    result,
    "warningMessage",
    pickString(row.voice_bouncer_warning_message),
  );
  return nonEmptyOrUndefined(result);
}

function extractMatchmakingConfig(
  row: DirectusGuildConfigRaw,
): MatchmakingCapabilityConfig | undefined {
  const result: MatchmakingCapabilityConfig = {};
  assignDefined(result, "enabled", pickBoolean(row.matchmaking_enabled));
  assignDefined(
    result,
    "lobbyVoiceChannelId",
    pickString(row.matchmaking_lobby_channel_id),
  );
  assignDefined(
    result,
    "team1VoiceChannelId",
    pickString(row.matchmaking_team1_channel_id),
  );
  assignDefined(
    result,
    "team2VoiceChannelId",
    pickString(row.matchmaking_team2_channel_id),
  );
  assignDefined(
    result,
    "matchCategoryId",
    pickString(row.matchmaking_category_id),
  );
  assignDefined(result, "mapPool", parseStringArray(row.matchmaking_map_pool));
  assignDefined(
    result,
    "defaultKFactor",
    pickFiniteNumber(row.matchmaking_default_k_factor),
  );
  assignDefined(
    result,
    "initialElo",
    pickFiniteNumber(row.matchmaking_initial_elo),
  );
  assignDefined(
    result,
    "scoreReportingTimeoutMinutes",
    pickFiniteNumber(row.matchmaking_score_timeout_minutes),
  );
  assignDefined(
    result,
    "autoMovePlayers",
    pickBoolean(row.matchmaking_auto_move_players),
  );
  return nonEmptyOrUndefined(result);
}

function extractValorantConfig(
  row: DirectusGuildConfigRaw,
): ValorantCapabilityConfig | undefined {
  const result: ValorantCapabilityConfig = {};
  assignDefined(result, "enabled", pickBoolean(row.valorant_enabled));
  assignDefined(result, "features", extractValorantFeaturesFromRaw(row));
  return nonEmptyOrUndefined(result);
}

function extractVoiceCompanionConfig(
  row: DirectusGuildConfigRaw,
): VoiceCompanionCapabilityConfig | undefined {
  const result: VoiceCompanionCapabilityConfig = {};
  assignDefined(result, "enabled", pickBoolean(row.voice_companion_enabled));
  assignDefined(
    result,
    "autoJoinChannelId",
    pickString(row.voice_companion_auto_join_channel_id),
  );
  assignDefined(
    result,
    "inactivityTimeoutMinutes",
    pickFiniteNumber(row.voice_companion_inactivity_timeout_minutes),
  );
  assignDefined(
    result,
    "emptyChannelGraceSeconds",
    pickFiniteNumber(row.voice_companion_empty_channel_grace_seconds),
  );
  assignDefined(
    result,
    "modelId",
    pickEnum<NonNullable<VoiceCompanionCapabilityConfig["modelId"]>>(
      row.voice_companion_model_id,
      VALID_VOICE_COMPANION_MODEL_IDS,
    ),
  );
  assignDefined(
    result,
    "voiceName",
    pickEnum<NonNullable<VoiceCompanionCapabilityConfig["voiceName"]>>(
      row.voice_companion_voice_name,
      VALID_VOICE_COMPANION_VOICE_NAMES,
    ),
  );
  assignDefined(
    result,
    "systemInstruction",
    pickString(row.voice_companion_system_instruction),
  );
  assignDefined(
    result,
    "energyThreshold",
    pickFiniteNumber(row.voice_companion_energy_threshold),
  );
  assignDefined(
    result,
    "bargeInSensitivity",
    pickEnum<NonNullable<VoiceCompanionCapabilityConfig["bargeInSensitivity"]>>(
      row.voice_companion_barge_in_sensitivity,
      VALID_VOICE_COMPANION_BARGE_IN,
    ),
  );
  assignDefined(
    result,
    "participationMode",
    pickEnum<NonNullable<VoiceCompanionCapabilityConfig["participationMode"]>>(
      row.voice_companion_participation_mode,
      VALID_VOICE_COMPANION_PARTICIPATION,
    ),
  );
  return nonEmptyOrUndefined(result);
}

/**
 * Maps a raw flattened Directus `bot_guild_configs` row into a `BotGuildConfig`.
 */
export function mapDirectusRowToBotGuildConfig(
  row: DirectusGuildConfigRaw,
): BotGuildConfig {
  const result: BotGuildConfig = {
    replyChannelIds: parseStringArray(row.reply_channel_ids) ?? [],
    ignoredChannelIds: parseStringArray(row.ignored_channel_ids) ?? [],
    respondToMentions: pickBoolean(row.respond_to_mentions) ?? false,
  };

  assignDefined(result, "botName", pickString(row.bot_name));
  assignDefined(result, "lockName", pickBoolean(row.lock_name));
  assignDefined(result, "personalization", pickString(row.personalization));
  assignDefined(
    result,
    "personalizationMode",
    pickEnum<NonNullable<BotGuildConfig["personalizationMode"]>>(
      row.personalization_mode,
      VALID_PERSONALIZATION_MODES,
    ),
  );
  assignDefined(
    result,
    "systemInstruction",
    pickString(row.system_instruction),
  );
  assignDefined(result, "replyDelay", pickFiniteNumber(row.reply_delay));
  assignDefined(result, "localeOverride", normalizeLocale(row.locale_override));
  assignDefined(result, "chatBotModel", parseModelConfig(row.chat_bot_model));

  assignDefined(result, "tools", extractToolsConfig(row));
  assignDefined(result, "smartReply", extractSmartReplyConfig(row));
  assignDefined(result, "roast", extractRoastConfig(row));
  assignDefined(result, "moderation", extractModerationConfig(row));
  assignDefined(result, "voiceBouncer", extractVoiceBouncerConfig(row));
  assignDefined(result, "matchmaking", extractMatchmakingConfig(row));
  assignDefined(result, "valorant", extractValorantConfig(row));
  assignDefined(result, "voiceCompanion", extractVoiceCompanionConfig(row));

  return result;
}

function flattenSmartReplyConfig(
  smartReply?: SmartReplyConfig,
): Partial<DirectusGuildConfigRaw> {
  if (!smartReply) {
    return {};
  }
  const payload: Partial<DirectusGuildConfigRaw> = {};
  assignDefined(payload, "smart_reply_enabled", smartReply.enabled);
  assignDefined(payload, "smart_reply_mode", smartReply.mode);
  assignDefined(
    payload,
    "smart_reply_classifier_model",
    cloneModelConfig(smartReply.classifierModel),
  );
  assignDefined(
    payload,
    "smart_reply_chat_bot_model",
    cloneModelConfig(smartReply.chatBotModel),
  );
  assignDefined(
    payload,
    "smart_reply_ambient_confidence_threshold",
    smartReply.ambientConfidenceThreshold,
  );
  assignDefined(payload, "smart_reply_debounce_ms", smartReply.debounceMs);
  assignDefined(
    payload,
    "smart_reply_max_debounce_ms",
    smartReply.maxDebounceMs,
  );
  assignDefined(
    payload,
    "smart_reply_session_ttl_seconds",
    smartReply.sessionTtlSeconds,
  );
  assignDefined(payload, "smart_reply_strategy", smartReply.replyStrategy);
  assignDefined(
    payload,
    "smart_reply_coalesce_window_ms",
    smartReply.coalesceWindowMs,
  );
  assignDefined(
    payload,
    "smart_reply_silence_duration_minutes",
    smartReply.silenceDurationMinutes,
  );
  assignDefined(
    payload,
    "smart_reply_ambient_rate_limit_seconds",
    smartReply.ambientRateLimitSeconds,
  );
  assignDefined(
    payload,
    "smart_reply_ambient_snapshot_limit",
    smartReply.ambientSnapshotLimit,
  );
  assignDefined(
    payload,
    "smart_reply_enable_keyword_dismissal",
    smartReply.enableKeywordDismissal,
  );
  assignDefined(
    payload,
    "smart_reply_enable_reaction_dismissal",
    smartReply.enableReactionDismissal,
  );
  assignDefined(
    payload,
    "smart_reply_send_typing_behavior",
    smartReply.sendTypingBehavior,
  );
  assignDefined(
    payload,
    "smart_reply_thread_auto_listen",
    smartReply.threadAutoListen,
  );
  assignDefined(
    payload,
    "smart_reply_opt_out_topic_tag",
    smartReply.optOutTopicTag,
  );
  return payload;
}

function flattenRoastConfig(
  roast?: RoastFeatureConfig,
): Partial<DirectusGuildConfigRaw> {
  if (!roast) {
    return {};
  }
  const payload: Partial<DirectusGuildConfigRaw> = {};
  assignDefined(payload, "roast_enabled", roast.enabled);
  assignDefined(payload, "roast_default_locale", roast.defaultLocale);
  assignDefined(payload, "roast_locale_override", roast.localeOverride);
  assignDefined(payload, "roast_max_intensity", roast.maxIntensity);
  assignDefined(
    payload,
    "roast_allowed_channel_ids",
    cloneStringArray(roast.allowedChannelIds),
  );
  assignDefined(
    payload,
    "roast_ignored_channel_ids",
    cloneStringArray(roast.ignoredChannelIds),
  );
  assignDefined(payload, "roast_max_per_day", roast.maxPerDay);
  assignDefined(
    payload,
    "roast_target_shield_cooldown_seconds",
    roast.targetShieldCooldownSeconds,
  );
  assignDefined(
    payload,
    "roast_caller_cooldown_seconds",
    roast.callerCooldownSeconds,
  );
  assignDefined(payload, "roast_allow_counter_roast", roast.allowCounterRoast);
  return payload;
}

function flattenVoiceBouncerConfig(
  voiceBouncer?: VoiceBouncerCapabilityConfig,
): Partial<DirectusGuildConfigRaw> {
  if (!voiceBouncer) {
    return {};
  }
  const payload: Partial<DirectusGuildConfigRaw> = {};
  assignDefined(payload, "voice_bouncer_enabled", voiceBouncer.enabled);
  assignDefined(
    payload,
    "voice_bouncer_tag_only_channel_ids",
    cloneStringArray(voiceBouncer.tagOnlyVoiceChannelIds),
  );
  assignDefined(
    payload,
    "voice_bouncer_tag_only_category_ids",
    cloneStringArray(voiceBouncer.tagOnlyCategoryIds),
  );
  assignDefined(
    payload,
    "voice_bouncer_exempt_role_ids",
    cloneStringArray(voiceBouncer.exemptRoleIds),
  );
  assignDefined(
    payload,
    "voice_bouncer_fallback_channel_id",
    voiceBouncer.fallbackChannelId,
  );
  assignDefined(payload, "voice_bouncer_action", voiceBouncer.action);
  assignDefined(
    payload,
    "voice_bouncer_warning_message",
    voiceBouncer.warningMessage,
  );
  return payload;
}

function flattenMatchmakingConfig(
  matchmaking?: MatchmakingCapabilityConfig,
): Partial<DirectusGuildConfigRaw> {
  if (!matchmaking) {
    return {};
  }
  const payload: Partial<DirectusGuildConfigRaw> = {};
  assignDefined(payload, "matchmaking_enabled", matchmaking.enabled);
  assignDefined(
    payload,
    "matchmaking_lobby_channel_id",
    matchmaking.lobbyVoiceChannelId,
  );
  assignDefined(
    payload,
    "matchmaking_team1_channel_id",
    matchmaking.team1VoiceChannelId,
  );
  assignDefined(
    payload,
    "matchmaking_team2_channel_id",
    matchmaking.team2VoiceChannelId,
  );
  assignDefined(
    payload,
    "matchmaking_category_id",
    matchmaking.matchCategoryId,
  );
  assignDefined(
    payload,
    "matchmaking_map_pool",
    cloneStringArray(matchmaking.mapPool),
  );
  assignDefined(
    payload,
    "matchmaking_default_k_factor",
    matchmaking.defaultKFactor,
  );
  assignDefined(payload, "matchmaking_initial_elo", matchmaking.initialElo);
  assignDefined(
    payload,
    "matchmaking_score_timeout_minutes",
    matchmaking.scoreReportingTimeoutMinutes,
  );
  assignDefined(
    payload,
    "matchmaking_auto_move_players",
    matchmaking.autoMovePlayers,
  );
  return payload;
}

function flattenVoiceCompanionConfig(
  voiceCompanion?: VoiceCompanionCapabilityConfig,
): Partial<DirectusGuildConfigRaw> {
  if (!voiceCompanion) {
    return {};
  }
  const payload: Partial<DirectusGuildConfigRaw> = {};
  assignDefined(payload, "voice_companion_enabled", voiceCompanion.enabled);
  assignDefined(
    payload,
    "voice_companion_auto_join_channel_id",
    voiceCompanion.autoJoinChannelId,
  );
  assignDefined(
    payload,
    "voice_companion_inactivity_timeout_minutes",
    voiceCompanion.inactivityTimeoutMinutes,
  );
  assignDefined(
    payload,
    "voice_companion_empty_channel_grace_seconds",
    voiceCompanion.emptyChannelGraceSeconds,
  );
  assignDefined(payload, "voice_companion_model_id", voiceCompanion.modelId);
  assignDefined(
    payload,
    "voice_companion_voice_name",
    voiceCompanion.voiceName,
  );
  assignDefined(
    payload,
    "voice_companion_system_instruction",
    voiceCompanion.systemInstruction,
  );
  assignDefined(
    payload,
    "voice_companion_energy_threshold",
    voiceCompanion.energyThreshold,
  );
  assignDefined(
    payload,
    "voice_companion_barge_in_sensitivity",
    voiceCompanion.bargeInSensitivity,
  );
  assignDefined(
    payload,
    "voice_companion_participation_mode",
    voiceCompanion.participationMode,
  );
  return payload;
}

/**
 * Maps a partial `BotGuildConfig` into flattened `DirectusGuildConfigRaw` columns without inventing defaults.
 */
export function mapPartialBotGuildConfigToDirectusPayload(
  partial: Partial<BotGuildConfig>,
): Partial<DirectusGuildConfigRaw> {
  const payload: Partial<DirectusGuildConfigRaw> = {};

  if (partial.replyChannelIds !== undefined) {
    payload.reply_channel_ids = [...partial.replyChannelIds];
  }
  if (partial.ignoredChannelIds !== undefined) {
    payload.ignored_channel_ids = [...partial.ignoredChannelIds];
  }
  assignDefined(payload, "respond_to_mentions", partial.respondToMentions);
  assignDefined(payload, "bot_name", partial.botName);
  assignDefined(payload, "lock_name", partial.lockName);
  assignDefined(payload, "personalization", partial.personalization);
  assignDefined(payload, "personalization_mode", partial.personalizationMode);
  assignDefined(payload, "system_instruction", partial.systemInstruction);
  assignDefined(payload, "reply_delay", partial.replyDelay);
  assignDefined(payload, "locale_override", partial.localeOverride);
  assignDefined(
    payload,
    "chat_bot_model",
    cloneModelConfig(partial.chatBotModel),
  );
  assignDefined(payload, "tools_google_search", partial.tools?.googleSearch);
  assignDefined(payload, "tools_discord", partial.tools?.discord);
  assignDefined(payload, "moderation_enabled", partial.moderation?.enabled);
  assignDefined(payload, "valorant_enabled", partial.valorant?.enabled);

  return {
    ...payload,
    ...flattenSmartReplyConfig(partial.smartReply),
    ...flattenRoastConfig(partial.roast),
    ...flattenVoiceBouncerConfig(partial.voiceBouncer),
    ...flattenMatchmakingConfig(partial.matchmaking),
    ...flattenValorantFeaturesToRaw(partial.valorant?.features),
    ...flattenVoiceCompanionConfig(partial.voiceCompanion),
  };
}

/**
 * Maps a `BotGuildConfig` into a flattened `DirectusGuildConfigRaw` update/create payload.
 */
export function mapBotGuildConfigToDirectusPayload(
  botId: string,
  guildId: string,
  config: BotGuildConfig,
): Partial<DirectusGuildConfigRaw> {
  return {
    bot_id: botId || DEFAULT_BOT_ID,
    guild_id: guildId,
    ...mapPartialBotGuildConfigToDirectusPayload(config),
  };
}

/**
 * Maps partial `AppConfigData` system fields into a `DirectusSystemConfigRaw` payload.
 */
export function mapAppConfigToDirectusSystemPayload(
  config: Partial<AppConfigData>,
): Partial<DirectusSystemConfigRaw> {
  const payload: Partial<DirectusSystemConfigRaw> = {};
  assignDefined(payload, "ai_provider", config.aiProvider);
  assignDefined(payload, "ai_model_id", config.aiModelId);
  assignDefined(payload, "ai_api_endpoint", config.aiApiEndpoint);
  assignDefined(payload, "ai_project_id", config.aiProjectId);
  assignDefined(payload, "ai_location_id", config.aiLocationId);
  assignDefined(payload, "ai_max_output_tokens", config.aiMaxOutputTokens);
  assignDefined(
    payload,
    "ai_max_conversation_history",
    config.aiMaxConversationHistory,
  );
  if (
    config.aiSafetySettings &&
    Array.isArray(config.aiSafetySettings.safetySettings)
  ) {
    payload.ai_safety_settings = {
      safetySettings: config.aiSafetySettings.safetySettings.map((entry) => ({
        ...entry,
      })),
    };
  }
  assignDefined(payload, "memory_store_type", config.memoryStoreType);
  assignDefined(payload, "check_in_leaderboard", config.checkInLeaderboard);
  return payload;
}

function cloneBotGuildsMap(
  guilds: Record<string, BotGuildConfig> | undefined,
): Record<string, BotGuildConfig> {
  const cloned: Record<string, BotGuildConfig> = {};
  if (!guilds) {
    return cloned;
  }
  for (const [guildId, guildConfig] of Object.entries(guilds)) {
    if (isSafeRecordKey(guildId)) {
      setSafeProperty(cloned, guildId, structuredClone(guildConfig));
    }
  }
  return cloned;
}

function cloneBotsConfig(sourceBots: BotsConfig | undefined): BotsConfig {
  const cloned: BotsConfig = {
    chatBot: { guilds: cloneBotGuildsMap(sourceBots?.chatBot?.guilds) },
    policeBot: { guilds: cloneBotGuildsMap(sourceBots?.policeBot?.guilds) },
  };
  if (!sourceBots) {
    return cloned;
  }
  for (const [botKey, botConfig] of Object.entries(sourceBots)) {
    if (!isSafeRecordKey(botKey) || Object.hasOwn(cloned, botKey)) {
      continue;
    }
    const existingBot: BotConfig = {
      guilds: cloneBotGuildsMap(botConfig?.guilds),
    };
    setSafeProperty(cloned, botKey, existingBot);
  }
  return cloned;
}

function cloneGuildEmojis(source: GuildEmojisConfig): GuildEmojisConfig {
  const cloned: GuildEmojisConfig = {};
  for (const [guildId, emojiMap] of Object.entries(source)) {
    if (!(isSafeRecordKey(guildId) && isPlainRecord(emojiMap))) {
      continue;
    }
    const copiedMap: Record<string, string[]> = {};
    for (const [emoji, names] of Object.entries(emojiMap)) {
      if (isSafeRecordKey(emoji) && Array.isArray(names)) {
        setSafeProperty(copiedMap, emoji, [...names]);
      }
    }
    setSafeProperty(cloned, guildId, copiedMap);
  }
  return cloned;
}

function cloneGuildMembers(source: GuildMembersConfig): GuildMembersConfig {
  const cloned: GuildMembersConfig = {};
  for (const [guildId, members] of Object.entries(source)) {
    if (!(isSafeRecordKey(guildId) && Array.isArray(members))) {
      continue;
    }
    setSafeProperty(
      cloned,
      guildId,
      members.map((member) => ({ ...member })),
    );
  }
  return cloned;
}

function mergeSubObject<T extends object>(
  fallback: T | undefined,
  incoming: T | undefined,
): T | undefined {
  if (!incoming) {
    return fallback;
  }
  return fallback ? { ...fallback, ...incoming } : incoming;
}

function mergeValorantFeatures(
  fallback: ValorantFeaturesConfig | undefined,
  incoming: ValorantFeaturesConfig | undefined,
): ValorantFeaturesConfig | undefined {
  if (!incoming) {
    return fallback;
  }
  if (!fallback) {
    return incoming;
  }
  const merged: ValorantFeaturesConfig = { ...fallback };
  assignDefined(
    merged,
    "compare",
    mergeSubObject(fallback.compare, incoming.compare),
  );
  assignDefined(
    merged,
    "statsSummary",
    mergeSubObject(fallback.statsSummary, incoming.statsSummary),
  );
  assignDefined(
    merged,
    "autoRecap",
    mergeSubObject(fallback.autoRecap, incoming.autoRecap),
  );
  assignDefined(
    merged,
    "liveScouting",
    mergeSubObject(fallback.liveScouting, incoming.liveScouting),
  );
  assignDefined(
    merged,
    "rankRoleSync",
    mergeSubObject(fallback.rankRoleSync, incoming.rankRoleSync),
  );
  assignDefined(
    merged,
    "tiltProtection",
    mergeSubObject(fallback.tiltProtection, incoming.tiltProtection),
  );
  return nonEmptyOrUndefined(merged);
}

function mergeValorantConfig(
  fallback: ValorantCapabilityConfig | undefined,
  incoming: ValorantCapabilityConfig | undefined,
): ValorantCapabilityConfig | undefined {
  if (!incoming) {
    return fallback;
  }
  if (!fallback) {
    return incoming;
  }
  const merged: ValorantCapabilityConfig = { ...fallback };
  assignDefined(merged, "enabled", incoming.enabled);
  assignDefined(
    merged,
    "features",
    mergeValorantFeatures(fallback.features, incoming.features),
  );
  return nonEmptyOrUndefined(merged);
}

function mergeGuildRowOverFallback(
  fallback: BotGuildConfig,
  row: DirectusGuildConfigRaw,
): BotGuildConfig {
  const mapped = mapDirectusRowToBotGuildConfig(row);
  const merged: BotGuildConfig = {
    ...fallback,
    replyChannelIds:
      parseStringArray(row.reply_channel_ids) ?? fallback.replyChannelIds,
    ignoredChannelIds:
      parseStringArray(row.ignored_channel_ids) ?? fallback.ignoredChannelIds,
    respondToMentions:
      pickBoolean(row.respond_to_mentions) ?? fallback.respondToMentions,
  };

  assignDefined(merged, "botName", mapped.botName);
  assignDefined(merged, "lockName", mapped.lockName);
  assignDefined(merged, "personalization", mapped.personalization);
  assignDefined(merged, "personalizationMode", mapped.personalizationMode);
  assignDefined(merged, "systemInstruction", mapped.systemInstruction);
  assignDefined(merged, "replyDelay", mapped.replyDelay);
  assignDefined(merged, "localeOverride", mapped.localeOverride);
  assignDefined(merged, "chatBotModel", mapped.chatBotModel);

  assignDefined(merged, "tools", mergeSubObject(fallback.tools, mapped.tools));
  assignDefined(
    merged,
    "smartReply",
    mergeSubObject(fallback.smartReply, mapped.smartReply),
  );
  assignDefined(merged, "roast", mergeSubObject(fallback.roast, mapped.roast));
  assignDefined(
    merged,
    "moderation",
    mergeSubObject(fallback.moderation, mapped.moderation),
  );
  assignDefined(
    merged,
    "voiceBouncer",
    mergeSubObject(fallback.voiceBouncer, mapped.voiceBouncer),
  );
  assignDefined(
    merged,
    "matchmaking",
    mergeSubObject(fallback.matchmaking, mapped.matchmaking),
  );
  assignDefined(
    merged,
    "valorant",
    mergeValorantConfig(fallback.valorant, mapped.valorant),
  );
  assignDefined(
    merged,
    "voiceCompanion",
    mergeSubObject(fallback.voiceCompanion, mapped.voiceCompanion),
  );

  return merged;
}

function applyGuildRow(
  row: DirectusGuildConfigRaw,
  bots: BotsConfig,
  guildEmojis: GuildEmojisConfig,
  guildMembers: GuildMembersConfig,
): void {
  if (!isSafeRecordKey(row.guild_id)) {
    return;
  }
  const botId = row.bot_id || DEFAULT_BOT_ID;
  if (!isSafeRecordKey(botId)) {
    return;
  }
  if (!Object.hasOwn(bots, botId)) {
    setSafeProperty(bots, botId, { guilds: {} });
  }
  const existingFallback = Object.hasOwn(bots[botId].guilds, row.guild_id)
    ? bots[botId].guilds[row.guild_id]
    : undefined;
  const resolvedGuildConfig = existingFallback
    ? mergeGuildRowOverFallback(existingFallback, row)
    : mapDirectusRowToBotGuildConfig(row);
  setSafeProperty(bots[botId].guilds, row.guild_id, resolvedGuildConfig);

  const parsedEmojis = parseGuildEmojisMap(row.guild_emojis);
  if (parsedEmojis !== undefined) {
    setSafeProperty(guildEmojis, row.guild_id, parsedEmojis);
  }

  const parsedMembers = parseGuildMembersArray(row.guild_members);
  if (parsedMembers !== undefined) {
    setSafeProperty(guildMembers, row.guild_id, parsedMembers);
  }
}

function resolveMemoryStoreType(
  rawValue: DirectusSystemConfigRaw["memory_store_type"],
  fallback: AppConfigData["memoryStoreType"],
): AppConfigData["memoryStoreType"] {
  if (typeof rawValue === "string" && VALID_MEMORY_STORE_TYPES.has(rawValue)) {
    return rawValue;
  }
  return fallback;
}

function resolveSafetySettings(
  rawValue: DirectusSystemConfigRaw["ai_safety_settings"],
  fallback: AiSafetySettingsConfig,
): AiSafetySettingsConfig {
  const parsed = parseSafetySettings(rawValue);
  if (parsed) {
    return parsed;
  }
  return {
    safetySettings: fallback.safetySettings.map((entry) => ({ ...entry })),
  };
}

/**
 * Combines Directus `bot_system_config` and `bot_guild_configs` rows with a fallback `AppConfigData`.
 * Never mutates `fallbackLocalConfig` or input rows.
 */
export function mapDirectusToAppConfig(
  systemRow: DirectusSystemConfigRaw | null | undefined,
  guildRows: readonly DirectusGuildConfigRaw[],
  fallbackLocalConfig: AppConfigData,
): AppConfigData {
  const bots = cloneBotsConfig(fallbackLocalConfig.bots);
  const guildEmojis = cloneGuildEmojis(fallbackLocalConfig.guildEmojis);
  const guildMembers = cloneGuildMembers(fallbackLocalConfig.guildMembers);

  for (const row of guildRows) {
    applyGuildRow(row, bots, guildEmojis, guildMembers);
  }

  return {
    guildEmojis,
    guildMembers,
    bots,
    checkInLeaderboard:
      pickString(systemRow?.check_in_leaderboard) ??
      fallbackLocalConfig.checkInLeaderboard,
    aiSafetySettings: resolveSafetySettings(
      systemRow?.ai_safety_settings,
      fallbackLocalConfig.aiSafetySettings,
    ),
    aiProjectId:
      pickString(systemRow?.ai_project_id) ?? fallbackLocalConfig.aiProjectId,
    aiModelId:
      pickNonEmptyString(systemRow?.ai_model_id) ??
      fallbackLocalConfig.aiModelId,
    aiMaxOutputTokens:
      pickPositiveNumber(systemRow?.ai_max_output_tokens) ??
      fallbackLocalConfig.aiMaxOutputTokens,
    aiLocationId:
      pickString(systemRow?.ai_location_id) ?? fallbackLocalConfig.aiLocationId,
    aiProvider:
      pickEnum<AppConfigData["aiProvider"]>(
        systemRow?.ai_provider,
        VALID_AI_PROVIDERS,
      ) ?? fallbackLocalConfig.aiProvider,
    aiApiEndpoint:
      pickString(systemRow?.ai_api_endpoint) ??
      fallbackLocalConfig.aiApiEndpoint,
    aiMaxConversationHistory:
      pickNonNegativeNumber(systemRow?.ai_max_conversation_history) ??
      fallbackLocalConfig.aiMaxConversationHistory,
    memoryStoreType: resolveMemoryStoreType(
      systemRow?.memory_store_type,
      fallbackLocalConfig.memoryStoreType,
    ),
  };
}
