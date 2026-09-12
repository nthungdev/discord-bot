import { Router } from "express";
import { Config, ConfigParameter } from "../../../../config";
import type { BotGuildConfig, BotsConfig } from "../../../../config/types";
import { getBotManager } from "../../../../services/bot-manager";
import auth, {
  requireCapability,
  requireGuildPermission,
} from "../../../middlewares/auth";

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
    try {
      const config = Config.getInstance();
      const botGuildConfig = config.getBotGuildConfig("chatBot", guildId);
      res.json({ ok: true, guildId, config: botGuildConfig });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Update per-server bot configuration and trigger immediate live reload.
 */
guildsRouter.put(
  "/:guildId/config",
  requireCapability("guild:manage_channels"),
  requireGuildPermission("guildId"),
  async (req, res, next) => {
    const { guildId } = req.params;
    const updates: Partial<BotGuildConfig> = req.body;

    try {
      const configService = Config.getInstance();
      const botsConfig: BotsConfig = configService.getConfigValue(
        ConfigParameter.bots,
      );

      const existingGuildConfig = botsConfig.chatBot?.guilds?.[guildId] ?? {
        replyChannelIds: [],
        ignoredChannelIds: [],
        respondToMentions: true,
      };

      const updatedGuildConfig: BotGuildConfig = {
        ...existingGuildConfig,
        ...updates,
      };

      if (!botsConfig.chatBot) {
        botsConfig.chatBot = { guilds: {} };
      }
      botsConfig.chatBot.guilds[guildId] = updatedGuildConfig;

      // Update in config service and trigger reload
      await configService.loadConfig();

      res.json({
        ok: true,
        message: `Configuration for guild '${guildId}' updated successfully.`,
        config: updatedGuildConfig,
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
