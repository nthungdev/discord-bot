import { describe, it, expect, beforeEach } from "vitest";
import { validateEnvs } from "./helpers";

describe("validateEnvs", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it("should return true when all required environment variables are present", () => {
    process.env.CHATBOT_TOKEN = "token1";
    process.env.POLICE_BOT_TOKEN = "token2";
    process.env.AI_API_KEY = "key";
    process.env.CLIENT_ID = "client";
    process.env.BEARER_TOKEN = "bearer";

    expect(validateEnvs()).toBe(true);
  });

  it("should return false when any required environment variable is missing", () => {
    delete process.env.CHATBOT_TOKEN;
    delete process.env.AI_API_KEY;

    expect(validateEnvs()).toBe(false);
  });
});
