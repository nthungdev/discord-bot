import { Router } from "express";
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

/** Get Discord OAuth2 Bot Invite / Installation URL */
botsRouter.get("/invite-url", requireCapability("bot:read"), (_, res) => {
  const inviteUrl = getBotManager().getBotInviteUrl();
  res.json({ ok: true, inviteUrl });
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
    const { guildId } = req.params;
    try {
      await getBotManager().deployGuildCommands(guildId);
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
      const guilds = await getBotManager().getJoinedGuildDetails(id);
      const deployed: string[] = [];
      for (const guild of guilds) {
        try {
          await getBotManager().deployGuildCommands(guild.id);
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
