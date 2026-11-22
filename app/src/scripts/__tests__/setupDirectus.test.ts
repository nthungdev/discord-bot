import type { AxiosInstance } from "axios";
import { describe, expect, it, vi } from "vitest";
import {
  buildLegacyBackfillPayload,
  CACHE_INVALIDATION_FLOW_COLLECTIONS,
  CACHE_INVALIDATION_FLOW_NAME,
  CACHE_INVALIDATION_FLOW_SCOPES,
  CACHE_INVALIDATION_OPERATION_KEY,
  CACHE_INVALIDATION_OPERATION_NAME,
  COLLECTIONS,
  ensureCollections,
  ensurePolicy,
  ensureWebhook,
  LEGACY_GUILD_CONFIG_FIELDS,
  migrateLegacyGuildConfigColumns,
  POLICY_ACTIONS_BY_COLLECTION,
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

describe("COLLECTIONS schema invariants", () => {
  it("should define bot_system_config as a singleton with all 11 required fields", () => {
    const systemConfig = COLLECTIONS.find(
      (col) => col.collection === "bot_system_config",
    );
    expect(systemConfig).toBeDefined();
    expect(systemConfig?.meta.singleton).toBe(true);

    const expectedFields = [
      "id",
      "ai_provider",
      "ai_model_id",
      "ai_api_endpoint",
      "ai_project_id",
      "ai_location_id",
      "ai_max_output_tokens",
      "ai_max_conversation_history",
      "ai_safety_settings",
      "memory_store_type",
      "check_in_leaderboard",
    ];
    const actualFields = systemConfig?.fields.map((f) => f.field) ?? [];
    expect(actualFields).toHaveLength(expectedFields.length);
    for (const fieldName of expectedFields) {
      expect(actualFields).toContain(fieldName);
    }
  });

  it("should define bot_guild_configs with all 9 capability groups and required flattened columns", () => {
    const guildConfigs = COLLECTIONS.find(
      (col) => col.collection === "bot_guild_configs",
    );
    expect(guildConfigs).toBeDefined();
    expect(guildConfigs?.meta.singleton).toBeUndefined();

    const expectedGroups = [
      "group_core_identity",
      "group_smart_reply",
      "group_roast",
      "group_moderation",
      "group_voice_bouncer",
      "group_matchmaking",
      "group_valorant",
      "group_voice_companion",
      "group_guild_metadata",
    ];

    const fields = guildConfigs?.fields ?? [];
    const groupFields = fields.filter(
      (f) => f.type === "alias" && f.meta?.interface === "group-detail",
    );
    expect(groupFields.map((f) => f.field)).toEqual(expectedGroups);
    for (const groupField of groupFields) {
      expect(groupField.schema).toBeNull();
      expect(groupField.meta?.special).toEqual(["alias", "no-data", "group"]);
    }

    const expectedFlattenedFields = [
      "id",
      // Core & Identity
      "bot_id",
      "guild_id",
      "guild_name",
      "bot_name",
      "lock_name",
      "personalization",
      "personalization_mode",
      "system_instruction",
      "reply_delay",
      "locale_override",
      "reply_channel_ids",
      "ignored_channel_ids",
      "respond_to_mentions",
      "chat_bot_model",
      "tools_google_search",
      "tools_discord",
      // Smart Reply
      "smart_reply_enabled",
      "smart_reply_mode",
      "smart_reply_classifier_model",
      "smart_reply_chat_bot_model",
      "smart_reply_ambient_confidence_threshold",
      "smart_reply_debounce_ms",
      "smart_reply_max_debounce_ms",
      "smart_reply_session_ttl_seconds",
      "smart_reply_strategy",
      "smart_reply_coalesce_window_ms",
      "smart_reply_silence_duration_minutes",
      "smart_reply_ambient_rate_limit_seconds",
      "smart_reply_ambient_snapshot_limit",
      "smart_reply_enable_keyword_dismissal",
      "smart_reply_enable_reaction_dismissal",
      "smart_reply_send_typing_behavior",
      "smart_reply_thread_auto_listen",
      "smart_reply_opt_out_topic_tag",
      // Roast
      "roast_enabled",
      "roast_default_locale",
      "roast_locale_override",
      "roast_max_intensity",
      "roast_allowed_channel_ids",
      "roast_ignored_channel_ids",
      "roast_max_per_day",
      "roast_target_shield_cooldown_seconds",
      "roast_caller_cooldown_seconds",
      "roast_allow_counter_roast",
      // Moderation
      "moderation_enabled",
      // Voice Bouncer
      "voice_bouncer_enabled",
      "voice_bouncer_tag_only_channel_ids",
      "voice_bouncer_tag_only_category_ids",
      "voice_bouncer_exempt_role_ids",
      "voice_bouncer_fallback_channel_id",
      "voice_bouncer_action",
      "voice_bouncer_warning_message",
      // Matchmaking
      "matchmaking_enabled",
      "matchmaking_lobby_channel_id",
      "matchmaking_team1_channel_id",
      "matchmaking_team2_channel_id",
      "matchmaking_category_id",
      "matchmaking_map_pool",
      "matchmaking_default_k_factor",
      "matchmaking_initial_elo",
      "matchmaking_score_timeout_minutes",
      "matchmaking_auto_move_players",
      // Valorant
      "valorant_enabled",
      "valorant_compare_enabled",
      "valorant_stats_enabled",
      "valorant_stats_default_period",
      "valorant_auto_recap_enabled",
      "valorant_auto_recap_channel_id",
      "valorant_auto_recap_min_tier_alert",
      "valorant_auto_recap_sportscaster_banter",
      "valorant_live_scouting_enabled",
      "valorant_live_scouting_channel_id",
      "valorant_live_scouting_alert_on_game_start",
      "valorant_rank_role_sync_enabled",
      "valorant_rank_role_mappings",
      "valorant_tilt_enabled",
      "valorant_tilt_consecutive_losses_threshold",
      "valorant_tilt_night_owl_hour_start",
      "valorant_tilt_night_owl_hour_end",
      "valorant_tilt_dm_alert",
      // Voice Companion
      "voice_companion_enabled",
      "voice_companion_auto_join_channel_id",
      "voice_companion_inactivity_timeout_minutes",
      "voice_companion_empty_channel_grace_seconds",
      "voice_companion_model_id",
      "voice_companion_voice_name",
      "voice_companion_system_instruction",
      "voice_companion_energy_threshold",
      "voice_companion_barge_in_sensitivity",
      "voice_companion_participation_mode",
      // Guild Metadata
      "guild_emojis",
      "guild_members",
    ];

    const actualFieldNames = fields.map((f) => f.field);
    for (const expectedField of expectedFlattenedFields) {
      expect(actualFieldNames).toContain(expectedField);
    }

    for (const legacyField of LEGACY_GUILD_CONFIG_FIELDS) {
      expect(actualFieldNames).not.toContain(legacyField);
    }
  });

  it("should include bot_system_config, bot_guild_configs, and bot_roast_presets in CACHE_INVALIDATION_FLOW_COLLECTIONS", () => {
    expect(CACHE_INVALIDATION_FLOW_COLLECTIONS).toContain("bot_system_config");
    expect(CACHE_INVALIDATION_FLOW_COLLECTIONS).toContain("bot_guild_configs");
    expect(CACHE_INVALIDATION_FLOW_COLLECTIONS).toContain("bot_roast_presets");
    expect(CACHE_INVALIDATION_FLOW_COLLECTIONS).toEqual([
      "bot_system_config",
      "bot_guild_configs",
      "bot_roast_presets",
    ]);
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
  it("should create collections that do not exist including singleton bot_system_config", async () => {
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
      expect.objectContaining({
        collection: "bot_system_config",
        meta: expect.objectContaining({ singleton: true }),
      }),
    );
    expect(mockClient.post).toHaveBeenCalledWith(
      "/collections",
      expect.objectContaining({ collection: "bot_guild_configs" }),
    );
    expect(mockClient.post).toHaveBeenCalledWith(
      "/collections",
      expect.objectContaining({ collection: "bot_roast_presets" }),
    );
    expect(mockClient.post).toHaveBeenCalledWith(
      "/collections",
      expect.objectContaining({ collection: "bot_roast_logs" }),
    );
    expect(mockClient.post).toHaveBeenCalledWith(
      "/collections",
      expect.objectContaining({ collection: "bot_match_logs" }),
    );
    expect(mockClient.post).toHaveBeenCalledWith(
      "/collections",
      expect.objectContaining({ collection: "bot_user_profiles" }),
    );
  });

  it("should synchronize missing flattened fields for collections that already exist without creating legacy valorant_features", async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((url: string) => {
        if (url === "/collections") {
          return Promise.resolve({
            data: {
              data: [
                { collection: "bot_system_config" },
                { collection: "bot_guild_configs" },
                { collection: "bot_roast_presets" },
                { collection: "bot_roast_logs" },
                { collection: "bot_match_logs" },
                { collection: "bot_user_profiles" },
              ],
            },
          });
        }
        if (url === "/fields/bot_system_config") {
          return Promise.resolve({
            data: {
              data: [{ field: "id" }, { field: "ai_provider" }],
            },
          });
        }
        if (url === "/fields/bot_guild_configs") {
          return Promise.resolve({
            data: {
              data: [
                { field: "id" },
                { field: "bot_id" },
                { field: "guild_id" },
                { field: "roast_enabled" },
              ],
            },
          });
        }
        if (url === "/fields/bot_user_profiles") {
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

    expect(mockClient.post).not.toHaveBeenCalledWith(
      "/collections",
      expect.anything(),
    );

    expect(mockClient.post).toHaveBeenCalledWith(
      "/fields/bot_system_config",
      expect.objectContaining({ field: "ai_model_id" }),
    );
    expect(mockClient.post).toHaveBeenCalledWith(
      "/fields/bot_system_config",
      expect.objectContaining({ field: "memory_store_type" }),
    );

    expect(mockClient.post).toHaveBeenCalledWith(
      "/fields/bot_guild_configs",
      expect.objectContaining({ field: "group_core_identity" }),
    );
    expect(mockClient.post).toHaveBeenCalledWith(
      "/fields/bot_guild_configs",
      expect.objectContaining({ field: "smart_reply_enabled" }),
    );
    expect(mockClient.post).toHaveBeenCalledWith(
      "/fields/bot_guild_configs",
      expect.objectContaining({ field: "valorant_enabled" }),
    );
    expect(mockClient.post).toHaveBeenCalledWith(
      "/fields/bot_guild_configs",
      expect.objectContaining({ field: "valorant_compare_enabled" }),
    );
    expect(mockClient.post).toHaveBeenCalledWith(
      "/fields/bot_guild_configs",
      expect.objectContaining({ field: "voice_companion_enabled" }),
    );
    expect(mockClient.post).not.toHaveBeenCalledWith(
      "/fields/bot_guild_configs",
      expect.objectContaining({ field: "valorant_features" }),
    );

    expect(mockClient.post).toHaveBeenCalledWith(
      "/fields/bot_user_profiles",
      expect.objectContaining({ field: "riot_id" }),
    );
    expect(mockClient.post).toHaveBeenCalledWith(
      "/fields/bot_user_profiles",
      expect.objectContaining({ field: "riot_puuid" }),
    );
  });

  it("should return Map<string, Set<string>> of newly created fields for both new and existing collections", async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((url: string) => {
        if (url === "/collections") {
          return Promise.resolve({
            data: { data: [{ collection: "bot_system_config" }] },
          });
        }
        if (url === "/fields/bot_system_config") {
          const existing =
            COLLECTIONS.find(
              (c) => c.collection === "bot_system_config",
            )?.fields.filter((f) => f.field !== "ai_model_id") ?? [];
          return Promise.resolve({ data: { data: existing } });
        }
        return Promise.reject(new Error(`Unexpected GET url: ${url}`));
      }),
      post: vi.fn().mockResolvedValue({ data: { data: {} } }),
    } as unknown as AxiosInstance;

    const createdMap = await ensureCollections(mockClient);

    expect(createdMap).toBeInstanceOf(Map);
    expect(createdMap.get("bot_system_config")).toEqual(
      new Set(["ai_model_id"]),
    );

    const guildConfigFields =
      COLLECTIONS.find((c) => c.collection === "bot_guild_configs")?.fields.map(
        (f) => f.field,
      ) ?? [];
    expect(createdMap.get("bot_guild_configs")).toEqual(
      new Set(guildConfigFields),
    );
  });

  it("should rethrow when creating a missing field fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mockClient = {
      get: vi.fn().mockImplementation((url: string) => {
        if (url === "/collections") {
          return Promise.resolve({
            data: { data: [{ collection: "bot_system_config" }] },
          });
        }
        if (url === "/fields/bot_system_config") {
          return Promise.resolve({ data: { data: [{ field: "id" }] } });
        }
        return Promise.resolve({ data: { data: [] } });
      }),
      post: vi.fn().mockRejectedValueOnce(new Error("Field creation failed")),
    } as unknown as AxiosInstance;

    await expect(ensureCollections(mockClient)).rejects.toThrow(
      "Field creation failed",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "[SetupDirectus] Failed to synchronize fields for collection bot_system_config:",
      "Field creation failed",
    );
    errorSpy.mockRestore();
  });
});

