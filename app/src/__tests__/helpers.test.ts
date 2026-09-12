import { beforeEach, describe, expect, it } from "vitest";
import { validateEnvs } from ".././helpers";

describe("validateEnvs", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
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

  it("should return false when AI_API_KEY is missing", () => {
    process.env.DISCORD_TOKEN = "discord-token";
    process.env.DISCORD_CLIENT_ID = "discord-client-id";
    delete process.env.AI_API_KEY;
    process.env.BEARER_TOKEN = "bearer-secret";

    expect(validateEnvs()).toBe(false);
  });

  it("should return false when BEARER_TOKEN is missing", () => {
    process.env.DISCORD_TOKEN = "discord-token";
    process.env.DISCORD_CLIENT_ID = "discord-client-id";
    process.env.AI_API_KEY = "gemini-key";
    delete process.env.BEARER_TOKEN;

    expect(validateEnvs()).toBe(false);
  });
});
