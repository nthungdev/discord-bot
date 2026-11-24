import { Router } from "express";
import { Config, ConfigParameter } from "../../../../config";
import type { BotGuildConfig } from "../../../../config/types";
import { isSafeRecordKey } from "../../../../infrastructure/directus/config-mapper";
import { guildConfigRepository } from "../../../../infrastructure/repositories";
import { getBotManager } from "../../../../services/bot-manager";
import {
  type GuildCustomEmojiInfo,
  suggestEmojiMappings,
} from "../../../../services/emoji-mapper";
import auth, {
  requireCapability,
  requireGuildPermission,
} from "../../../middlewares/auth";

const DEFAULT_BOT_ID = "chatBot";
const BOT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_EMOJI_KEY_LENGTH = 32;
const MAX_CUSTOM_EMOJI_NAME_LENGTH = 100;
const EMOJI_WRITE_SCOPE_KEY = "guildEmojis";

type AiSuggestScope = "unmapped" | "selected" | "all";

const VALID_AI_SUGGEST_SCOPES = new Set<AiSuggestScope>([
  "unmapped",
  "selected",
  "all",
]);

const DEEP_MERGE_SUBCONFIG_KEYS = new Set<string>([
  "tools",
  "smartReply",
  "roast",
  "moderation",
  "voiceBouncer",
  "matchmaking",
  "valorant",
  "voiceCompanion",
]);

const pendingGuildWrites = new Map<string, Promise<unknown>>();

type FieldValidator = (value: unknown) => string | null;