describe("ensurePolicy", () => {
  it("should enforce least-privilege permissions in POLICY_ACTIONS_BY_COLLECTION", () => {
    expect(POLICY_ACTIONS_BY_COLLECTION).toEqual({
      bot_system_config: ["read"],
      bot_guild_configs: ["create", "read", "update"],
      bot_roast_presets: ["read"],
      bot_roast_logs: ["create", "read"],
      bot_match_logs: ["create", "read", "update"],
      bot_user_profiles: ["create", "read", "update"],
    });
  });

  it("should create bot-service-policy with non-admin flags and grant least-privilege permissions per collection", async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((url: string) => {
        if (url === "/policies?filter[name][_eq]=bot-service-policy") {
          return Promise.resolve({ data: { data: [] } });
        }
        if (url === "/permissions?filter[policy][_eq]=policy-new&limit=-1") {
          return Promise.resolve({ data: { data: [] } });
        }
        return Promise.reject(new Error(`Unexpected GET url: ${url}`));
      }),
      post: vi.fn().mockImplementation((url: string) => {
        if (url === "/policies") {
          return Promise.resolve({ data: { data: { id: "policy-new" } } });
        }
        if (url === "/permissions") {
          return Promise.resolve({ data: { data: {} } });
        }
        return Promise.reject(new Error(`Unexpected POST url: ${url}`));
      }),
    } as unknown as AxiosInstance;

    const policyId = await ensurePolicy(mockClient);

    expect(policyId).toBe("policy-new");
    expect(mockClient.post).toHaveBeenCalledWith(
      "/policies",
      expect.objectContaining({
        name: "bot-service-policy",
        app_access: false,
        admin_access: false,
      }),
    );

    const permissionCalls = vi
      .mocked(mockClient.post)
      .mock.calls.filter(([url]) => url === "/permissions")
      .map(
        ([, body]) =>
          body as {
            policy: string;
            collection: string;
            action: string;
            fields: string[];
          },
      );

    for (const col of COLLECTIONS) {
      const actions = permissionCalls
        .filter((p) => p.collection === col.collection)
        .map((p) => p.action);
      expect(actions).toEqual(POLICY_ACTIONS_BY_COLLECTION[col.collection]);
      expect(actions).not.toContain("delete");
    }
  });

  it("should patch existing policy flags, revoke excess permissions via DELETE, and create only missing allowed permissions", async () => {
    const existingAllowedPerms = COLLECTIONS.flatMap((col) => {
      const actions = POLICY_ACTIONS_BY_COLLECTION[col.collection] ?? ["read"];
      return actions
        .filter(
          (action) =>
            !(col.collection === "bot_guild_configs" && action === "update"),
        )
        .map((action, index) => ({
          id: `perm-${col.collection}-${index}`,
          collection: col.collection,
          action,
        }));
    });
    const excessPerms = [
      {
        id: "perm-excess-guild-delete",
        collection: "bot_guild_configs",
        action: "delete",
      },
      {
        id: "perm-excess-system-update",
        collection: "bot_system_config",
        action: "update",
      },
      {
        id: "perm-excess-preset-create",
        collection: "bot_roast_presets",
        action: "create",
      },
    ];

    const mockClient = {
      get: vi.fn().mockImplementation((url: string) => {
        if (url === "/policies?filter[name][_eq]=bot-service-policy") {
          return Promise.resolve({
            data: { data: [{ id: "policy-existing" }] },
          });
        }
        if (
          url === "/permissions?filter[policy][_eq]=policy-existing&limit=-1"
        ) {
          return Promise.resolve({
            data: { data: [...existingAllowedPerms, ...excessPerms] },
          });
        }
        return Promise.reject(new Error(`Unexpected GET url: ${url}`));
      }),
      patch: vi.fn().mockResolvedValue({ data: { data: {} } }),
      delete: vi.fn().mockResolvedValue({ data: { data: {} } }),
      post: vi.fn().mockResolvedValue({ data: { data: {} } }),
    } as unknown as AxiosInstance;

    const policyId = await ensurePolicy(mockClient);

    expect(policyId).toBe("policy-existing");
    expect(mockClient.patch).toHaveBeenCalledWith("/policies/policy-existing", {
      app_access: false,
      admin_access: false,
    });
    expect(mockClient.delete).toHaveBeenCalledTimes(3);
    expect(mockClient.delete).toHaveBeenCalledWith(
      "/permissions/perm-excess-guild-delete",
    );
    expect(mockClient.delete).toHaveBeenCalledWith(
      "/permissions/perm-excess-system-update",
    );
    expect(mockClient.delete).toHaveBeenCalledWith(
      "/permissions/perm-excess-preset-create",
    );
    expect(mockClient.post).not.toHaveBeenCalledWith(
      "/policies",
      expect.anything(),
    );
    expect(mockClient.post).toHaveBeenCalledTimes(1);
    expect(mockClient.post).toHaveBeenCalledWith(
      "/permissions",
      expect.objectContaining({
        policy: "policy-existing",
        collection: "bot_guild_configs",
        action: "update",
      }),
    );
  });
});

