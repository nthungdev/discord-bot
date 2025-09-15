import { Router } from "express";
import { deployGuildCommands } from "../../discord/deployCommands";
import { chatbotActions, policeBotActions, store } from "../../store";
import { Config, ConfigParameter } from "../../config";

const utilityRouter = Router();

utilityRouter.post("/deploy-command", async (req, res, next) => {
  const { token, clientId, guildId } = req.body;

  if (token === undefined || clientId === undefined || guildId === undefined) {
    res.status(400); // bad request
    res.send({ ok: false, message: "missing required fields" });
    return;
  }

  try {
    await deployGuildCommands(token, clientId, guildId);
    res.json({ ok: true, message: "commands deployed" });
  } catch (error: unknown) {
    next(error);
  }
});

/// Clear the chat bot history
utilityRouter.post("/clearHistory", async (req, res, next) => {
  const { channelId } = req.body;

  try {
    store.dispatch(chatbotActions.clearMessageHistory({ channelId }));
    store.dispatch(policeBotActions.clearMessageHistory({ channelId }));
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

utilityRouter.post("/loadConfig", async (req, res, next) => {
  const params: string[] = req.body.params || [];

  try {
    await Config.getInstance().loadConfig();
    if (params.length) {
      const config = Config.getInstance();
      const value: Record<string, unknown> = {};
      for (const param of params) {
        const configValue = config.getConfigValue(param as ConfigParameter);
        value[param] = configValue;
      }
      console.log(value);
      res.json({ ok: true, value });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default utilityRouter;
