import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import app from "../../../src/server";

vi.mock("../../../src/discord/deployCommands", () => ({
  deployGuildCommands: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/services/memory", () => ({
  memoryService: {
    clearHistory: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("Utility Router Integration", () => {
  const authHeader = `Bearer ${process.env.BEARER_TOKEN}`;

  describe("POST /utility/deploy-command", () => {
    it("should return 400 if required fields are missing", async () => {
      const response = await request(app)
        .post("/utility/deploy-command")
        .set("Authorization", authHeader)
        .send({ token: "test-token" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        ok: false,
        message: "missing required fields",
      });
    });

    it("should deploy commands successfully when all parameters are provided", async () => {
      const response = await request(app)
        .post("/utility/deploy-command")
        .set("Authorization", authHeader)
        .send({
          token: "test-token",
          clientId: "client-123",
          guildId: "guild-123",
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        ok: true,
        message: "commands deployed",
      });
    });
  });

  describe("POST /utility/clearHistory", () => {
    it("should clear history and return ok", async () => {
      const response = await request(app)
        .post("/utility/clearHistory")
        .set("Authorization", authHeader)
        .send({
          channelId: "channel-123",
          botId: "chatBot",
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
    });
  });
});