describe("buildLegacyBackfillPayload", () => {
  it("should map all 6 legacy columns including all 17 valorant flattened columns and default bot_id", () => {
    const payload = buildLegacyBackfillPayload({
      id: "row-1",
      guild_id: "guild-1",
      enable_ai_roast: false,
      default_locale: "vi",
      allowed_channel_ids: ["ch-1", "ch-2"],
      max_roasts_per_day: 25,
      enable_bouncergon: true,
      valorant_features: {
        compare: { enabled: false },
        statsSummary: { enabled: true, defaultPeriod: "current_act" },
        autoRecap: {
          enabled: true,
          channelId: "recap-ch",
          minTierAlert: 15,
          sportscasterBanter: false,
        },
        liveScouting: {
          enabled: false,
          channelId: "scout-ch",
          alertOnGameStart: true,
        },
        rankRoleSync: {
          enabled: true,
          roleMappings: { Radiant: "role-1", Immortal: "role-2" },
        },
        tiltProtection: {
          enabled: true,
          consecutiveLossesThreshold: 4,
          nightOwlHourStart: 2,
          nightOwlHourEnd: 6,
          dmAlert: false,
        },
      },
    });

    expect(payload).toEqual({
      bot_id: "chatBot",
      roast_enabled: false,
      roast_default_locale: "vi",
      roast_allowed_channel_ids: ["ch-1", "ch-2"],
      roast_max_per_day: 25,
      voice_bouncer_enabled: true,
      valorant_compare_enabled: false,
      valorant_stats_enabled: true,
      valorant_stats_default_period: "current_act",
      valorant_auto_recap_enabled: true,
      valorant_auto_recap_channel_id: "recap-ch",
      valorant_auto_recap_min_tier_alert: 15,
      valorant_auto_recap_sportscaster_banter: false,
      valorant_live_scouting_enabled: false,
      valorant_live_scouting_channel_id: "scout-ch",
      valorant_live_scouting_alert_on_game_start: true,
      valorant_rank_role_sync_enabled: true,
      valorant_rank_role_mappings: { Radiant: "role-1", Immortal: "role-2" },
      valorant_tilt_enabled: true,
      valorant_tilt_consecutive_losses_threshold: 4,
      valorant_tilt_night_owl_hour_start: 2,
      valorant_tilt_night_owl_hour_end: 6,
      valorant_tilt_dm_alert: false,
    });
  });

  it("should parse JSON string valorant_features and normalize 'en' to 'en-US'", () => {
    const payload = buildLegacyBackfillPayload({
      id: "row-2",
      bot_id: "customBot",
      default_locale: "en",
      valorant_features: JSON.stringify({
        compare: { enabled: true },
        tiltProtection: { consecutiveLossesThreshold: 5 },
      }),
    });

    expect(payload).toEqual({
      roast_default_locale: "en-US",
      valorant_compare_enabled: true,
      valorant_tilt_consecutive_losses_threshold: 5,
    });
    expect(payload.bot_id).toBeUndefined();
  });

  it("should default bot_id when blank or whitespace and preserve customized non-default target columns (non-destructive backfill)", () => {
    const payload = buildLegacyBackfillPayload({
      id: "row-3",
      bot_id: "   ",
      enable_ai_roast: true,
      roast_enabled: false,
      default_locale: "vi",
      roast_default_locale: "en-US",
      allowed_channel_ids: ["legacy-ch"],
      roast_allowed_channel_ids: [],
      max_roasts_per_day: 20,
      roast_max_per_day: 25,
      enable_bouncergon: false,
      voice_bouncer_enabled: true,
      valorant_features: {
        compare: { enabled: true },
        autoRecap: { channelId: "legacy-recap", minTierAlert: 10 },
      },
      valorant_compare_enabled: false,
      valorant_auto_recap_channel_id: "existing-recap",
    });

    expect(payload).toEqual({
      bot_id: "chatBot",
      valorant_auto_recap_min_tier_alert: 10,
    });
  });

  it("should handle empty, null, array, or malformed valorant_features safely", () => {
    for (const invalidValue of [
      null,
      undefined,
      "",
      "{not-valid-json",
      "[]",
      "123",
      ["compare"],
      42,
      { compare: "not-an-object", statsSummary: [1, 2] },
    ]) {
      const payload = buildLegacyBackfillPayload({
        id: "row-safe",
        bot_id: "chatBot",
        valorant_features: invalidValue,
      });
      expect(payload).toEqual({});
    }
  });

  it("should overwrite newly created target columns populated with PostgreSQL defaults when listed in forceOverwriteFields without overwriting customized target columns outside forceOverwriteFields", () => {
    const forceOverwriteFields = new Set([
      "roast_enabled",
      "roast_default_locale",
      "roast_max_per_day",
      "voice_bouncer_enabled",
      "valorant_compare_enabled",
    ]);

    const payload = buildLegacyBackfillPayload(
      {
        id: "row-force",
        bot_id: "chatBot",
        roast_enabled: true,
        roast_default_locale: "vi",
        roast_max_per_day: 10,
        voice_bouncer_enabled: false,
        valorant_compare_enabled: true,
        roast_allowed_channel_ids: ["preexisting-ch"],
        valorant_stats_enabled: false,
        valorant_tilt_consecutive_losses_threshold: 5,
        enable_ai_roast: false,
        default_locale: "en",
        max_roasts_per_day: 50,
        enable_bouncergon: true,
        allowed_channel_ids: ["legacy-ch"],
        valorant_features: {
          compare: { enabled: false },
          statsSummary: { enabled: true },
          tiltProtection: { consecutiveLossesThreshold: 3 },
        },
      },
      forceOverwriteFields,
    );

    expect(payload).toEqual({
      roast_enabled: false,
      roast_default_locale: "en-US",
      roast_max_per_day: 50,
      voice_bouncer_enabled: true,
      valorant_compare_enabled: false,
    });
    expect(payload.roast_allowed_channel_ids).toBeUndefined();
    expect(payload.valorant_stats_enabled).toBeUndefined();
    expect(payload.valorant_tilt_consecutive_losses_threshold).toBeUndefined();
  });

  it("should backfill target columns holding schema defaults from differing legacy values on crash recovery without forceOverwriteFields while preserving customized non-default target fields", () => {
    const payload = buildLegacyBackfillPayload({
      id: "row-crash-recovery",
      bot_id: "chatBot",
      roast_enabled: true,
      roast_default_locale: "vi",
      roast_max_per_day: 10,
      voice_bouncer_enabled: false,
      valorant_tilt_consecutive_losses_threshold: 5,
      enable_ai_roast: false,
      default_locale: "en",
      max_roasts_per_day: 50,
      enable_bouncergon: true,
      valorant_features: {
        tiltProtection: { consecutiveLossesThreshold: 3 },
      },
    });

    expect(payload).toEqual({
      roast_enabled: false,
      roast_default_locale: "en-US",
      roast_max_per_day: 50,
      voice_bouncer_enabled: true,
    });
    expect(payload.valorant_tilt_consecutive_losses_threshold).toBeUndefined();
  });

  it("should ignore empty or whitespace default_locale and safely parse JSON-encoded string allowed_channel_ids", () => {
    const emptyLocalePayload = buildLegacyBackfillPayload({
      id: "row-locale",
      bot_id: "chatBot",
      default_locale: "   ",
      allowed_channel_ids: '["c1","c2"]',
    });

    expect(emptyLocalePayload).toEqual({
      roast_allowed_channel_ids: ["c1", "c2"],
    });
    expect(emptyLocalePayload.roast_default_locale).toBeUndefined();

    const blankLocalePayload = buildLegacyBackfillPayload({
      id: "row-locale-empty",
      bot_id: "chatBot",
      default_locale: "",
      allowed_channel_ids: '["c1", 123, null, "c2"]',
    });

    expect(blankLocalePayload).toEqual({
      roast_allowed_channel_ids: ["c1", "c2"],
    });

    for (const badChannels of ["", "  ", "{not-json", '{"a":1}', "123"]) {
      const safePayload = buildLegacyBackfillPayload({
        id: "row-bad-channels",
        bot_id: "chatBot",
        allowed_channel_ids: badChannels,
      });
      expect(safePayload).toEqual({});
    }
  });
});

