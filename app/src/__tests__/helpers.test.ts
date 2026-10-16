import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateEnvs } from ".././helpers";

describe("validateEnvs", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return true when all required environment variables are present", () => {
    process.env.DISCORD_TOKEN = "discord-token";
    process.env.DISCORD_CLIENT_ID = "discord-client-id";
    process.env.AI_API_KEY = "gemini-key";
    process.env.BEARER_TOKEN = "bearer-secret";

    expect(validateEnvs()).toBe(true);
  });

  it("should return false when DISCORD_TOKEN is missing", () => {
    delete process.env.DISCORD_TOKEN;
    process.env.DISCORD_CLIENT_ID = "client-id";
    process.env.AI_API_KEY = "gemini-key";
    process.env.BEARER_TOKEN = "bearer-secret";

    expect(validateEnvs()).toBe(false);
  });

  it("should return false when DISCORD_CLIENT_ID is missing", () => {
    process.env.DISCORD_TOKEN = "discord-token";
    process.env.AI_API_KEY = "gemini-key";
    process.env.BEARER_TOKEN = "bearer-secret";
    delete process.env.DISCORD_CLIENT_ID;

    expect(validateEnvs()).toBe(false);
  });

  it("should return false when GEMINI_API_KEY and AI_API_KEY are missing", () => {
    process.env.DISCORD_TOKEN = "discord-token";
    process.env.DISCORD_CLIENT_ID = "discord-client-id";
    delete process.env.GEMINI_API_KEY;
    delete process.env.AI_API_KEY;
    process.env.BEARER_TOKEN = "bearer-secret";

    expect(validateEnvs()).toBe(false);
  });

  it("should return true when GEMINI_API_KEY is present without AI_API_KEY", () => {
    process.env.DISCORD_TOKEN = "discord-token";
    process.env.DISCORD_CLIENT_ID = "discord-client-id";
    process.env.GEMINI_API_KEY = "gemini-key";
    delete process.env.AI_API_KEY;
    process.env.BEARER_TOKEN = "bearer-secret";

    expect(validateEnvs()).toBe(true);
  });

  it("should return false when BEARER_TOKEN is missing", () => {
    process.env.DISCORD_TOKEN = "discord-token";
    process.env.DISCORD_CLIENT_ID = "discord-client-id";
    process.env.AI_API_KEY = "gemini-key";
    delete process.env.BEARER_TOKEN;

    expect(validateEnvs()).toBe(false);
  });
});
