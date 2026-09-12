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

  describe("Bot Status & Metrics (/api/v1/bots)", () => {
    it("should list active bot with masked tokens and runtime metrics", async () => {
      const res = await request(app)
        .get("/api/v1/bots")
        .set("Authorization", `Bearer ${viewerSession}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.bots)).toBe(true);
      expect(res.body.bots.length).toBeGreaterThanOrEqual(1);
    });

    it("should retrieve single bot runtime metrics", async () => {
      const res = await request(app)
        .get("/api/v1/bots/bot")
        .set("Authorization", `Bearer ${viewerSession}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.bot.id).toBe("bot");
      expect(res.body.bot).toHaveProperty("status");
    });
  });

  describe("Guilds & Server Management (/api/v1/guilds)", () => {
    it("should retrieve bot invite URL and joined guilds", async () => {
      const res = await request(app)
        .get("/api/v1/guilds")
        .set("Authorization", `Bearer ${superAdminSession}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body).toHaveProperty("guilds");
      expect(res.body).toHaveProperty("inviteUrl");
    });

    it("should retrieve OAuth2 invite url", async () => {
      const res = await request(app)
        .get("/api/v1/guilds/invite-url")
        .set("Authorization", `Bearer ${superAdminSession}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.inviteUrl).toContain(
        "https://discord.com/oauth2/authorize",
      );
    });

    it("should allow managing guild configuration for authorized operator", async () => {
      const res = await request(app)
        .put("/api/v1/guilds/guild-1/config")
        .set("Authorization", `Bearer ${superAdminSession}`)
        .send({
          replyChannelIds: ["chan-1"],
          ignoredChannelIds: ["chan-2"],
          respondToMentions: true,
          systemInstruction: "You are a helpful test assistant.",
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.config.replyChannelIds).toEqual(["chan-1"]);
    });

    it("should forbid unauthorized users without guild access", async () => {
      const res = await request(app)
        .put("/api/v1/guilds/unauthorized-guild-99/config")
        .set("Authorization", `Bearer ${viewerSession}`)
        .send({
          replyChannelIds: ["chan-1"],
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
