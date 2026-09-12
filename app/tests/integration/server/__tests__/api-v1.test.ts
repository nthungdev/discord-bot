import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../../../../src/server";
import { signSessionToken } from "../../../../src/server/middlewares/auth";

describe("API v1 Endpoints Integration", () => {
  const superAdminSession = signSessionToken({
    user: { id: "admin-1", username: "SuperAdmin", discriminator: "0001" },
    role: "SUPER_ADMIN",
    guilds: [
      {
        id: "guild-1",
        name: "Dev Guild",
        owner: true,
        permissions: "8",
        canManage: true,
      },
    ],
  });

  const viewerSession = signSessionToken({
    user: { id: "viewer-1", username: "ViewerUser", discriminator: "0002" },
    role: "VIEWER",
    guilds: [],
  });

  describe("Authentication & Session (/api/v1/auth)", () => {
    it("should return current session user profile for valid session", async () => {
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${superAdminSession}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.session.role).toBe("SUPER_ADMIN");
      expect(res.body.session.user.username).toBe("SuperAdmin");
    });

    it("should allow logout and clear cookie", async () => {
      const res = await request(app)
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${superAdminSession}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe("Dashboard Stats (/api/v1/dashboard/stats)", () => {
    it("should return system dashboard metrics", async () => {
      const res = await request(app)
        .get("/api/v1/dashboard/stats")
        .set("Authorization", `Bearer ${viewerSession}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.stats).toHaveProperty("totalBots");
      expect(res.body.stats).toHaveProperty("process");
      expect(res.body.stats.process).toHaveProperty("heapUsedBytes");
    });
  });

  describe("Bot Registry & Lifecycle (/api/v1/bots)", () => {
    it("should list registered bots with masked tokens", async () => {
      const res = await request(app)
        .get("/api/v1/bots")
        .set("Authorization", `Bearer ${viewerSession}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.bots)).toBe(true);
    });

    it("should allow super admin to register and unregister a bot", async () => {
      const newBot = {
        id: "test-integration-bot",
        name: "Integration Test Bot",
        botType: "chatBot",
        clientId: "11223344",
        token: "token-123456789-abcdef",
        autoStart: false,
      };

      // Register
      const createRes = await request(app)
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${superAdminSession}`)
        .send(newBot);

      expect(createRes.status).toBe(201);
      expect(createRes.body.ok).toBe(true);
      expect(createRes.body.bot.id).toBe("test-integration-bot");

      // Get single bot
      const getRes = await request(app)
        .get("/api/v1/bots/test-integration-bot")
        .set("Authorization", `Bearer ${superAdminSession}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.bot.name).toBe("Integration Test Bot");
      expect(getRes.body.bot.tokenMasked).toBe("toke...********");

      // Update bot
      const patchRes = await request(app)
        .patch("/api/v1/bots/test-integration-bot")
        .set("Authorization", `Bearer ${superAdminSession}`)
        .send({ name: "Updated Test Bot" });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.bot.name).toBe("Updated Test Bot");

      // Delete / Unregister
      const delRes = await request(app)
        .delete("/api/v1/bots/test-integration-bot")
        .set("Authorization", `Bearer ${superAdminSession}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.ok).toBe(true);
    });

    it("should forbid viewers from registering bots", async () => {
      const res = await request(app)
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${viewerSession}`)
        .send({
          id: "unauthorized-bot",
          name: "No Auth",
          botType: "chatBot",
          clientId: "1",
          token: "secret",
        });

      expect(res.status).toBe(403);
      expect(res.body.ok).toBe(false);
    });
  });

  describe("Configuration (/api/v1/config)", () => {
    it("should retrieve active system config", async () => {
      const res = await request(app)
        .get("/api/v1/config")
        .set("Authorization", `Bearer ${viewerSession}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.config).toHaveProperty("bots");
    });

    it("should allow super admin to reload config", async () => {
      const res = await request(app)
        .post("/api/v1/config/reload")
        .set("Authorization", `Bearer ${superAdminSession}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe("Conversation Memory (/api/v1/memory)", () => {
    it("should retrieve conversation history for a channel", async () => {
      const res = await request(app)
        .get("/api/v1/memory/conversations/chatBot/channel-123")
        .set("Authorization", `Bearer ${superAdminSession}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.history)).toBe(true);
    });

    it("should clear conversation history for a channel", async () => {
      const res = await request(app)
        .delete("/api/v1/memory/conversations/chatBot/channel-123")
        .set("Authorization", `Bearer ${superAdminSession}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
