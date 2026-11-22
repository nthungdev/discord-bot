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

function assignIfNotNull<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | null | undefined,
): void {
  if (value != null) {
    target[key] = value;
  }
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
  if (typeof value.temperature === "number") {
    model.temperature = value.temperature;
  }
  if (typeof value.maxOutputTokens === "number") {
    model.maxOutputTokens = value.maxOutputTokens;
  }
  if (typeof value.topP === "number") {
    model.topP = value.topP;
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
  if (raw.valorant_compare_enabled == null) {
    return undefined;
  }
  return { enabled: raw.valorant_compare_enabled };
}

function extractStatsSummaryConfig(
  raw: DirectusGuildConfigRaw,
): ValorantFeaturesConfig["statsSummary"] | undefined {
  const result: NonNullable<ValorantFeaturesConfig["statsSummary"]> = {};
  assignIfNotNull(result, "enabled", raw.valorant_stats_enabled);
  assignIfNotNull(result, "defaultPeriod", raw.valorant_stats_default_period);
  return nonEmptyOrUndefined(result);
}

function extractAutoRecapConfig(
  raw: DirectusGuildConfigRaw,
): ValorantFeaturesConfig["autoRecap"] | undefined {
  const result: NonNullable<ValorantFeaturesConfig["autoRecap"]> = {};
  assignIfNotNull(result, "enabled", raw.valorant_auto_recap_enabled);
  assignIfNotNull(result, "channelId", raw.valorant_auto_recap_channel_id);
  assignIfNotNull(
    result,
    "minTierAlert",
    raw.valorant_auto_recap_min_tier_alert,
  );
  assignIfNotNull(
    result,
    "sportscasterBanter",
    raw.valorant_auto_recap_sportscaster_banter,
  );
  return nonEmptyOrUndefined(result);
}

function extractLiveScoutingConfig(
  raw: DirectusGuildConfigRaw,
): ValorantFeaturesConfig["liveScouting"] | undefined {
  const result: NonNullable<ValorantFeaturesConfig["liveScouting"]> = {};
  assignIfNotNull(result, "enabled", raw.valorant_live_scouting_enabled);
  assignIfNotNull(result, "channelId", raw.valorant_live_scouting_channel_id);
  assignIfNotNull(
    result,
    "alertOnGameStart",
    raw.valorant_live_scouting_alert_on_game_start,
  );
  return nonEmptyOrUndefined(result);
}

function extractRankRoleSyncConfig(
  raw: DirectusGuildConfigRaw,
): ValorantFeaturesConfig["rankRoleSync"] | undefined {
  const result: NonNullable<ValorantFeaturesConfig["rankRoleSync"]> = {};
  assignIfNotNull(result, "enabled", raw.valorant_rank_role_sync_enabled);
  assignIfNotNull(
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
  assignIfNotNull(result, "enabled", raw.valorant_tilt_enabled);
  assignIfNotNull(
    result,
    "consecutiveLossesThreshold",
    raw.valorant_tilt_consecutive_losses_threshold,
  );
  assignIfNotNull(
    result,
    "nightOwlHourStart",
    raw.valorant_tilt_night_owl_hour_start,
  );
  assignIfNotNull(
    result,
    "nightOwlHourEnd",
    raw.valorant_tilt_night_owl_hour_end,
  );
  assignIfNotNull(result, "dmAlert", raw.valorant_tilt_dm_alert);
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
  assignIfNotNull(result, "googleSearch", row.tools_google_search);
  assignIfNotNull(result, "discord", row.tools_discord);
  return nonEmptyOrUndefined(result);
}

function extractSmartReplyConfig(
  row: DirectusGuildConfigRaw,
): SmartReplyConfig | undefined {
  const result: SmartReplyConfig = {};
  assignIfNotNull(result, "enabled", row.smart_reply_enabled);
  assignIfNotNull(result, "mode", row.smart_reply_mode);
  assignIfNotNull(
    result,
    "classifierModel",
    parseModelConfig(row.smart_reply_classifier_model),
  );
  assignIfNotNull(
    result,
    "chatBotModel",
    parseModelConfig(row.smart_reply_chat_bot_model),
  );
  assignIfNotNull(
    result,
    "ambientConfidenceThreshold",
    row.smart_reply_ambient_confidence_threshold,
  );
  assignIfNotNull(result, "debounceMs", row.smart_reply_debounce_ms);
  assignIfNotNull(result, "maxDebounceMs", row.smart_reply_max_debounce_ms);
  assignIfNotNull(
    result,
    "sessionTtlSeconds",
    row.smart_reply_session_ttl_seconds,
  );
  assignIfNotNull(result, "replyStrategy", row.smart_reply_strategy);
  assignIfNotNull(
    result,
    "coalesceWindowMs",
    row.smart_reply_coalesce_window_ms,
  );
  assignIfNotNull(
    result,
    "silenceDurationMinutes",
    row.smart_reply_silence_duration_minutes,
  );
  assignIfNotNull(
    result,
    "ambientRateLimitSeconds",
    row.smart_reply_ambient_rate_limit_seconds,
  );
  assignIfNotNull(
    result,
    "ambientSnapshotLimit",
    row.smart_reply_ambient_snapshot_limit,
  );
  assignIfNotNull(
    result,
    "enableKeywordDismissal",
    row.smart_reply_enable_keyword_dismissal,
  );
  assignIfNotNull(
    result,
    "enableReactionDismissal",
    row.smart_reply_enable_reaction_dismissal,
  );
  assignIfNotNull(
    result,
    "sendTypingBehavior",
    row.smart_reply_send_typing_behavior,
  );
  assignIfNotNull(
    result,
    "threadAutoListen",
    row.smart_reply_thread_auto_listen,
  );
  assignIfNotNull(result, "optOutTopicTag", row.smart_reply_opt_out_topic_tag);
  return nonEmptyOrUndefined(result);
}

function extractRoastConfig(
  row: DirectusGuildConfigRaw,
): RoastFeatureConfig | undefined {
  const result: RoastFeatureConfig = {};
  assignIfNotNull(result, "enabled", row.roast_enabled);
  assignIfNotNull(
    result,
    "defaultLocale",
    normalizeLocale(row.roast_default_locale),
  );
  assignIfNotNull(
    result,
    "localeOverride",
    normalizeLocale(row.roast_locale_override),
  );
  assignIfNotNull(
    result,
    "maxIntensity",
    pickEnum<NonNullable<RoastFeatureConfig["maxIntensity"]>>(
      row.roast_max_intensity,
      VALID_ROAST_INTENSITIES,
    ),
  );
  assignIfNotNull(
    result,
    "allowedChannelIds",
    parseStringArray(row.roast_allowed_channel_ids),
  );
  assignIfNotNull(
    result,
    "ignoredChannelIds",
    parseStringArray(row.roast_ignored_channel_ids),
  );
  assignIfNotNull(result, "maxPerDay", pickFiniteNumber(row.roast_max_per_day));
  assignIfNotNull(
    result,
    "targetShieldCooldownSeconds",
    pickFiniteNumber(row.roast_target_shield_cooldown_seconds),
  );
  assignIfNotNull(
    result,
    "callerCooldownSeconds",
    pickFiniteNumber(row.roast_caller_cooldown_seconds),
  );
  assignIfNotNull(result, "allowCounterRoast", row.roast_allow_counter_roast);
  return nonEmptyOrUndefined(result);
}

function extractModerationConfig(
  row: DirectusGuildConfigRaw,
): ModerationCapabilityConfig | undefined {
  if (row.moderation_enabled == null) {
    return undefined;
  }
  return { enabled: row.moderation_enabled };
}

function extractVoiceBouncerConfig(
  row: DirectusGuildConfigRaw,
): VoiceBouncerCapabilityConfig | undefined {
  const result: VoiceBouncerCapabilityConfig = {};
  assignIfNotNull(result, "enabled", row.voice_bouncer_enabled);
  assignIfNotNull(
    result,
    "tagOnlyVoiceChannelIds",
    parseStringArray(row.voice_bouncer_tag_only_channel_ids),
  );
  assignIfNotNull(
    result,
    "tagOnlyCategoryIds",
    parseStringArray(row.voice_bouncer_tag_only_category_ids),
  );
  assignIfNotNull(
    result,
    "exemptRoleIds",
    parseStringArray(row.voice_bouncer_exempt_role_ids),
  );
  assignIfNotNull(
    result,
    "fallbackChannelId",
    row.voice_bouncer_fallback_channel_id,
  );
  assignIfNotNull(result, "action", row.voice_bouncer_action);
  assignIfNotNull(result, "warningMessage", row.voice_bouncer_warning_message);
  return nonEmptyOrUndefined(result);
}

function extractMatchmakingConfig(
  row: DirectusGuildConfigRaw,
): MatchmakingCapabilityConfig | undefined {
  const result: MatchmakingCapabilityConfig = {};
  assignIfNotNull(result, "enabled", row.matchmaking_enabled);
  assignIfNotNull(
    result,
    "lobbyVoiceChannelId",
    row.matchmaking_lobby_channel_id,
  );
  assignIfNotNull(
    result,
    "team1VoiceChannelId",
    row.matchmaking_team1_channel_id,
  );
  assignIfNotNull(
    result,
    "team2VoiceChannelId",
    row.matchmaking_team2_channel_id,
  );
  assignIfNotNull(result, "matchCategoryId", row.matchmaking_category_id);
  assignIfNotNull(
    result,
    "mapPool",
    parseStringArray(row.matchmaking_map_pool),
  );
  assignIfNotNull(result, "defaultKFactor", row.matchmaking_default_k_factor);
  assignIfNotNull(result, "initialElo", row.matchmaking_initial_elo);
  assignIfNotNull(
    result,
    "scoreReportingTimeoutMinutes",
    row.matchmaking_score_timeout_minutes,
  );
  assignIfNotNull(result, "autoMovePlayers", row.matchmaking_auto_move_players);
  return nonEmptyOrUndefined(result);
}

function extractValorantConfig(
  row: DirectusGuildConfigRaw,
): ValorantCapabilityConfig | undefined {
  const result: ValorantCapabilityConfig = {};
  assignIfNotNull(result, "enabled", row.valorant_enabled);
  assignDefined(result, "features", extractValorantFeaturesFromRaw(row));
  return nonEmptyOrUndefined(result);
}

function extractVoiceCompanionConfig(
  row: DirectusGuildConfigRaw,
): VoiceCompanionCapabilityConfig | undefined {
  const result: VoiceCompanionCapabilityConfig = {};
  assignIfNotNull(result, "enabled", row.voice_companion_enabled);
  assignIfNotNull(
    result,
    "autoJoinChannelId",
    row.voice_companion_auto_join_channel_id,
  );
  assignIfNotNull(
    result,
    "inactivityTimeoutMinutes",
    row.voice_companion_inactivity_timeout_minutes,
  );
  assignIfNotNull(
    result,
    "emptyChannelGraceSeconds",
    row.voice_companion_empty_channel_grace_seconds,
  );
  assignIfNotNull(result, "modelId", row.voice_companion_model_id);
  assignIfNotNull(result, "voiceName", row.voice_companion_voice_name);
  assignIfNotNull(
    result,
    "systemInstruction",
    row.voice_companion_system_instruction,
  );
  assignIfNotNull(
    result,
    "energyThreshold",
    row.voice_companion_energy_threshold,
  );
  assignIfNotNull(
    result,
    "bargeInSensitivity",
    row.voice_companion_barge_in_sensitivity,
  );
  assignIfNotNull(
    result,
    "participationMode",
    row.voice_companion_participation_mode,
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
    respondToMentions: row.respond_to_mentions ?? false,
  };

  assignIfNotNull(result, "botName", row.bot_name);
  assignIfNotNull(result, "lockName", row.lock_name);
  assignIfNotNull(result, "personalization", row.personalization);
  assignIfNotNull(result, "personalizationMode", row.personalization_mode);
  assignIfNotNull(result, "systemInstruction", row.system_instruction);
  assignIfNotNull(result, "replyDelay", row.reply_delay);
  assignIfNotNull(
    result,
    "localeOverride",
    normalizeLocale(row.locale_override),
  );
  assignIfNotNull(result, "chatBotModel", parseModelConfig(row.chat_bot_model));

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
  setSafeProperty(
    bots[botId].guilds,
    row.guild_id,
    mapDirectusRowToBotGuildConfig(row),
  );

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
