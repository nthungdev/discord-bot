import fs from "node:fs";
import { AxiosError, type AxiosInstance } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfigData } from "../../config";
import type { BotGuildConfig } from "../../config/types";
import {
  migrateConfigToDirectus,
  parseCliArgs,
  resolveDirectusAdminConfig,
  toSafeError,
} from "../migrateConfigToDirectus";

function createGuildConfig(
  overrides: Partial<BotGuildConfig> = {},
): BotGuildConfig {
  return {
    replyChannelIds: ["ch-1"],
    ignoredChannelIds: ["ch-ignored"],
    respondToMentions: true,
    botName: "Agy",
    ...overrides,
  };
}

function createSampleAppConfig(
  overrides: Partial<AppConfigData> = {},
): AppConfigData {
  return {
    guildEmojis: {
      "guild-1": { ":wave:": ["wave", "hi"] },
      "guild-2": { ":fire:": ["fire"] },
    },
    guildMembers: {
      "guild-1": [{ username: "alice", name: "Alice", gender: "female" }],
    },
    bots: {
      chatBot: {
        guilds: {
          "guild-1": createGuildConfig({ botName: "ChatAgy" }),
          "guild-2": createGuildConfig({ botName: "ChatAgy2" }),
        },
      },
      policeBot: {
        guilds: {
          "guild-1": createGuildConfig({
            botName: "PoliceAgy",
            moderation: { enabled: true },
          }),
        },
      },
    },
    checkInLeaderboard: "ch-leaderboard",
    aiSafetySettings: {
      safetySettings: [
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      ],
    },
    aiProjectId: "project-123",
    aiModelId: "gemini-3.6-flash",
    aiMaxOutputTokens: 2048,
    aiLocationId: "us-central1",
    aiProvider: "antigravity",
    aiApiEndpoint: "",
    aiMaxConversationHistory: 40,
    memoryStoreType: "directus",
    ...overrides,
  };
}

interface MockAxiosClient {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
}

function createMockClient(): MockAxiosClient {
  return {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({ data: { data: {} } }),
    patch: vi.fn().mockResolvedValue({ data: { data: {} } }),
  };
}

describe("parseCliArgs", () => {
  it("should return default options when no arguments are passed", () => {
    expect(parseCliArgs([])).toEqual({
      force: false,
      dryRun: false,
      help: false,
    });
  });

  it("should parse --config and -c flags with separate and inline values", () => {
    expect(parseCliArgs(["--config", "./custom.json"])).toEqual({
      configPath: "./custom.json",
      force: false,
      dryRun: false,
      help: false,
    });

    expect(parseCliArgs(["-c", "./short.json"])).toEqual({
      configPath: "./short.json",
      force: false,
      dryRun: false,
      help: false,
    });

    expect(parseCliArgs(["--config=./inline.json"])).toEqual({
      configPath: "./inline.json",
      force: false,
      dryRun: false,
      help: false,
    });

    expect(parseCliArgs(["-c=./short-inline.json"])).toEqual({
      configPath: "./short-inline.json",
      force: false,
      dryRun: false,
      help: false,
    });
  });

  it("should parse --force, -f, --dry-run, --help, and -h flags", () => {
    expect(parseCliArgs(["--force", "--dry-run"])).toEqual({
      force: true,
      dryRun: true,
      help: false,
    });

    expect(parseCliArgs(["-f", "-h"])).toEqual({
      force: true,
      dryRun: false,
      help: true,
    });

    expect(parseCliArgs(["--help"])).toEqual({
      force: false,
      dryRun: false,
      help: true,
    });
  });

  it("should throw an error when --config or -c is missing its value", () => {
    expect(() => parseCliArgs(["--config"])).toThrow(
      "Missing file path after --config option.",
    );
    expect(() => parseCliArgs(["-c"])).toThrow(
      "Missing file path after -c option.",
    );
    expect(() => parseCliArgs(["--config", "--force"])).toThrow(
      "Missing file path after --config option.",
    );
    expect(() => parseCliArgs(["-c", "-f"])).toThrow(
      "Missing file path after -c option.",
    );
    expect(() => parseCliArgs(["--config", "   "])).toThrow(
      "Missing file path after --config option.",
    );
    expect(() => parseCliArgs(["--config="])).toThrow(
      "Missing file path after --config option.",
    );
    expect(() => parseCliArgs(["--config=   "])).toThrow(
      "Missing file path after --config option.",
    );
    expect(() => parseCliArgs(["-c="])).toThrow(
      "Missing file path after -c option.",
    );
    expect(() => parseCliArgs(["-c=  \t "])).toThrow(
      "Missing file path after -c option.",
    );
  });

  it("should throw an error for unknown CLI options", () => {
    expect(() => parseCliArgs(["--unknown"])).toThrow(
      "Unknown CLI option: --unknown",
    );
  });
});

