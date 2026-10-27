import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AntigravityGenAi } from "../../genAi/providers/antigravity";
import type { GenAi, GenAiConfig } from "../../genAi/types";
import {
  generateChatMessageWithGenAi,
  getGenAi,
  resolveProviderApiKey,
} from ".././genAi";

describe("genAi utils", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("should create GenAi instance with getGenAi", () => {
    const genAi = getGenAi({ apiKey: "test-key" });
    expect(genAi).toBeDefined();
    expect(typeof genAi.generate).toBe("function");
  });

  describe("resolveProviderApiKey", () => {
    it("should return undefined apiKey for antigravity and agy providers", () => {
      expect(resolveProviderApiKey("antigravity")).toBeUndefined();
      expect(resolveProviderApiKey("agy")).toBeUndefined();
      expect(resolveProviderApiKey("ANTIGRAVITY")).toBeUndefined();
    });

    it("should resolve Gemini API keys from GEMINI_API_KEY or AI_API_KEY", () => {
      process.env.GEMINI_API_KEY = "gemini-secret-123";
      expect(resolveProviderApiKey("gemini")).toBe("gemini-secret-123");
      expect(resolveProviderApiKey("google-genai")).toBe("gemini-secret-123");

      delete process.env.GEMINI_API_KEY;
      process.env.AI_API_KEY = "ai-secret-456";
      expect(resolveProviderApiKey("gemini")).toBe("ai-secret-456");
    });

    it("should resolve OpenAI API key from OPENAI_API_KEY", () => {
      process.env.OPENAI_API_KEY = "openai-secret-789";
      expect(resolveProviderApiKey("openai")).toBe("openai-secret-789");
    });

    it("should resolve Anthropic API key from ANTHROPIC_API_KEY", () => {
      process.env.ANTHROPIC_API_KEY = "anthropic-secret-999";
      expect(resolveProviderApiKey("anthropic")).toBe("anthropic-secret-999");
    });

    it("should fallback to Gemini keys for unknown providers or default parameter", () => {
      process.env.GEMINI_API_KEY = "default-gemini-key";
      expect(resolveProviderApiKey()).toBe("default-gemini-key");
      expect(resolveProviderApiKey("other-llm")).toBe("default-gemini-key");
    });
  });

  describe("getGenAi with antigravity provider", () => {
    it("should create AntigravityGenAi instance without requiring apiKey", () => {
      const genAi = getGenAi({ provider: "antigravity" });
      expect(genAi).toBeInstanceOf(AntigravityGenAi);
      const internalConfig = (genAi as unknown as { config: GenAiConfig })
        .config;
      expect(internalConfig.apiKey).toBeUndefined();
      expect(internalConfig.provider).toBe("antigravity");
    });

    it("should pass explicit Antigravity options to GenAiConfig", () => {
      const genAi = getGenAi({
        provider: "antigravity",
        antigravityCommand: "/usr/local/bin/custom-agy",
        antigravityConfigDir: "/custom/agy/config",
        antigravityEffort: "high",
        antigravityTimeoutMs: 60_000,
      });

      const internalConfig = (genAi as unknown as { config: GenAiConfig })
        .config;
      expect(internalConfig.antigravityCommand).toBe(
        "/usr/local/bin/custom-agy",
      );
      expect(internalConfig.antigravityConfigDir).toBe("/custom/agy/config");
      expect(internalConfig.antigravityEffort).toBe("high");
      expect(internalConfig.antigravityTimeoutMs).toBe(60_000);
    });

    it("should fallback to environment variables for Antigravity options when not provided in config", () => {
      process.env.ANTIGRAVITY_COMMAND = "/env/bin/agy";
      process.env.ANTIGRAVITY_CONFIG_DIR = "/env/agy/dir";
      process.env.ANTIGRAVITY_EFFORT = "max";
      process.env.ANTIGRAVITY_TIMEOUT_MS = "45000";

      const genAi = getGenAi({ provider: "antigravity" });
      const internalConfig = (genAi as unknown as { config: GenAiConfig })
        .config;

      expect(internalConfig.antigravityCommand).toBe("/env/bin/agy");
      expect(internalConfig.antigravityConfigDir).toBe("/env/agy/dir");
      expect(internalConfig.antigravityEffort).toBe("max");
      expect(internalConfig.antigravityTimeoutMs).toBe(45_000);
    });

    it("should fallback to AGY_CLI_PATH or ANTIGRAVITY_CLI_PATH when ANTIGRAVITY_COMMAND is unset", () => {
      delete process.env.ANTIGRAVITY_COMMAND;
      process.env.AGY_CLI_PATH = "/env/agy_cli_path";

      const genAi1 = getGenAi({ provider: "antigravity" });
      expect(
        (genAi1 as unknown as { config: GenAiConfig }).config
          .antigravityCommand,
      ).toBe("/env/agy_cli_path");

      delete process.env.AGY_CLI_PATH;
      process.env.ANTIGRAVITY_CLI_PATH = "/env/antigravity_cli_path";

      const genAi2 = getGenAi({ provider: "antigravity" });
      expect(
        (genAi2 as unknown as { config: GenAiConfig }).config
          .antigravityCommand,
      ).toBe("/env/antigravity_cli_path");
    });
  });

  describe("generateChatMessageWithGenAi", () => {
    const mockGenAi: GenAi = {
      init: vi.fn().mockResolvedValue(undefined),
      generate: vi.fn().mockResolvedValue({
        content: "Hello @alice! Nice to meet you.",
        data: null,
      }),
    };

    it("should reject disallowed file types", async () => {
      const result = await generateChatMessageWithGenAi(
        mockGenAi,
        {
          text: "hello",
          files: [
            {
              uri: "http://example.com/file.exe",
              mimeType: "application/x-msdownload",
            },
          ],
        },
        [],
      );

      expect(result.content).toBe("I can't process this file type :(");
    });

    it("should generate message and replace mentions", async () => {
      const result = await generateChatMessageWithGenAi(
        mockGenAi,
        { text: "hello" },
        [{ id: "user-111", username: "alice", nickname: "Alice" }],
      );

      expect(result.content).toBe("Hello <@user-111>! Nice to meet you.");
    });
  });
});
