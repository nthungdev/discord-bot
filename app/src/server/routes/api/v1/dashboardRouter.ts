import { Router } from "express";
import { getMetricsService } from "../../../../services/metrics";
import auth, { requireCapability } from "../../../middlewares/auth";

const dashboardRouter = Router();

dashboardRouter.use(auth);

/** Retrieve high-level dashboard metrics and process telemetry */
dashboardRouter.get(
  "/stats",
  requireCapability("telemetry:read"),
  async (_, res, next) => {
    try {
      const stats = await getMetricsService().getDashboardStats();
      res.json({ ok: true, stats });
    } catch (error) {
      next(error);
    }
  },
);

/** Server-Sent Events (SSE) live telemetry and activity stream */
dashboardRouter.get(
  "/events",
  requireCapability("telemetry:read"),
  async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const metricsService = getMetricsService();

    // 1. Send initial state
    const initialStats = await metricsService.getDashboardStats();
    res.write(
      `event: initial_state\ndata: ${JSON.stringify(initialStats)}\n\n`,
    );

    // 2. Subscribe to real-time activity events
    const unsubscribe = metricsService.onActivity((event) => {
      res.write(`event: activity_log\ndata: ${JSON.stringify(event)}\n\n`);
    });

    // 3. Periodic telemetry ticks every 5 seconds
    const interval = setInterval(async () => {
      try {
        const stats = await metricsService.getDashboardStats();
        res.write(`event: telemetry_tick\ndata: ${JSON.stringify(stats)}\n\n`);
      } catch (err) {
        console.error("[SSE] Error collecting periodic metrics:", err);
      }
    }, 5000);

    req.on("close", () => {
      clearInterval(interval);
      unsubscribe();
    });
  },
);

export default dashboardRouter;
