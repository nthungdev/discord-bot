import type { AxiosInstance } from "axios";
import { describe, expect, it, vi } from "vitest";
import {
  CACHE_INVALIDATION_FLOW_COLLECTIONS,
  CACHE_INVALIDATION_FLOW_NAME,
  CACHE_INVALIDATION_FLOW_SCOPES,
  CACHE_INVALIDATION_OPERATION_KEY,
  CACHE_INVALIDATION_OPERATION_NAME,
  ensureCollections,
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
      "/flows/flow-existing",
      expect.objectContaining({
        status: "active",
        trigger: "event",
        options: {
          type: "action",
          scope: CACHE_INVALIDATION_FLOW_SCOPES,
          collections: CACHE_INVALIDATION_FLOW_COLLECTIONS,
        },
      }),
    );
    expect(mockClient.patch).toHaveBeenCalledWith(
      "/operations/op-existing",
      expect.objectContaining({
        name: CACHE_INVALIDATION_OPERATION_NAME,
        type: "request",
        options: expect.objectContaining({
          headers: [{ header: "x-webhook-secret", value: "test-secret-456" }],
        }),
      }),
    );
    expect(mockClient.patch).toHaveBeenCalledWith("/flows/flow-existing", {
      operation: "op-existing",
    });
  });

  it("should reconcile inactive or incorrectly scoped existing flow to active status and required event options", async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((url: string) => {
        if (url.includes("/flows?filter[name][_eq]=")) {
          return Promise.resolve({
            data: {
              data: [
                {
                  id: "flow-inactive",
                  name: CACHE_INVALIDATION_FLOW_NAME,
                  status: "inactive",
                  trigger: "manual",
                  options: {},
                },
              ],
            },
          });
        }
        if (url.includes("/operations?filter[flow][_eq]=")) {
          return Promise.resolve({
            data: {
              data: [
                {
                  id: "op-1",
                  key: CACHE_INVALIDATION_OPERATION_KEY,
                },
              ],
            },
          });
        }
        if (url.includes("/flows/flow-inactive")) {
          return Promise.resolve({
            data: { data: { id: "flow-inactive", operation: "op-1" } },
          });
        }
        return Promise.reject(new Error(`Unexpected GET url: ${url}`));
      }),
      post: vi.fn(),
      patch: vi.fn().mockResolvedValue({ data: { data: {} } }),
    } as unknown as AxiosInstance;

    await ensureWebhook(mockClient, dummyConfig);

    expect(mockClient.patch).toHaveBeenCalledWith("/flows/flow-inactive", {
      status: "active",
      trigger: "event",
      options: {
        type: "action",
        scope: CACHE_INVALIDATION_FLOW_SCOPES,
        collections: CACHE_INVALIDATION_FLOW_COLLECTIONS,
      },
    });
  });

  it("should reconcile an existing operation with non-request type to request type", async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((url: string) => {
        if (url.includes("/flows?filter[name][_eq]=")) {
          return Promise.resolve({
            data: {
              data: [
                {
                  id: "flow-1",
                  name: CACHE_INVALIDATION_FLOW_NAME,
                  status: "active",
                },
              ],
            },
          });
        }
        if (url.includes("/operations?filter[flow][_eq]=")) {
          return Promise.resolve({
            data: {
              data: [
                {
                  id: "op-non-request",
                  key: CACHE_INVALIDATION_OPERATION_KEY,
                  type: "exec",
                },
              ],
            },
          });
        }
        if (url.includes("/flows/flow-1")) {
          return Promise.resolve({
            data: { data: { id: "flow-1", operation: "op-non-request" } },
          });
        }
        return Promise.reject(new Error(`Unexpected GET url: ${url}`));
      }),
      post: vi.fn(),
      patch: vi.fn().mockResolvedValue({ data: { data: {} } }),
    } as unknown as AxiosInstance;

    await ensureWebhook(mockClient, dummyConfig);

    expect(mockClient.patch).toHaveBeenCalledWith(
      "/operations/op-non-request",
      expect.objectContaining({
        name: CACHE_INVALIDATION_OPERATION_NAME,
        type: "request",
      }),
    );
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

describe("ensureCollections", () => {
  it("should create collections that do not exist", async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((url: string) => {
        if (url === "/collections") {
          return Promise.resolve({ data: { data: [] } });
        }
        return Promise.resolve({ data: { data: [] } });
      }),
      post: vi.fn().mockResolvedValue({ data: { data: {} } }),
    } as unknown as AxiosInstance;

    await ensureCollections(mockClient);

    expect(mockClient.post).toHaveBeenCalledWith(
      "/collections",
      expect.objectContaining({ collection: "bot_guild_configs" }),
    );
    expect(mockClient.post).toHaveBeenCalledWith(
      "/collections",
      expect.objectContaining({ collection: "bot_user_profiles" }),
    );
  });

  it("should synchronize missing fields for collections that already exist", async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((url: string) => {
        if (url === "/collections") {
          return Promise.resolve({
            data: {
              data: [
                { collection: "bot_guild_configs" },
                { collection: "bot_roast_presets" },
                { collection: "bot_roast_logs" },
                { collection: "bot_match_logs" },
                { collection: "bot_user_profiles" },
              ],
            },
          });
        }
        if (url === "/fields/bot_guild_configs") {
          // Existing collection lacks valorant_enabled and valorant_features
          return Promise.resolve({
            data: {
              data: [
                { field: "id" },
                { field: "guild_id" },
                { field: "enable_ai_roast" },
              ],
            },
          });
        }
        if (url === "/fields/bot_user_profiles") {
          // Existing collection lacks riot fields
          return Promise.resolve({
            data: {
              data: [
                { field: "id" },
                { field: "user_id" },
                { field: "opt_out_roast" },
              ],
            },
          });
        }
        return Promise.resolve({ data: { data: [] } });
      }),
      post: vi.fn().mockResolvedValue({ data: { data: {} } }),
    } as unknown as AxiosInstance;

    await ensureCollections(mockClient);

    // Should NOT call post /collections because they already exist
    expect(mockClient.post).not.toHaveBeenCalledWith(
      "/collections",
      expect.anything(),
    );

    // Should call post /fields/bot_guild_configs for missing fields
    expect(mockClient.post).toHaveBeenCalledWith(
      "/fields/bot_guild_configs",
      expect.objectContaining({ field: "valorant_enabled" }),
    );
    expect(mockClient.post).toHaveBeenCalledWith(
      "/fields/bot_guild_configs",
      expect.objectContaining({ field: "valorant_features" }),
    );

    // Should call post /fields/bot_user_profiles for missing fields
    expect(mockClient.post).toHaveBeenCalledWith(
      "/fields/bot_user_profiles",
      expect.objectContaining({ field: "riot_id" }),
    );
    expect(mockClient.post).toHaveBeenCalledWith(
      "/fields/bot_user_profiles",
      expect.objectContaining({ field: "riot_puuid" }),
    );
  });
});
