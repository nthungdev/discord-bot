import { type Request, type Response, Router } from "express";
import {
  guildConfigRepository,
  roastPresetRepository,
} from "../../../../infrastructure/repositories";

const webhookRouter = Router();

const INTERNAL_WEBHOOK_SECRET =
  process.env.INTERNAL_WEBHOOK_SECRET ||
  "directus-webhook-dev-secret-key-12345";

function invalidateGuilds(keys: unknown) {
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

function invalidatePresets(keys: unknown) {
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

  if (secret !== INTERNAL_WEBHOOK_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { collection, keys, event } = req.body || {};

  console.log(
    `[WebhookReceiver] Received cache-invalidate event: ${event} on collection: ${collection}`,
  );

  if (collection === "bot_guild_configs") {
    invalidateGuilds(keys);
  } else if (collection === "bot_roast_presets") {
    invalidatePresets(keys);
  }

  res.status(204).send();
});

export default webhookRouter;
