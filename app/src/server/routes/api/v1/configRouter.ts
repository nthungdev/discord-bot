import { Router } from "express";
import { Config, ConfigParameter } from "../../../../config";
import auth, { requireCapability } from "../../../middlewares/auth";

function resolveDirectusUrl(): string | null {
  const rawUrl =
    process.env.DIRECTUS_PUBLIC_URL?.trim() ||
    process.env.DIRECTUS_URL?.trim() ||
    "";
  if (!rawUrl) {
    return null;
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.username || parsed.password) {
      return null;
    }
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? rawUrl
      : null;
  } catch {
    return null;
  }
}

const configRouter = Router();

configRouter.use(auth);

/** Retrieve active system and bot configuration along with control plane metadata */
configRouter.get("/", requireCapability("config:read"), (_, res) => {
  const config = Config.getInstance();
  const allConfig: Record<string, unknown> = {};

  for (const key of Object.values(ConfigParameter)) {
    try {
      allConfig[key] = config.getConfigValue(key);
    } catch {
      // Ignore unset parameters
    }
  }

  res.json({
    ok: true,
    config: allConfig,
    source: config.getConfigSource(),
    lastFetchedAt: config.getLastFetchedAt(),
    directusUrl: resolveDirectusUrl(),
  });
});

/** Force live reload of config from the active control plane */
configRouter.post(
  "/reload",
  requireCapability("config:reload"),
  async (_, res, next) => {
    try {
      const config = Config.getInstance();
      await config.loadConfig();
      res.json({
        ok: true,
        message: "Configuration reloaded successfully",
        source: config.getConfigSource(),
        lastFetchedAt: config.getLastFetchedAt(),
      });
    } catch (error) {
      next(error);
    }
  },
);

export default configRouter;