describe("resolveDirectusAdminConfig", () => {
  it("should reject invalid Directus URLs", () => {
    expect(() =>
      resolveDirectusAdminConfig({ DIRECTUS_URL: "not-a-valid-url" }),
    ).toThrow('Invalid DIRECTUS_URL: "not-a-valid-url" is not a valid URL.');
  });

  it("should reject non-http(s) Directus URL protocols", () => {
    expect(() =>
      resolveDirectusAdminConfig({ DIRECTUS_URL: "ftp://directus.local:8055" }),
    ).toThrow(
      'Invalid DIRECTUS_URL protocol "ftp:": only http: and https: are allowed.',
    );
    expect(() =>
      resolveDirectusAdminConfig({ DIRECTUS_URL: "file:///etc/passwd" }),
    ).toThrow(
      'Invalid DIRECTUS_URL protocol "file:": only http: and https: are allowed.',
    );
  });

  it("should reject Directus URLs with embedded credentials", () => {
    expect(() =>
      resolveDirectusAdminConfig({
        DIRECTUS_URL: "https://admin:secret@directus.example.com",
      }),
    ).toThrow(
      "Invalid DIRECTUS_URL: embedded username/password credentials in the URL are not allowed.",
    );
  });

  it("should require explicit admin email and password when NODE_ENV is production", () => {
    expect(() =>
      resolveDirectusAdminConfig({
        NODE_ENV: "production",
        DIRECTUS_URL: "https://directus.example.com/",
      }),
    ).toThrow(
      "DIRECTUS_ADMIN_EMAIL and DIRECTUS_ADMIN_PASSWORD must be explicitly configured when NODE_ENV=production.",
    );

    expect(() =>
      resolveDirectusAdminConfig({
        NODE_ENV: "production",
        DIRECTUS_URL: "https://directus.example.com/",
        DIRECTUS_ADMIN_EMAIL: "ops@example.com",
      }),
    ).toThrow(
      "DIRECTUS_ADMIN_EMAIL and DIRECTUS_ADMIN_PASSWORD must be explicitly configured when NODE_ENV=production.",
    );

    expect(
      resolveDirectusAdminConfig({
        NODE_ENV: "production",
        DIRECTUS_URL: "https://directus.example.com/",
        DIRECTUS_ADMIN_EMAIL: "ops@example.com",
        DIRECTUS_ADMIN_PASSWORD: "prod-password-123",
      }),
    ).toEqual({
      directusUrl: "https://directus.example.com",
      adminEmail: "ops@example.com",
      adminPassword: "prod-password-123",
    });
  });
});

