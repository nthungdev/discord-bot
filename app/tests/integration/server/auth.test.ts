import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../../src/server";

describe("Server Auth Integration", () => {
  it("should allow unauthenticated access to public root endpoint", async () => {
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.text).toBe("Hello world!");
  });

  it("should block protected endpoints when authorization header is missing", async () => {
    const response = await request(app).post("/utility/loadConfig").send({});

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      ok: false,
      message: "unauthorized",
    });
  });

  it("should block protected endpoints when invalid bearer token is provided", async () => {
    const response = await request(app)
      .post("/utility/loadConfig")
      .set("Authorization", "Bearer invalid-token")
      .send({});

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      ok: false,
      message: "unauthorized",
    });
  });

  it("should allow protected endpoints when valid bearer token is provided", async () => {
    const response = await request(app)
      .post("/utility/loadConfig")
      .set("Authorization", `Bearer ${process.env.BEARER_TOKEN}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
