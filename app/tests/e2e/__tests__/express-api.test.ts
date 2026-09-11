import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../src/server";

describe("E2E: Express REST API", () => {
  it("should handle public root request successfully", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toBe("Hello world!");
  });

  it("should enforce authentication end-to-end for protected resources", async () => {
    // Unauthenticated attempt
    const unauthRes = await request(app).post("/utility/loadConfig").send({});
    expect(unauthRes.status).toBe(401);
    expect(unauthRes.body.ok).toBe(false);

    // Authenticated attempt
    const authRes = await request(app)
      .post("/utility/loadConfig")
      .set("Authorization", `Bearer ${process.env.BEARER_TOKEN}`)
      .send({});
    expect(authRes.status).toBe(200);
    expect(authRes.body.ok).toBe(true);
  });
});
