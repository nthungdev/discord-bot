import type { AxiosInstance } from "axios";
import { describe, expect, it, vi } from "vitest";
import {
  CACHE_INVALIDATION_FLOW_NAME,
  CACHE_INVALIDATION_OPERATION_KEY,
  ensureWebhook,
  resolveDirectusSetupConfig,
} from "../setupDirectus";

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

describe("ensureWebhook", () => {
  const dummyConfig = {
    directusUrl: "http://localhost:8055",
    adminEmail: "admin@local.dev",
    adminPassword: "adminpassword",
    botStaticToken: "token-123",
    internalWebhookSecret: "test-secret-456",
    webhookReceiverUrl:
      "http://host.docker.internal:3001/api/v1/webhooks/cache-invalidate",
  };

  it("should skip provisioning if internalWebhookSecret is not configured", async () => {
    const mockClient = {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
    } as unknown as AxiosInstance;

    await ensureWebhook(mockClient, {
      ...dummyConfig,
      internalWebhookSecret: "",
    });

    expect(mockClient.get).not.toHaveBeenCalled();
    expect(mockClient.post).not.toHaveBeenCalled();
  });

  it("should create flow, operation, and link operation when flow does not exist", async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((url: string) => {
        if (url.includes("/flows?filter[name][_eq]=")) {
          return Promise.resolve({ data: { data: [] } });
        }
        if (url.includes("/operations?filter[flow][_eq]=")) {
          return Promise.resolve({ data: { data: [] } });
        }
        if (url.includes("/flows/flow-123")) {
          return Promise.resolve({
            data: { data: { id: "flow-123", operation: null } },
          });
        }
        return Promise.reject(new Error(`Unexpected GET url: ${url}`));
      }),
      post: vi.fn().mockImplementation((url: string) => {
        if (url === "/flows") {
          return Promise.resolve({ data: { data: { id: "flow-123" } } });
        }
        if (url === "/operations") {
          return Promise.resolve({ data: { data: { id: "op-456" } } });
        }
        return Promise.reject(new Error(`Unexpected POST url: ${url}`));
      }),
      patch: vi.fn().mockResolvedValue({ data: { data: {} } }),
    } as unknown as AxiosInstance;

    await ensureWebhook(mockClient, dummyConfig);

    expect(mockClient.post).toHaveBeenCalledWith(
      "/flows",
      expect.objectContaining({
        name: CACHE_INVALIDATION_FLOW_NAME,
        status: "active",
        trigger: "event",
      }),
    );
    expect(mockClient.post).toHaveBeenCalledWith(
      "/operations",
      expect.objectContaining({
        flow: "flow-123",
        key: CACHE_INVALIDATION_OPERATION_KEY,
        type: "request",
      }),
    );
    expect(mockClient.patch).toHaveBeenCalledWith("/flows/flow-123", {
      operation: "op-456",
    });
  });

  it("should update operation and link flow when flow and operation already exist", async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((url: string) => {
        if (url.includes("/flows?filter[name][_eq]=")) {
          return Promise.resolve({
            data: {
              data: [
                { id: "flow-existing", name: CACHE_INVALIDATION_FLOW_NAME },
              ],
            },
          });
        }
        if (url.includes("/operations?filter[flow][_eq]=")) {
          return Promise.resolve({
            data: {
              data: [
                {
                  id: "op-existing",
                  key: CACHE_INVALIDATION_OPERATION_KEY,
                },
              ],
            },
          });
        }
        if (url.includes("/flows/flow-existing")) {
          return Promise.resolve({
            data: { data: { id: "flow-existing", operation: "op-other" } },
          });
        }
        return Promise.reject(new Error(`Unexpected GET url: ${url}`));
      }),
      post: vi.fn(),
      patch: vi.fn().mockResolvedValue({ data: { data: {} } }),
    } as unknown as AxiosInstance;

    await ensureWebhook(mockClient, dummyConfig);

    expect(mockClient.post).not.toHaveBeenCalled();
    expect(mockClient.patch).toHaveBeenCalledWith(
      "/operations/op-existing",
      expect.objectContaining({
        options: expect.objectContaining({
          headers: [{ header: "x-webhook-secret", value: "test-secret-456" }],
        }),
      }),
    );
    expect(mockClient.patch).toHaveBeenCalledWith("/flows/flow-existing", {
      operation: "op-existing",
    });
  });

  it("should catch and log error gracefully when request fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mockClient = {
      get: vi.fn().mockRejectedValue(new Error("Network connection failed")),
      post: vi.fn(),
      patch: vi.fn(),
    } as unknown as AxiosInstance;

    await expect(ensureWebhook(mockClient, dummyConfig)).resolves.not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      "[SetupDirectus] Notice: could not automatically provision webhook:",
      expect.stringContaining("Network connection failed"),
    );
    warnSpy.mockRestore();
  });
});
