import crypto from "node:crypto";
import { type Request, type Response, Router } from "express";
import {
  guildConfigRepository,
  roastPresetRepository,
} from "../../../../infrastructure/repositories";

const webhookRouter = Router();

function getInternalWebhookSecret(): string {
  return process.env.INTERNAL_WEBHOOK_SECRET || "";
}

function isSecretValid(providedSecret: unknown): boolean {
  const expectedSecret = getInternalWebhookSecret();
  if (
    typeof providedSecret !== "string" ||
    !expectedSecret ||
    expectedSecret.length === 0
  ) {
    return false;
  }
  const providedBuffer = Buffer.from(providedSecret);
  const expectedBuffer = Buffer.from(expectedSecret);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function invalidateGuilds(keys: unknown, payload?: Record<string, unknown>) {
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

function invalidatePresets(keys: unknown, payload?: Record<string, unknown>) {
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

webhookRouter.post("/cache-invalidate", (req: Request, res: Response) => {
  const secret = req.headers["x-webhook-secret"];

  if (!isSecretValid(secret)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { collection, keys, event, payload, item } = req.body || {};
  const record = payload || item;

  console.log(
    `[WebhookReceiver] Received cache-invalidate event: ${event} on collection: ${collection}`,
  );

  if (collection === "bot_guild_configs") {
    invalidateGuilds(keys, record);
  } else if (collection === "bot_roast_presets") {
    invalidatePresets(keys, record);
  }

  res.status(204).send();
});

export default webhookRouter;
