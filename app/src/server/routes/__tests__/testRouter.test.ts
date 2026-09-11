import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import testRouter from "../testRouter";

vi.mock("../../../utils/genAi", () => ({
  getGenAi: vi.fn().mockReturnValue({
    init: vi.fn().mockResolvedValue(undefined),
    generate: vi.fn().mockResolvedValue({
      content: "Hello from test route AI",
    }),
  }),
}));

describe("testRouter", () => {
  const app = express();
  app.use(express.json());
  app.use("/tests", testRouter);

  it("POST /tests/1 should return generated AI content", async () => {
    const response = await request(app).post("/tests/1").send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      content: "Hello from test route AI",
    });
  });
});
