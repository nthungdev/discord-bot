import { Router } from "express";
import { Config, ConfigParameter } from "../../../../config";
import auth, { requireCapability } from "../../../middlewares/auth";

const configRouter = Router();

configRouter.use(auth);

/** Retrieve active system and bot configuration */
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

  res.json({ ok: true, config: allConfig });
});

/** Force live reload of config from Remote Config / template */
configRouter.post(
  "/reload",
  requireCapability("config:reload"),
  async (_, res, next) => {
    try {
      await Config.getInstance().loadConfig();
      res.json({ ok: true, message: "Configuration reloaded successfully" });
    } catch (error) {
      next(error);
    }
  },
);

export default configRouter;