function createDefaultBotGuildConfig(): BotGuildConfig {
  return {
    replyChannelIds: [],
    ignoredChannelIds: [],
    respondToMentions: true,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isValidBotId(value: unknown): value is string {
  return isSafeRecordKey(value) && BOT_ID_PATTERN.test(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isPlainObject(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}

function validateString(value: unknown): string | null {
  return typeof value === "string" ? null : "must be a string.";
}

function validateBoolean(value: unknown): string | null {
  return typeof value === "boolean" ? null : "must be a boolean.";
}

function validateFiniteNumber(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value)
    ? null
    : "must be a finite number.";
}

function validateStringArray(value: unknown): string | null {
  return isStringArray(value) ? null : "must be an array of strings.";
}

function validatePlainObject(value: unknown): string | null {
  return isPlainObject(value) ? null : "must be a plain object.";
}

function validateOptionalStringArrays(
  obj: Record<string, unknown>,
  fields: readonly string[],
  prefix: string,
): string | null {
  for (const field of fields) {
    const entry = obj[field];
    if (entry !== undefined && !isStringArray(entry)) {
      return `${prefix}.${field} must be an array of strings.`;
    }
  }
  return null;
}

function validateRoastConfig(value: unknown): string | null {
  if (!isPlainObject(value)) {
    return "must be a plain object.";
  }
  return validateOptionalStringArrays(
    value,
    ["allowedChannelIds", "ignoredChannelIds"],
    "roast",
  );
}

function validateVoiceBouncerConfig(value: unknown): string | null {
  if (!isPlainObject(value)) {
    return "must be a plain object.";
  }
  return validateOptionalStringArrays(
    value,
    ["tagOnlyVoiceChannelIds", "tagOnlyCategoryIds", "exemptRoleIds"],
    "voiceBouncer",
  );
}

function validateMatchmakingConfig(value: unknown): string | null {
  if (!isPlainObject(value)) {
    return "must be a plain object.";
  }
  return validateOptionalStringArrays(value, ["mapPool"], "matchmaking");
}

function validateValorantConfig(value: unknown): string | null {
  if (!isPlainObject(value)) {
    return "must be a plain object.";
  }
  if (value.features === undefined) {
    return null;
  }
  if (!isPlainObject(value.features)) {
    return "valorant.features must be a plain object.";
  }
  const { rankRoleSync } = value.features;
  if (rankRoleSync === undefined) {
    return null;
  }
  if (!isPlainObject(rankRoleSync)) {
    return "valorant.features.rankRoleSync must be a plain object.";
  }
  if (
    rankRoleSync.roleMappings !== undefined &&
    !isStringRecord(rankRoleSync.roleMappings)
  ) {
    return "valorant.features.rankRoleSync.roleMappings must be a plain object of strings.";
  }
  return null;
}

const GUILD_CONFIG_VALIDATORS = new Map<string, FieldValidator>([
  ["botName", validateString],
  ["lockName", validateBoolean],
  ["personalization", validateString],
  ["personalizationMode", validateString],
  ["chatBotModel", validatePlainObject],
  ["replyChannelIds", validateStringArray],
  ["ignoredChannelIds", validateStringArray],
  ["respondToMentions", validateBoolean],
  ["systemInstruction", validateString],
  ["replyDelay", validateFiniteNumber],
  ["localeOverride", validateString],
  ["tools", validatePlainObject],
  ["smartReply", validatePlainObject],
  ["roast", validateRoastConfig],
  ["moderation", validatePlainObject],
  ["voiceBouncer", validateVoiceBouncerConfig],
  ["matchmaking", validateMatchmakingConfig],
  ["valorant", validateValorantConfig],
  ["voiceCompanion", validatePlainObject],
]);

function validateGuildConfigBody(body: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(body)) {
    if (key === "botId") {
      continue;
    }
    const validator = GUILD_CONFIG_VALIDATORS.get(key);
    if (!validator) {
      return `Unknown guild configuration field: ${key}`;
    }
    const error = validator(value);
    if (error) {
      return `Invalid field '${key}': ${error}`;
    }
  }
  return null;
}

function sanitizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeJsonValue);
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const sanitized: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (!isSafeRecordKey(key)) {
      continue;
    }
    Object.defineProperty(sanitized, key, {
      value: sanitizeJsonValue(entryValue),
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return sanitized;
}

function sanitizeGuildConfigUpdates(
  body: Record<string, unknown>,
): Partial<BotGuildConfig> {
  const sanitized = sanitizeJsonValue(body) as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sanitized)) {
    if (key === "botId") {
      continue;
    }
    Object.defineProperty(updates, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return updates as Partial<BotGuildConfig>;
}

function deepMergePlainObjects(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, patchVal] of Object.entries(patch)) {
    if (!isSafeRecordKey(key) || patchVal === undefined) {
      continue;
    }
    const baseVal = Object.hasOwn(merged, key) ? merged[key] : undefined;
    const nextVal =
      isPlainObject(baseVal) && isPlainObject(patchVal)
        ? deepMergePlainObjects(baseVal, patchVal)
        : patchVal;
    Object.defineProperty(merged, key, {
      value: nextVal,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return merged;
}

function mergeGuildConfig(
  existing: BotGuildConfig,
  updates: Partial<BotGuildConfig>,
): BotGuildConfig {
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(updates)) {
    if (!isSafeRecordKey(key) || value === undefined) {
      continue;
    }
    const baseVal = Object.hasOwn(merged, key) ? merged[key] : undefined;
    const nextVal =
      DEEP_MERGE_SUBCONFIG_KEYS.has(key) &&
      isPlainObject(baseVal) &&
      isPlainObject(value)
        ? deepMergePlainObjects(baseVal, value)
        : value;
    Object.defineProperty(merged, key, {
      value: nextVal,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return merged as unknown as BotGuildConfig;
}

async function serializeGuildWrite<T>(
  botId: string,
  guildId: string,
  task: () => Promise<T>,
): Promise<T> {
  const writeKey = JSON.stringify([botId, guildId]);
  const previous = pendingGuildWrites.get(writeKey) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  pendingGuildWrites.set(writeKey, next);
  try {
    return await next;
  } finally {
    if (pendingGuildWrites.get(writeKey) === next) {
      pendingGuildWrites.delete(writeKey);
    }
  }
}

function getGuildEmojiMapping(guildId: string): Record<string, string[]> {
  const allGuildEmojis = Config.getInstance().getConfigValue(
    ConfigParameter.guildEmojis,
  );
  if (allGuildEmojis && Object.hasOwn(allGuildEmojis, guildId)) {
    return allGuildEmojis[guildId];
  }
  return {};
}

function findOrphanedEmojiNames(
  mapping: Record<string, string[]>,
  liveEmojis: readonly GuildCustomEmojiInfo[],
): string[] {
  const liveNames = new Set(liveEmojis.map((emoji) => emoji.name));
  const orphaned = new Set<string>();
  for (const customNames of Object.values(mapping)) {
    for (const customName of customNames) {
      if (!liveNames.has(customName)) {
        orphaned.add(customName);
      }
    }
  }
  return Array.from(orphaned);
}

function validateAndSanitizeEmojiNames(
  rawNames: unknown,
  emojiKey: string,
): { names?: string[]; error?: string } {
  if (!Array.isArray(rawNames)) {
    return {
      error: `Mapping value for '${emojiKey}' must be an array of non-empty strings.`,
    };
  }
  const deduplicated = new Set<string>();
  for (const item of rawNames) {
    if (typeof item !== "string") {
      return {
        error: `Mapping value for '${emojiKey}' must contain only strings.`,
      };
    }
    const trimmed = item.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_CUSTOM_EMOJI_NAME_LENGTH) {
      return {
        error: `Custom emoji names for '${emojiKey}' must be non-empty strings of at most ${MAX_CUSTOM_EMOJI_NAME_LENGTH} characters.`,
      };
    }
    deduplicated.add(trimmed);
  }
  return { names: Array.from(deduplicated) };
}

function validateAndSanitizeEmojiMapping(rawMapping: unknown): {
  mapping?: Record<string, string[]>;
  error?: string;
} {
  if (!isPlainObject(rawMapping)) {
    return { error: "Field 'mapping' must be a plain JSON object." };
  }

  const sanitized: Record<string, string[]> = {};
  for (const [rawKey, rawValue] of Object.entries(rawMapping)) {
    if (!isSafeRecordKey(rawKey)) {
      continue;
    }
    const trimmedKey = rawKey.trim();
    if (
      trimmedKey.length === 0 ||
      trimmedKey.length > MAX_EMOJI_KEY_LENGTH ||
      !isSafeRecordKey(trimmedKey)
    ) {
      return {
        error: `Emoji mapping keys must be safe non-empty strings of at most ${MAX_EMOJI_KEY_LENGTH} characters.`,
      };
    }

    const { names, error } = validateAndSanitizeEmojiNames(
      rawValue,
      trimmedKey,
    );
    if (error) {
      return { error };
    }
    if (!names || names.length === 0) {
      continue;
    }

    Object.defineProperty(sanitized, trimmedKey, {
      value: names,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  return { mapping: sanitized };
}

function isValidAiSuggestScope(value: unknown): value is AiSuggestScope {
  return (
    typeof value === "string" &&
    VALID_AI_SUGGEST_SCOPES.has(value as AiSuggestScope)
  );
}

function filterTargetEmojisForSuggestion(
  liveEmojis: readonly GuildCustomEmojiInfo[],
  existingMapping: Record<string, string[]>,
  scope: AiSuggestScope,
  customEmojiNames?: readonly string[],
): GuildCustomEmojiInfo[] {
  if (scope === "all") {
    return [...liveEmojis];
  }
  if (scope === "selected") {
    const selectedSet = new Set(customEmojiNames ?? []);
    return liveEmojis.filter((emoji) => selectedSet.has(emoji.name));
  }
  const mappedNames = new Set<string>();
  for (const names of Object.values(existingMapping)) {
    for (const name of names) {
      mappedNames.add(name);
    }
  }
  return liveEmojis.filter((emoji) => !mappedNames.has(emoji.name));
}

const guildsRouter = Router();

guildsRouter.use(auth);

/**
 * List all joined Discord guilds and match with operator's manageable guilds.
 */
guildsRouter.get(
  "/",
  requireCapability("guild:read"),
  async (_req, res, next) => {
    try {
      const joinedGuilds = await getBotManager().getJoinedGuildDetails();
      const inviteUrl = getBotManager().getBotInviteUrl();

      res.json({
        ok: true,
        guilds: joinedGuilds,
        inviteUrl,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Get OAuth2 bot installation/invite URL.
 */
guildsRouter.get(
  "/invite-url",
  requireCapability("guild:read"),
  (_req, res) => {
    const inviteUrl = getBotManager().getBotInviteUrl();
    res.json({ ok: true, inviteUrl });
  },
);

/**
 * Get per-server bot configuration.
 */
guildsRouter.get(
  "/:guildId/config",
  requireCapability("guild:read"),
  requireGuildPermission("guildId"),
  (req, res, next) => {
    const { guildId } = req.params;
    const rawBotId =
      req.query.botId !== undefined ? req.query.botId : DEFAULT_BOT_ID;

    if (!isSafeRecordKey(guildId)) {
      res.status(400).json({ ok: false, message: "Invalid guildId." });
      return;
    }
    if (!isValidBotId(rawBotId)) {
      res.status(400).json({ ok: false, message: "Invalid botId." });
      return;
    }

    try {
      const config = Config.getInstance();
      const botGuildConfig = config.getBotGuildConfig(rawBotId, guildId);
      res.json({ ok: true, botId: rawBotId, guildId, config: botGuildConfig });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Update per-server bot configuration, persisting to Directus when active and triggering immediate live reload.
 */
guildsRouter.put(
  "/:guildId/config",
  requireCapability("guild:manage_channels"),
  requireGuildPermission("guildId"),
  async (req, res, next) => {
    const { guildId } = req.params;

    if (!isSafeRecordKey(guildId)) {
      res.status(400).json({ ok: false, message: "Invalid guildId." });
      return;
    }
    if (!isPlainObject(req.body)) {
      res.status(400).json({
        ok: false,
        message: "Request body must be a JSON object.",
      });
      return;
    }

    const hasQueryBotId = req.query.botId !== undefined;
    const hasBodyBotId = req.body.botId !== undefined;
    if (hasQueryBotId && !isValidBotId(req.query.botId)) {
      res.status(400).json({ ok: false, message: "Invalid botId." });
      return;
    }
    if (hasBodyBotId && !isValidBotId(req.body.botId)) {
      res.status(400).json({ ok: false, message: "Invalid botId." });
      return;
    }
    if (hasQueryBotId && hasBodyBotId && req.query.botId !== req.body.botId) {
      res.status(400).json({
        ok: false,
        message: "Conflicting botId in query and body.",
      });
      return;
    }

    const botId: string = hasQueryBotId
      ? (req.query.botId as string)
      : hasBodyBotId
        ? (req.body.botId as string)
        : DEFAULT_BOT_ID;

    const updates = sanitizeGuildConfigUpdates(req.body);
    const validationError = validateGuildConfigBody(updates);
    if (validationError) {
      res.status(400).json({ ok: false, message: validationError });
      return;
    }

    try {
      const result = await serializeGuildWrite(botId, guildId, async () => {
        const configService = Config.getInstance();
        const existingGuildConfig =
          configService.getBotGuildConfig(botId, guildId) ??
          createDefaultBotGuildConfig();

        const updatedGuildConfig = mergeGuildConfig(
          existingGuildConfig,
          updates,
        );

        const configSource = configService.getConfigSource();
        if (configSource === "directus") {
          await guildConfigRepository.upsertBotGuildConfig(
            botId,
            guildId,
            updatedGuildConfig,
          );
        }

        // Update in config service and preserve across template/snapshot evaluations
        configService.updateBotGuildConfig(guildId, updatedGuildConfig, botId);

        return { configSource, updatedGuildConfig };
      });

      const message =
        result.configSource === "directus"
          ? `Configuration for guild '${guildId}' (bot '${botId}') persisted to Directus and live-reloaded.`
          : `Configuration for guild '${guildId}' (bot '${botId}') updated in memory (${result.configSource} mode).`;

      res.json({
        ok: true,
        botId,
        guildId,
        persistedTo: result.configSource,
        message,
        config: result.updatedGuildConfig,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Get live Discord custom emojis, current emoji mapping, and orphaned mapped emoji names for a guild.
 */
guildsRouter.get(
  "/:guildId/emojis",
  requireCapability("guild:read"),
  requireGuildPermission("guildId"),
  async (req, res, next) => {
    const { guildId } = req.params;
    if (!isSafeRecordKey(guildId)) {
      res.status(400).json({ ok: false, message: "Invalid guildId." });
      return;
    }

    try {
      const emojis = await getBotManager().getGuildEmojis(guildId);
      const mapping = getGuildEmojiMapping(guildId);
      const orphanedEmojis = findOrphanedEmojiNames(mapping, emojis);

      res.json({
        ok: true,
        guildId,
        emojis,
        mapping,
        orphanedEmojis,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Update custom emoji mappings for a guild, persisting to Directus when active and triggering immediate live reload.
 */
guildsRouter.put(
  "/:guildId/emojis",
  requireCapability("guild:manage_channels"),
  requireGuildPermission("guildId"),
  async (req, res, next) => {
    const { guildId } = req.params;
    if (!isSafeRecordKey(guildId)) {
      res.status(400).json({ ok: false, message: "Invalid guildId." });
      return;
    }
    if (!isPlainObject(req.body)) {
      res.status(400).json({
        ok: false,
        message: "Request body must be a JSON object.",
      });
      return;
    }

    const { mapping: sanitizedMapping, error: validationError } =
      validateAndSanitizeEmojiMapping(req.body.mapping);
    if (validationError || !sanitizedMapping) {
      res.status(400).json({
        ok: false,
        message: validationError ?? "Invalid emoji mapping payload.",
      });
      return;
    }

    try {
      const result = await serializeGuildWrite(
        EMOJI_WRITE_SCOPE_KEY,
        guildId,
        async () => {
          const configService = Config.getInstance();
          const configSource = configService.getConfigSource();
          if (configSource === "directus") {
            await guildConfigRepository.upsertGuildEmojis(
              guildId,
              sanitizedMapping,
            );
          }

          configService.updateGuildEmojis(guildId, sanitizedMapping);
          return { configSource };
        },
      );

      const message =
        result.configSource === "directus"
          ? `Emoji mapping for guild '${guildId}' persisted to Directus and live-reloaded.`
          : `Emoji mapping for guild '${guildId}' updated in memory (${result.configSource} mode).`;

      res.json({
        ok: true,
        guildId,
        persistedTo: result.configSource,
        mapping: sanitizedMapping,
        message,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Generate AI-powered standard-to-custom emoji mapping suggestions for a guild.
 */
guildsRouter.post(
  "/:guildId/emojis/ai-suggest",
  requireCapability("guild:manage_channels"),
  requireGuildPermission("guildId"),
  async (req, res, next) => {
    const { guildId } = req.params;
    if (!isSafeRecordKey(guildId)) {
      res.status(400).json({ ok: false, message: "Invalid guildId." });
      return;
    }

    const body = req.body ?? {};
    if (!isPlainObject(body)) {
      res.status(400).json({
        ok: false,
        message: "Request body must be a JSON object.",
      });
      return;
    }

    const rawScope = body.scope ?? "unmapped";
    if (!isValidAiSuggestScope(rawScope)) {
      res.status(400).json({
        ok: false,
        message: "Invalid scope. Must be one of: unmapped, selected, all.",
      });
      return;
    }

    let selectedEmojiNames: string[] | undefined;
    if (rawScope === "selected") {
      const rawNames = body.customEmojiNames;
      if (
        !Array.isArray(rawNames) ||
        rawNames.length === 0 ||
        !rawNames.every(
          (name) => typeof name === "string" && name.trim().length > 0,
        )
      ) {
        res.status(400).json({
          ok: false,
          message:
            "Field 'customEmojiNames' must be a non-empty array of strings when scope is 'selected'.",
        });
        return;
      }
      selectedEmojiNames = rawNames.map((name) => name.trim());
    }

    try {
      const liveEmojis = await getBotManager().getGuildEmojis(guildId);
      const existingMapping = getGuildEmojiMapping(guildId);
      const targets = filterTargetEmojisForSuggestion(
        liveEmojis,
        existingMapping,
        rawScope,
        selectedEmojiNames,
      );

      if (targets.length === 0) {
        res.json({
          ok: true,
          guildId,
          suggestions: [],
          analyzedCount: 0,
        });
        return;
      }

      const suggestions = await suggestEmojiMappings({
        emojis: targets,
        existingMapping,
      });

      res.json({
        ok: true,
        guildId,
        suggestions,
        analyzedCount: targets.length,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Deploy slash commands to a specific guild.
 */
guildsRouter.post(
  "/:guildId/deploy-commands",
  requireCapability("guild:deploy_commands"),
  requireGuildPermission("guildId"),
  async (req, res, next) => {
    const { guildId } = req.params;
    try {
      await getBotManager().deployGuildCommands(guildId);
      res.json({
        ok: true,
        message: `Slash commands deployed successfully to guild '${guildId}'.`,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default guildsRouter;
