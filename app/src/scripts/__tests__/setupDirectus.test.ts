import { describe, expect, it } from "vitest";
import { resolveDirectusSetupConfig } from "../setupDirectus";

describe("resolveDirectusSetupConfig", () => {
  it("should parse default configuration when only required token is provided", () => {
    const config = resolveDirectusSetupConfig({
      DIRECTUS_BOT_TOKEN: "static-bot-token-123",
    });

    expect(config).toEqual({
      directusUrl: "http://localhost:8055",
      adminEmail: "admin@local.dev",
      adminPassword: "adminpassword",
      botStaticToken: "static-bot-token-123",
      internalWebhookSecret: "",
      webhookReceiverUrl:
        "http://host.docker.internal:3001/api/v1/webhooks/cache-invalidate",
    });
  });

  it("should construct directusUrl from DIRECTUS_PORT when DIRECTUS_URL is not provided", () => {
    const config = resolveDirectusSetupConfig({
      DIRECTUS_PORT: "8056",
      DIRECTUS_BOT_TOKEN: "token-456",
    });

    expect(config.directusUrl).toBe("http://localhost:8056");
  });

  it("should respect custom environment overrides", () => {
    const config = resolveDirectusSetupConfig({
      DIRECTUS_URL: "https://directus.internal:8055",
      DIRECTUS_ADMIN_EMAIL: "ops@company.dev",
      DIRECTUS_ADMIN_PASSWORD: "secure-admin-pass",
      DIRECTUS_BOT_TOKEN: "custom-static-token",
      INTERNAL_WEBHOOK_SECRET: "wh-secret-xyz",
      WEBHOOK_RECEIVER_URL:
        "https://bot.internal:3001/api/v1/webhooks/cache-invalidate",
    });

    expect(config).toEqual({
      directusUrl: "https://directus.internal:8055",
      adminEmail: "ops@company.dev",
      adminPassword: "secure-admin-pass",
      botStaticToken: "custom-static-token",
      internalWebhookSecret: "wh-secret-xyz",
      webhookReceiverUrl:
        "https://bot.internal:3001/api/v1/webhooks/cache-invalidate",
    });
  });

  it("should support legacy ADMIN_EMAIL and ADMIN_PASSWORD variables", () => {
    const config = resolveDirectusSetupConfig({
      ADMIN_EMAIL: "legacy-admin@local.dev",
      ADMIN_PASSWORD: "legacy-password",
      DIRECTUS_BOT_TOKEN: "token-abc",
    });

    expect(config.adminEmail).toBe("legacy-admin@local.dev");
    expect(config.adminPassword).toBe("legacy-password");
  });

  it("should throw a clear error when DIRECTUS_BOT_TOKEN is missing", () => {
    expect(() => resolveDirectusSetupConfig({})).toThrowError(
      "Missing required environment variable: DIRECTUS_BOT_TOKEN",
    );
  });

  it("should throw an error when DIRECTUS_BOT_TOKEN is blank", () => {
    expect(() =>
      resolveDirectusSetupConfig({ DIRECTUS_BOT_TOKEN: "   " }),
    ).toThrowError("Missing required environment variable: DIRECTUS_BOT_TOKEN");
  });
});
