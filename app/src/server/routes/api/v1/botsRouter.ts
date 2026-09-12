import { Router } from "express";
import { deployGuildCommands } from "../../../../discord/deployCommands";
import { getBotManager } from "../../../../services/bot-manager";
import auth, {
  requireCapability,
  requireGuildPermission,
} from "../../../middlewares/auth";

const botsRouter = Router();

// Apply base authentication
botsRouter.use(auth);

/** List all registered bots and their real-time telemetry metrics */
botsRouter.get("/", requireCapability("bot:read"), async (_, res, next) => {
  try {
    const bots = await getBotManager().getAllBots();
    res.json({ ok: true, bots });
  } catch (error) {
    next(error);
  }
});

/** Register a new bot instance */
botsRouter.post("/", requireCapability("bot:write"), async (req, res, next) => {
  const { id, name, botType, clientId, token, autoStart, assignedGuildIds } =
    req.body;

  if (!(id && name && botType && clientId && token)) {
    res.status(400).json({
      ok: false,
      message:
        "Missing required fields: id, name, botType, clientId, and token are required.",
    });
    return;
  }

  try {
    const bot = await getBotManager().registerBot({
      id,
      name,
      botType,
      clientId,
      token,
      autoStart: autoStart ?? true,
      assignedGuildIds: assignedGuildIds ?? [],
    });
    res.status(201).json({ ok: true, bot });
  } catch (error) {
    next(error);
  }
});

/** Get single bot metrics and metadata */
botsRouter.get(
  "/:id",
  requireCapability("bot:read"),
  async (req, res, next) => {
    try {
      const bot = await getBotManager().getBot(req.params.id);
      if (!bot) {
        res.status(404).json({ ok: false, message: "Bot not found" });
        return;
      }
      res.json({ ok: true, bot });
    } catch (error) {
      next(error);
    }
  },
);

/** Update registered bot metadata */
botsRouter.patch(
  "/:id",
  requireCapability("bot:write"),
  async (req, res, next) => {
    try {
      const updated = await getBotManager().updateBot(req.params.id, req.body);
      res.json({ ok: true, bot: updated });
    } catch (error) {
      next(error);
    }
  },
);

/** Delete / unregister bot instance */
botsRouter.delete(
  "/:id",
  requireCapability("bot:write"),
  async (req, res, next) => {
    try {
      await getBotManager().unregisterBot(req.params.id);
      res.json({ ok: true, message: `Bot '${req.params.id}' unregistered` });
    } catch (error) {
      next(error);
    }
  },
);

/** Start bot instance */
botsRouter.post(
  "/:id/start",
  requireCapability("bot:lifecycle"),
  async (req, res, next) => {
    try {
      await getBotManager().startBot(req.params.id);
      res.json({ ok: true, message: `Bot '${req.params.id}' started` });
    } catch (error) {
      next(error);
    }
  },
);

/** Stop bot instance */
botsRouter.post(
  "/:id/stop",
  requireCapability("bot:lifecycle"),
  async (req, res, next) => {
    try {
      await getBotManager().stopBot(req.params.id);
      res.json({ ok: true, message: `Bot '${req.params.id}' stopped` });
    } catch (error) {
      next(error);
    }
  },
);

/** Restart bot instance */
botsRouter.post(
  "/:id/restart",
  requireCapability("bot:lifecycle"),
  async (req, res, next) => {
    try {
      await getBotManager().restartBot(req.params.id);
      res.json({ ok: true, message: `Bot '${req.params.id}' restarted` });
    } catch (error) {
      next(error);
    }
  },
);

/** List joined Discord guilds and channels */
botsRouter.get(
  "/:id/guilds",
  requireCapability("guild:read"),
  async (req, res, next) => {
    try {
      const guilds = await getBotManager().getJoinedGuildDetails(req.params.id);
      res.json({ ok: true, guilds });
    } catch (error) {
      next(error);
    }
  },
);

/** Deploy slash commands to a single guild */
botsRouter.post(
  "/:id/guilds/:guildId/deploy-commands",
  requireCapability("guild:deploy_commands"),
  requireGuildPermission("guildId"),
  async (req, res, next) => {
    const { id, guildId } = req.params;
    try {
      const bot = await getBotManager().getBot(id);
      if (!bot) {
        res.status(404).json({ ok: false, message: "Bot not found" });
        return;
      }

      const activeBot = getBotManager().getActiveBot(id);
      const token = activeBot
        ? activeBot.config.token
        : (process.env.CHATBOT_TOKEN as string);

      await deployGuildCommands(token, bot.clientId, guildId);
      res.json({
        ok: true,
        message: `Slash commands deployed to guild '${guildId}'`,
      });
    } catch (error) {
      next(error);
    }
  },
);

/** Deploy slash commands to all joined guilds */
botsRouter.post(
  "/:id/deploy-commands-all",
  requireCapability("guild:deploy_commands"),
  async (req, res, next) => {
    const { id } = req.params;
    try {
      const bot = await getBotManager().getBot(id);
      if (!bot) {
        res.status(404).json({ ok: false, message: "Bot not found" });
        return;
      }

      const guilds = await getBotManager().getJoinedGuildDetails(id);
      const activeBot = getBotManager().getActiveBot(id);
      const token = activeBot
        ? activeBot.config.token
        : (process.env.CHATBOT_TOKEN as string);

      const deployed: string[] = [];
      for (const guild of guilds) {
        try {
          await deployGuildCommands(token, bot.clientId, guild.id);
          deployed.push(guild.id);
        } catch (err) {
          console.error(`Failed to deploy commands to guild ${guild.id}:`, err);
        }
      }

      res.json({
        ok: true,
        message: `Deployed commands to ${deployed.length}/${guilds.length} guilds.`,
        deployedGuildIds: deployed,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default botsRouter;