describe("migrateConfigToDirectus", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should update bot_system_config and create bot_guild_configs across multiple bots with guild metadata on fresh migration", async () => {
    const client = createMockClient();
    client.get.mockImplementation(async (url: string) => {
      if (url === "/items/bot_system_config") {
        return { data: { data: { id: "sys-1", ai_provider: null } } };
      }
      if (url === "/items/bot_guild_configs?limit=-1") {
        return { data: { data: [] } };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    const appConfig = createSampleAppConfig();
    const summary = await migrateConfigToDirectus({
      client: client as unknown as AxiosInstance,
      appConfig,
    });

    expect(summary).toEqual({
      dryRun: false,
      systemConfig: "updated",
      guilds: {
        created: 3,
        updated: 0,
        skipped: 0,
        total: 3,
      },
    });

    expect(client.patch).toHaveBeenCalledTimes(1);
    expect(client.patch).toHaveBeenCalledWith(
      "/items/bot_system_config",
      expect.objectContaining({
        ai_provider: "antigravity",
        ai_model_id: "gemini-3.6-flash",
        ai_project_id: "project-123",
        memory_store_type: "directus",
        check_in_leaderboard: "ch-leaderboard",
      }),
    );

    expect(client.post).toHaveBeenCalledTimes(3);
    expect(client.post).toHaveBeenNthCalledWith(
      1,
      "/items/bot_guild_configs",
      expect.objectContaining({
        bot_id: "chatBot",
        guild_id: "guild-1",
        bot_name: "ChatAgy",
        guild_emojis: { ":wave:": ["wave", "hi"] },
        guild_members: [{ username: "alice", name: "Alice", gender: "female" }],
      }),
    );
    expect(client.post).toHaveBeenNthCalledWith(
      2,
      "/items/bot_guild_configs",
      expect.objectContaining({
        bot_id: "chatBot",
        guild_id: "guild-2",
        bot_name: "ChatAgy2",
        guild_emojis: { ":fire:": ["fire"] },
      }),
    );
    const secondPostPayload = client.post.mock.calls[1]?.[1] as Record<
      string,
      unknown
    >;
    expect(secondPostPayload.guild_members).toBeUndefined();

    expect(client.post).toHaveBeenNthCalledWith(
      3,
      "/items/bot_guild_configs",
      expect.objectContaining({
        bot_id: "policeBot",
        guild_id: "guild-1",
        bot_name: "PoliceAgy",
        moderation_enabled: true,
        guild_emojis: { ":wave:": ["wave", "hi"] },
        guild_members: [{ username: "alice", name: "Alice", gender: "female" }],
      }),
    );
  });

  it("should be idempotent by default: skip configured system singleton and existing guild rows (including legacy null/empty bot_id) while creating net-new rows", async () => {
    const client = createMockClient();
    client.get.mockImplementation(async (url: string) => {
      if (url === "/items/bot_system_config") {
        return {
          data: { data: [{ id: "sys-1", ai_provider: "google-genai" }] },
        };
      }
      if (url === "/items/bot_guild_configs?limit=-1") {
        return {
          data: {
            data: [
              { id: "row-legacy-null", bot_id: null, guild_id: "guild-1" },
              { id: "row-legacy-empty", bot_id: "", guild_id: "guild-2" },
              { id: "row-police-1", bot_id: "policeBot", guild_id: "guild-1" },
            ],
          },
        };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    const appConfig = createSampleAppConfig({
      bots: {
        chatBot: {
          guilds: {
            "guild-1": createGuildConfig(),
            "guild-2": createGuildConfig(),
          },
        },
        policeBot: {
          guilds: {
            "guild-1": createGuildConfig(),
            "guild-2": createGuildConfig({ botName: "PoliceNew" }),
          },
        },
      },
    });

    const summary = await migrateConfigToDirectus({
      client: client as unknown as AxiosInstance,
      appConfig,
    });

    expect(summary).toEqual({
      dryRun: false,
      systemConfig: "skipped",
      guilds: {
        created: 1,
        updated: 0,
        skipped: 3,
        total: 4,
      },
    });

    expect(client.patch).not.toHaveBeenCalled();
    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.post).toHaveBeenCalledWith(
      "/items/bot_guild_configs",
      expect.objectContaining({
        bot_id: "policeBot",
        guild_id: "guild-2",
        bot_name: "PoliceNew",
      }),
    );
  });

  it("should overwrite existing system and guild rows by id and create missing ones when force=true", async () => {
    const client = createMockClient();
    client.get.mockImplementation(async (url: string) => {
      if (url === "/items/bot_system_config") {
        return {
          data: { data: { id: "sys-1", ai_provider: "google-genai" } },
        };
      }
      if (url === "/items/bot_guild_configs?limit=-1") {
        return {
          data: {
            data: [
              { id: "row-chat-1", bot_id: null, guild_id: "guild-1" },
              { id: "row-police-1", bot_id: "policeBot", guild_id: "guild-1" },
            ],
          },
        };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    const appConfig = createSampleAppConfig();
    const summary = await migrateConfigToDirectus({
      client: client as unknown as AxiosInstance,
      appConfig,
      force: true,
    });

    expect(summary).toEqual({
      dryRun: false,
      systemConfig: "updated",
      guilds: {
        created: 1,
        updated: 2,
        skipped: 0,
        total: 3,
      },
    });

    expect(client.patch).toHaveBeenCalledTimes(3);
    expect(client.patch).toHaveBeenNthCalledWith(
      1,
      "/items/bot_system_config",
      expect.objectContaining({ ai_provider: "antigravity" }),
    );
    expect(client.patch).toHaveBeenNthCalledWith(
      2,
      "/items/bot_guild_configs/row-chat-1",
      expect.objectContaining({
        bot_id: "chatBot",
        guild_id: "guild-1",
        bot_name: "ChatAgy",
      }),
    );
    expect(client.patch).toHaveBeenNthCalledWith(
      3,
      "/items/bot_guild_configs/row-police-1",
      expect.objectContaining({
        bot_id: "policeBot",
        guild_id: "guild-1",
        bot_name: "PoliceAgy",
      }),
    );

    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.post).toHaveBeenCalledWith(
      "/items/bot_guild_configs",
      expect.objectContaining({
        bot_id: "chatBot",
        guild_id: "guild-2",
        bot_name: "ChatAgy2",
      }),
    );
  });

  it("should compute accurate summary counts without issuing POST or PATCH requests when dryRun=true", async () => {
    const client = createMockClient();
    client.get.mockImplementation(async (url: string) => {
      if (url === "/items/bot_system_config") {
        return {
          data: { data: { id: "sys-1", ai_provider: "vertex" } },
        };
      }
      if (url === "/items/bot_guild_configs?limit=-1") {
        return {
          data: {
            data: [{ id: "row-1", bot_id: "chatBot", guild_id: "guild-1" }],
          },
        };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    const appConfig = createSampleAppConfig();

    const idempotentDryRun = await migrateConfigToDirectus({
      client: client as unknown as AxiosInstance,
      appConfig,
      dryRun: true,
      force: false,
    });
    expect(idempotentDryRun).toEqual({
      dryRun: true,
      systemConfig: "skipped",
      guilds: {
        created: 2,
        updated: 0,
        skipped: 1,
        total: 3,
      },
    });

    const forceDryRun = await migrateConfigToDirectus({
      client: client as unknown as AxiosInstance,
      appConfig,
      dryRun: true,
      force: true,
    });
    expect(forceDryRun).toEqual({
      dryRun: true,
      systemConfig: "updated",
      guilds: {
        created: 2,
        updated: 1,
        skipped: 0,
        total: 3,
      },
    });

    expect(client.post).not.toHaveBeenCalled();
    expect(client.patch).not.toHaveBeenCalled();
  });

  it("should ignore unsafe prototype-polluting botId and guildId keys", async () => {
    const client = createMockClient();
    client.get.mockImplementation(async (url: string) => {
      if (url === "/items/bot_system_config") {
        return { data: { data: null } };
      }
      if (url === "/items/bot_guild_configs?limit=-1") {
        return {
          data: {
            data: [
              { id: "bad-1", bot_id: "__proto__", guild_id: "guild-safe" },
              { id: "bad-2", bot_id: "chatBot", guild_id: "constructor" },
            ],
          },
        };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    const unsafeGuilds: Record<string, BotGuildConfig> = {
      "guild-safe": createGuildConfig({ botName: "SafeBot" }),
    };
    for (const unsafeKey of ["__proto__", "constructor", "prototype"]) {
      Object.defineProperty(unsafeGuilds, unsafeKey, {
        value: createGuildConfig({ botName: `Unsafe-${unsafeKey}` }),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }

    const unsafeBots: Record<
      string,
      { guilds: Record<string, BotGuildConfig> }
    > = {
      chatBot: { guilds: unsafeGuilds },
    };
    for (const unsafeKey of ["__proto__", "constructor", "prototype"]) {
      Object.defineProperty(unsafeBots, unsafeKey, {
        value: {
          guilds: {
            "guild-safe": createGuildConfig({
              botName: `UnsafeBot-${unsafeKey}`,
            }),
          },
        },
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }

    const appConfig = createSampleAppConfig({
      bots: unsafeBots as AppConfigData["bots"],
    });

    const summary = await migrateConfigToDirectus({
      client: client as unknown as AxiosInstance,
      appConfig,
    });

    expect(summary).toEqual({
      dryRun: false,
      systemConfig: "updated",
      guilds: {
        created: 1,
        updated: 0,
        skipped: 0,
        total: 1,
      },
    });
    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.post).toHaveBeenCalledWith(
      "/items/bot_guild_configs",
      expect.objectContaining({
        bot_id: "chatBot",
        guild_id: "guild-safe",
        bot_name: "SafeBot",
      }),
    );
    expect(Object.prototype).not.toHaveProperty("bot_name");
  });

  it("should fail closed when an explicit configPath does not exist or is not a regular file", async () => {
    const client = createMockClient();
    const existsSpy = vi.spyOn(fs, "existsSync").mockReturnValue(false);
    const statSpy = vi.spyOn(fs, "statSync");

    await expect(
      migrateConfigToDirectus({
        configPath: "/nonexistent/explicit-config.json",
        client: client as unknown as AxiosInstance,
      }),
    ).rejects.toThrow("Configuration file not found or is not a regular file");

    existsSpy.mockReturnValue(true);
    statSpy.mockReturnValue({ isFile: () => false } as fs.Stats);

    await expect(
      migrateConfigToDirectus({
        configPath: "/some/directory",
        client: client as unknown as AxiosInstance,
      }),
    ).rejects.toThrow("Configuration file not found or is not a regular file");

    await expect(
      migrateConfigToDirectus({
        configPath: "   ",
        client: client as unknown as AxiosInstance,
      }),
    ).rejects.toThrow("Explicit --config path cannot be empty.");

    expect(client.get).not.toHaveBeenCalled();
  });

  it("should sanitize AxiosError instances so request headers and payload secrets are stripped", async () => {
    const axiosErr = new AxiosError(
      "Request failed with status code 401",
      "ERR_BAD_REQUEST",
      {
        headers: {
          Authorization: "Bearer super-secret-admin-token",
        },
        data: JSON.stringify({
          email: "admin@local.dev",
          password: "super-secret-admin-password",
        }),
      } as never,
      {},
      {
        status: 401,
        statusText: "Unauthorized",
        headers: {},
        config: {} as never,
        data: { errors: [{ message: "Invalid credentials" }] },
      },
    );

    const safeDirect = toSafeError(axiosErr);
    expect(safeDirect).toBeInstanceOf(Error);
    expect(safeDirect.message).toBe(
      "HTTP 401: Request failed with status code 401",
    );
    expect(
      (safeDirect as unknown as Record<string, unknown>).config,
    ).toBeUndefined();
    expect(
      (safeDirect as unknown as Record<string, unknown>).response,
    ).toBeUndefined();
    expect(JSON.stringify(safeDirect)).not.toContain(
      "super-secret-admin-token",
    );
    expect(JSON.stringify(safeDirect)).not.toContain(
      "super-secret-admin-password",
    );

    const client = createMockClient();
    client.get.mockRejectedValue(axiosErr);

    let caught: unknown;
    try {
      await migrateConfigToDirectus({
        client: client as unknown as AxiosInstance,
        appConfig: createSampleAppConfig(),
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe(
      "HTTP 401: Request failed with status code 401",
    );
    expect((caught as Record<string, unknown>).config).toBeUndefined();
    expect((caught as Record<string, unknown>).response).toBeUndefined();
  });

  it("should throw on invalid or missing existing.id on --force update and URL-encode special characters in valid ids", async () => {
    const invalidIdClient = createMockClient();
    invalidIdClient.get.mockImplementation(async (url: string) => {
      if (url === "/items/bot_system_config") {
        return { data: { data: { id: "sys-1", ai_provider: null } } };
      }
      if (url === "/items/bot_guild_configs?limit=-1") {
        return {
          data: {
            data: [{ id: "   ", bot_id: "chatBot", guild_id: "guild-1" }],
          },
        };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    await expect(
      migrateConfigToDirectus({
        client: invalidIdClient as unknown as AxiosInstance,
        appConfig: createSampleAppConfig(),
        force: true,
      }),
    ).rejects.toThrow(
      "Invalid or missing Directus record id for bot=chatBot guild=guild-1.",
    );
    expect(invalidIdClient.patch).toHaveBeenCalledTimes(1);

    const encodedIdClient = createMockClient();
    encodedIdClient.get.mockImplementation(async (url: string) => {
      if (url === "/items/bot_system_config") {
        return { data: { data: { id: "sys-1", ai_provider: null } } };
      }
      if (url === "/items/bot_guild_configs?limit=-1") {
        return {
          data: {
            data: [
              {
                id: "row/with spaces?x=1#frag",
                bot_id: "chatBot",
                guild_id: "guild-1",
              },
            ],
          },
        };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    await migrateConfigToDirectus({
      client: encodedIdClient as unknown as AxiosInstance,
      appConfig: createSampleAppConfig({
        bots: {
          chatBot: {
            guilds: {
              "guild-1": createGuildConfig({ botName: "EncodedBot" }),
            },
          },
          policeBot: { guilds: {} },
        },
      }),
      force: true,
    });

    expect(encodedIdClient.patch).toHaveBeenNthCalledWith(
      2,
      "/items/bot_guild_configs/row%2Fwith%20spaces%3Fx%3D1%23frag",
      expect.objectContaining({
        bot_id: "chatBot",
        guild_id: "guild-1",
        bot_name: "EncodedBot",
      }),
    );
  });
});
