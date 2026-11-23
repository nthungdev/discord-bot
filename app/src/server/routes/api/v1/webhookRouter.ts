import crypto from "node:crypto";
import {
  type NextFunction,
  type Request,
  type Response,
  Router,
} from "express";
import { Config } from "../../../../config";
import {
  guildConfigRepository,
  roastPresetRepository,
} from "../../../../infrastructure/repositories";

const webhookRouter = Router();

function getInternalWebhookSecret(): string {
  return (process.env.INTERNAL_WEBHOOK_SECRET || "").trim();
}

function isSecretValid(providedSecret: unknown): boolean {
  const expectedSecret = getInternalWebhookSecret();
  if (typeof providedSecret !== "string" || expectedSecret.length === 0) {
    return false;
  }
  const providedDigest = crypto
    .createHash("sha256")
    .update(providedSecret)
    .digest();
  const expectedDigest = crypto
    .createHash("sha256")
    .update(expectedSecret)
    .digest();
  return crypto.timingSafeEqual(providedDigest, expectedDigest);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeLogField(value: unknown): string {
  if (typeof value !== "string") {
    return "unknown";
  }
  let sanitized = "";
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code >= 32 && code !== 127) {
      sanitized += ch;
    }
  }
  return sanitized;
}

function invalidateGuilds(
  keys: unknown,
  payload?: Record<string, unknown>,
): void {
  if (payload?.guild_id && typeof payload.guild_id === "string") {
    guildConfigRepository.invalidate(payload.guild_id);
    return;
  }
  if (Array.isArray(keys)) {
    for (const k of keys) {
      guildConfigRepository.invalidate(String(k));
    }
  } else if (typeof keys === "string") {
    guildConfigRepository.invalidate(keys);
  } else {
    guildConfigRepository.invalidate();
  }
}

function invalidatePresets(
  keys: unknown,
  payload?: Record<string, unknown>,
): void {
  if (payload?.preset_name && typeof payload.preset_name === "string") {
    roastPresetRepository.invalidate(payload.preset_name);
    return;
  }
  if (Array.isArray(keys)) {
    for (const k of keys) {
      roastPresetRepository.invalidate(String(k));
    }
  } else if (typeof keys === "string") {
    roastPresetRepository.invalidate(keys);
  } else {
    roastPresetRepository.invalidate();
  }
}

async function reloadRuntimeConfig(): Promise<void> {
  try {
    await Config.getInstance().loadConfig();
  } catch (error) {
    console.warn(
      "[WebhookReceiver] Failed to reload runtime config after webhook:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Handles Directus webhook cache invalidation and live runtime config reload events.
 */
webhookRouter.post(
  "/cache-invalidate",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const secret = req.headers["x-webhook-secret"];

      if (!isSecretValid(secret)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const body = isPlainRecord(req.body) ? req.body : {};
      const { collection, keys, event, payload, item } = body;
      const record = isPlainRecord(payload)
        ? payload
        : isPlainRecord(item)
          ? item
          : undefined;

      console.log(
        `[WebhookReceiver] Received cache-invalidate event: ${sanitizeLogField(event)} on collection: ${sanitizeLogField(collection)}`,
      );

      if (collection === "bot_guild_configs") {
        invalidateGuilds(keys, record);
        await reloadRuntimeConfig();
      } else if (collection === "bot_system_config") {
        await reloadRuntimeConfig();
      } else if (collection === "bot_roast_presets") {
        invalidatePresets(keys, record);
      }

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

export default webhookRouter;
