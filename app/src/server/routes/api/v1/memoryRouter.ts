import { Router } from "express";
import { getMemoryService } from "../../../../services/memory";
import { chatbotActions, policeBotActions, store } from "../../../../store";
import auth, {
  requireCapability,
  requireRole,
} from "../../../middlewares/auth";

const memoryRouter = Router();

memoryRouter.use(auth);

/** Retrieve stored conversation turn history for a channel */
memoryRouter.get(
  "/conversations/:botId/:channelId",
  requireCapability("memory:read"),
  async (req, res, next) => {
    const { botId, channelId } = req.params;
    try {
      const history = await getMemoryService().getHistory(botId, channelId);
      res.json({ ok: true, botId, channelId, history });
    } catch (error) {
      next(error);
    }
  },
);

/** Clear conversation memory for a specific channel */
memoryRouter.delete(
  "/conversations/:botId/:channelId",
  requireCapability("memory:clear"),
  async (req, res, next) => {
    const { botId, channelId } = req.params;
    try {
      await getMemoryService().clearHistory(botId, channelId);
      store.dispatch(chatbotActions.clearMessageHistory({ channelId }));
      store.dispatch(policeBotActions.clearMessageHistory({ channelId }));
      res.json({
        ok: true,
        message: `Conversation history cleared for ${botId}/${channelId}`,
      });
    } catch (error) {
      next(error);
    }
  },
);

/** Clear all conversation memory partitions across all channels */
memoryRouter.delete(
  "/conversations",
  requireRole(["SUPER_ADMIN"]),
  async (_, res, next) => {
    try {
      await getMemoryService().clearHistory();
      res.json({
        ok: true,
        message: "All conversation histories cleared across all bots",
      });
    } catch (error) {
      next(error);
    }
  },
);

export default memoryRouter;