const REQUIRED_TARGET_FIELD_OBJECTS = [
  "bot_id",
  "roast_enabled",
  "roast_default_locale",
  "roast_allowed_channel_ids",
  "roast_max_per_day",
  "voice_bouncer_enabled",
  "valorant_compare_enabled",
  "valorant_stats_enabled",
  "valorant_stats_default_period",
  "valorant_auto_recap_enabled",
  "valorant_auto_recap_channel_id",
  "valorant_auto_recap_min_tier_alert",
  "valorant_auto_recap_sportscaster_banter",
  "valorant_live_scouting_enabled",
  "valorant_live_scouting_channel_id",
  "valorant_live_scouting_alert_on_game_start",
  "valorant_rank_role_sync_enabled",
  "valorant_rank_role_mappings",
  "valorant_tilt_enabled",
  "valorant_tilt_consecutive_losses_threshold",
  "valorant_tilt_night_owl_hour_start",
  "valorant_tilt_night_owl_hour_end",
  "valorant_tilt_dm_alert",
].map((field) => ({ field }));

describe("migrateLegacyGuildConfigColumns", () => {
  it("should no-op idempotently without fetching items or deleting fields when no legacy fields exist", async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValueOnce({
        data: {
          data: [
            { field: "id" },
            { field: "bot_id" },
            { field: "guild_id" },
            { field: "roast_enabled" },
          ],
        },
      }),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as AxiosInstance;

    await migrateLegacyGuildConfigColumns(mockClient);

    expect(mockClient.get).toHaveBeenCalledTimes(1);
    expect(mockClient.get).toHaveBeenCalledWith("/fields/bot_guild_configs");
    expect(mockClient.patch).not.toHaveBeenCalled();
    expect(mockClient.delete).not.toHaveBeenCalled();
  });

  it("should backfill rows needing migration with pagination and delete only detected legacy fields after all patches succeed", async () => {
    const mockClient = {
      get: vi
        .fn()
        .mockImplementation(
          (url: string, config?: { params?: Record<string, unknown> }) => {
            if (url === "/fields/bot_guild_configs") {
              return Promise.resolve({
                data: {
                  data: [
                    { field: "id" },
                    ...REQUIRED_TARGET_FIELD_OBJECTS,
                    { field: "enable_ai_roast" },
                    { field: "default_locale" },
                    { field: "valorant_features" },
                  ],
                },
              });
            }
            if (
              url === "/items/bot_guild_configs" &&
              config?.params?.limit === 100 &&
              config?.params?.page === 1 &&
              config?.params?.sort === "id"
            ) {
              return Promise.resolve({
                data: {
                  data: [
                    {
                      id: "row-needs-backfill",
                      enable_ai_roast: false,
                      default_locale: "en",
                      valorant_features: { compare: { enabled: false } },
                    },
                    {
                      id: "row-already-migrated",
                      bot_id: "chatBot",
                      roast_enabled: false,
                      roast_default_locale: "en-US",
                      enable_ai_roast: true,
                      default_locale: "vi",
                    },
                    {
                      id: null,
                      bot_id: "chatBot",
                    },
                  ],
                },
              });
            }
            return Promise.reject(new Error(`Unexpected GET url: ${url}`));
          },
        ),
      patch: vi.fn().mockResolvedValue({ data: { data: {} } }),
      delete: vi.fn().mockResolvedValue({ data: { data: {} } }),
    } as unknown as AxiosInstance;

    await migrateLegacyGuildConfigColumns(mockClient);

    expect(mockClient.get).toHaveBeenCalledWith("/items/bot_guild_configs", {
      params: { limit: 100, page: 1, sort: "id" },
    });
    expect(mockClient.patch).toHaveBeenCalledTimes(1);
    expect(mockClient.patch).toHaveBeenCalledWith(
      "/items/bot_guild_configs/row-needs-backfill",
      {
        bot_id: "chatBot",
        roast_enabled: false,
        roast_default_locale: "en-US",
        valorant_compare_enabled: false,
      },
    );

    expect(mockClient.delete).toHaveBeenCalledTimes(3);
    expect(mockClient.delete).toHaveBeenCalledWith(
      "/fields/bot_guild_configs/enable_ai_roast",
    );
    expect(mockClient.delete).toHaveBeenCalledWith(
      "/fields/bot_guild_configs/default_locale",
    );
    expect(mockClient.delete).toHaveBeenCalledWith(
      "/fields/bot_guild_configs/valorant_features",
    );
  });

  it("should not delete any legacy fields and should propagate error if patching a row fails", async () => {
    const mockClient = {
      get: vi
        .fn()
        .mockImplementation(
          (url: string, config?: { params?: Record<string, unknown> }) => {
            if (url === "/fields/bot_guild_configs") {
              return Promise.resolve({
                data: {
                  data: [
                    { field: "id" },
                    ...REQUIRED_TARGET_FIELD_OBJECTS,
                    { field: "enable_ai_roast" },
                    { field: "enable_bouncergon" },
                  ],
                },
              });
            }
            if (
              url === "/items/bot_guild_configs" &&
              config?.params?.limit === 100 &&
              config?.params?.page === 1 &&
              config?.params?.sort === "id"
            ) {
              return Promise.resolve({
                data: {
                  data: [
                    { id: "row-ok", enable_ai_roast: true },
                    { id: "row-fail", enable_bouncergon: true },
                  ],
                },
              });
            }
            return Promise.reject(new Error(`Unexpected GET url: ${url}`));
          },
        ),
      patch: vi
        .fn()
        .mockResolvedValueOnce({ data: { data: {} } })
        .mockRejectedValueOnce(new Error("Patch failure on row-fail")),
      delete: vi.fn(),
    } as unknown as AxiosInstance;

    await expect(migrateLegacyGuildConfigColumns(mockClient)).rejects.toThrow(
      "Patch failure on row-fail",
    );

    expect(mockClient.patch).toHaveBeenCalledTimes(2);
    expect(mockClient.delete).not.toHaveBeenCalled();
  });

  it("should throw and not delete legacy fields when required target fields are missing", async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValueOnce({
        data: {
          data: [
            { field: "id" },
            { field: "bot_id" },
            { field: "roast_enabled" },
            { field: "enable_ai_roast" },
          ],
        },
      }),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as AxiosInstance;

    await expect(migrateLegacyGuildConfigColumns(mockClient)).rejects.toThrow(
      "Cannot migrate legacy bot_guild_configs columns; missing target fields:",
    );

    expect(mockClient.get).toHaveBeenCalledTimes(1);
    expect(mockClient.patch).not.toHaveBeenCalled();
    expect(mockClient.delete).not.toHaveBeenCalled();
  });

  it("should throw and not delete legacy fields when a row needing backfill has a missing or blank id", async () => {
    for (const invalidId of [null, undefined, "", "   "]) {
      const mockClient = {
        get: vi
          .fn()
          .mockImplementation(
            (url: string, config?: { params?: Record<string, unknown> }) => {
              if (url === "/fields/bot_guild_configs") {
                return Promise.resolve({
                  data: {
                    data: [
                      { field: "id" },
                      ...REQUIRED_TARGET_FIELD_OBJECTS,
                      { field: "enable_ai_roast" },
                    ],
                  },
                });
              }
              if (
                url === "/items/bot_guild_configs" &&
                config?.params?.limit === 100 &&
                config?.params?.page === 1 &&
                config?.params?.sort === "id"
              ) {
                return Promise.resolve({
                  data: {
                    data: [
                      {
                        id: invalidId,
                        guild_id: "guild-missing-id",
                        enable_ai_roast: true,
                      },
                    ],
                  },
                });
              }
              return Promise.reject(new Error(`Unexpected GET url: ${url}`));
            },
          ),
        patch: vi.fn(),
        delete: vi.fn(),
      } as unknown as AxiosInstance;

      await expect(migrateLegacyGuildConfigColumns(mockClient)).rejects.toThrow(
        "Cannot patch migrated bot_guild_configs row without valid id (guild_id: guild-missing-id)",
      );

      expect(mockClient.patch).not.toHaveBeenCalled();
      expect(mockClient.delete).not.toHaveBeenCalled();
    }
  });

  it("should paginate across multiple pages (100 + 2 rows) before deleting legacy columns", async () => {
    const page1Rows = Array.from({ length: 100 }, (_, index) => ({
      id: `row-${index + 1}`,
      enable_ai_roast: index % 2 === 0,
    }));
    const page2Rows = [
      { id: "row-101", enable_ai_roast: true },
      { id: "row-102", enable_ai_roast: false },
    ];
    const callOrder: string[] = [];

    const mockClient = {
      get: vi
        .fn()
        .mockImplementation(
          (url: string, config?: { params?: Record<string, unknown> }) => {
            if (url === "/fields/bot_guild_configs") {
              return Promise.resolve({
                data: {
                  data: [
                    { field: "id" },
                    ...REQUIRED_TARGET_FIELD_OBJECTS,
                    { field: "enable_ai_roast" },
                  ],
                },
              });
            }
            if (
              url === "/items/bot_guild_configs" &&
              config?.params?.limit === 100 &&
              config?.params?.sort === "id"
            ) {
              if (config.params.page === 1) {
                callOrder.push("get-page-1");
                return Promise.resolve({ data: { data: page1Rows } });
              }
              if (config.params.page === 2) {
                callOrder.push("get-page-2");
                return Promise.resolve({ data: { data: page2Rows } });
              }
            }
            return Promise.reject(new Error(`Unexpected GET url: ${url}`));
          },
        ),
      patch: vi.fn().mockImplementation((url: string) => {
        callOrder.push(`patch:${url}`);
        return Promise.resolve({ data: { data: {} } });
      }),
      delete: vi.fn().mockImplementation((url: string) => {
        callOrder.push(`delete:${url}`);
        return Promise.resolve({ data: { data: {} } });
      }),
    } as unknown as AxiosInstance;

    await migrateLegacyGuildConfigColumns(mockClient);

    expect(mockClient.get).toHaveBeenCalledWith("/items/bot_guild_configs", {
      params: { limit: 100, page: 1, sort: "id" },
    });
    expect(mockClient.get).toHaveBeenCalledWith("/items/bot_guild_configs", {
      params: { limit: 100, page: 2, sort: "id" },
    });
    expect(mockClient.patch).toHaveBeenCalledTimes(102);
    expect(mockClient.delete).toHaveBeenCalledTimes(1);
    expect(mockClient.delete).toHaveBeenCalledWith(
      "/fields/bot_guild_configs/enable_ai_roast",
    );
    expect(callOrder.at(-1)).toBe(
      "delete:/fields/bot_guild_configs/enable_ai_roast",
    );
    expect(callOrder.indexOf("get-page-2")).toBeGreaterThan(
      callOrder.indexOf("patch:/items/bot_guild_configs/row-100"),
    );
    expect(
      callOrder.indexOf("delete:/fields/bot_guild_configs/enable_ai_roast"),
    ).toBeGreaterThan(
      callOrder.indexOf("patch:/items/bot_guild_configs/row-102"),
    );
  });
});
