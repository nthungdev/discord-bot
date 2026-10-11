import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  guildConfigRepository,
  roastPresetRepository,
} from "../../../../../infrastructure/repositories";
import webhookRouter from "../webhookRouter";

describe("Webhook Router (/cache-invalidate)", () => {
  const app = express();
  app.use(express.json());
  app.use("/webhooks", webhookRouter);

  it("should reject requests with invalid webhook secret with 401", async () => {
    const res = await request(app)
      .post("/webhooks/cache-invalidate")
      .set("x-webhook-secret", "wrong-secret")
      .send({ collection: "bot_guild_configs" });

    expect(res.status).toBe(401);
  });

  it("should accept valid webhook and call guildConfigRepository.invalidate", async () => {
    const invalidateSpy = vi.spyOn(guildConfigRepository, "invalidate");

    const res = await request(app)
      .post("/webhooks/cache-invalidate")
      .set("x-webhook-secret", "directus-webhook-dev-secret-key-12345")
      .send({
        collection: "bot_guild_configs",
        keys: ["guild-999"],
        event: "update",
      });

    expect(res.status).toBe(204);
    expect(invalidateSpy).toHaveBeenCalledWith("guild-999");
  });

  it("should accept valid webhook and call roastPresetRepository.invalidate", async () => {
    const invalidateSpy = vi.spyOn(roastPresetRepository, "invalidate");

    const res = await request(app)
      .post("/webhooks/cache-invalidate")
      .set("x-webhook-secret", "directus-webhook-dev-secret-key-12345")
      .send({
        collection: "bot_roast_presets",
        keys: ["savage"],
        event: "update",
      });

    expect(res.status).toBe(204);
    expect(invalidateSpy).toHaveBeenCalledWith("savage");
  });

  it("should prioritize payload domain key when provided", async () => {
    const invalidateSpy = vi.spyOn(guildConfigRepository, "invalidate");

    const res = await request(app)
      .post("/webhooks/cache-invalidate")
      .set("x-webhook-secret", "directus-webhook-dev-secret-key-12345")
      .send({
        collection: "bot_guild_configs",
        keys: ["uuid-12345"],
        payload: { guild_id: "guild-from-payload" },
        event: "update",
      });

    expect(res.status).toBe(204);
    expect(invalidateSpy).toHaveBeenCalledWith("guild-from-payload");
  });
});
