import { execFile, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ToolDefinition,
  ToolExecutionContext,
} from "../../../tools/types";
import type { AiPrompt, AiPromptResponse } from "../../../types";
import type { GenAiConfig } from "../../types";
import {
  AntigravityGenAi,
  buildFullPromptText,
  buildSanitizedEnvironment,
  buildToolsInstruction,
  cleanOutputContent,
  cleanupTemporaryAttachments,
  DEFAULT_ALLOWED_ATTACHMENT_DIRS,
  DEFAULT_ANTIGRAVITY_MODEL,
  DEFAULT_ANTIGRAVITY_TIMEOUT_MS,
  DEFAULT_FALLBACK_RESPONSE,
  DEFAULT_TOOL_ITERATION_TIMEOUT_MS,
  executeAgyProcess,
  executeSingleTool,
  extractToolCall,
  formatAttachmentDescriptions,
  formatHistory,
  isSafeAttachmentPath,
  isSafeRemoteAttachmentUrl,
  killProcessTree,
  LEGACY_GEMINI_MODEL_MAP,
  MAX_AGY_BUFFER_BYTES,
  MAX_REMOTE_ATTACHMENT_BYTES,
  MAX_TOOL_ITERATIONS,
  type PreparedAttachment,
  parseAgyJsonOutput,
  parseModelAndEffort,
  prepareAttachments,
  redactSensitiveData,
  resolveAgyCommand,
  runToolCallingLoop,
  SENSITIVE_KEY_REGEX,
  STANDARD_SYSTEM_ENV_VARS,
  verifyAgyExecutable,
} from "../antigravity";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

class MockChildProcess extends EventEmitter {
  stdout = Object.assign(new EventEmitter(), {
    destroy: vi.fn(),
  });
  stderr = Object.assign(new EventEmitter(), {
    destroy: vi.fn(),
  });
  stdin = Object.assign(new EventEmitter(), {
    write: vi.fn((_chunk: unknown, enc?: unknown, cb?: unknown) => {
      const callback = typeof enc === "function" ? enc : cb;
      if (typeof callback === "function") callback(null);
      return true;
    }),
    end: vi.fn(),
  });
  killed = false;
  exitCode: number | null = null;
  signalCode: string | null = null;
  kill = vi.fn((signal?: string) => {
    if (signal === "SIGTERM" || signal === "SIGKILL") {
      this.killed = true;
    }
    return true;
  });
}

describe("AntigravityGenAi Provider", () => {
  const baseConfig: GenAiConfig = {
    provider: "antigravity",
    apiEndpoint: "endpoint",
    projectId: "project-1",
    locationId: "us-central1",
    modelId: "gemini-3.8-flash-high",
    maxOutputTokens: 2048,
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe("resolveAgyCommand", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.ANTIGRAVITY_COMMAND;
      delete process.env.AGY_CLI_PATH;
      delete process.env.ANTIGRAVITY_CLI_PATH;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should return configured command when explicitly provided", () => {
      const resolved = resolveAgyCommand("  /opt/custom/agy  ");
      expect(resolved).toBe("/opt/custom/agy");
    });

    it("should return ANTIGRAVITY_COMMAND environment variable when configuredCommand is absent", () => {
      process.env.ANTIGRAVITY_COMMAND = "/env/bin/agy";
      expect(resolveAgyCommand()).toBe("/env/bin/agy");
    });

    it("should return AGY_CLI_PATH environment variable if ANTIGRAVITY_COMMAND is unset", () => {
      process.env.AGY_CLI_PATH = "/agy/bin/agy";
      expect(resolveAgyCommand()).toBe("/agy/bin/agy");
    });

    it("should return ANTIGRAVITY_CLI_PATH environment variable if others are unset", () => {
      process.env.ANTIGRAVITY_CLI_PATH = "/cli/bin/agy";
      expect(resolveAgyCommand()).toBe("/cli/bin/agy");
    });

    it("should prioritize configuredCommand over environment variables", () => {
      process.env.ANTIGRAVITY_COMMAND = "/env/bin/agy";
      expect(resolveAgyCommand("/custom/override/agy")).toBe(
        "/custom/override/agy",
      );
    });

    it("should prioritize ANTIGRAVITY_COMMAND over AGY_CLI_PATH and ANTIGRAVITY_CLI_PATH", () => {
      process.env.ANTIGRAVITY_COMMAND = "/top/agy";
      process.env.AGY_CLI_PATH = "/second/agy";
      process.env.ANTIGRAVITY_CLI_PATH = "/third/agy";
      expect(resolveAgyCommand()).toBe("/top/agy");
    });

    it("should return first candidate from default locations if it exists on disk", () => {
      const existsSpy = vi.spyOn(fs, "existsSync").mockImplementation((p) => {
        return typeof p === "string" && p.includes(".local/bin/agy");
      });

      const resolved = resolveAgyCommand();
      expect(resolved).toContain(".local/bin/agy");
      existsSpy.mockRestore();
    });

    it("should return second candidate from default locations if first does not exist", () => {
      const existsSpy = vi.spyOn(fs, "existsSync").mockImplementation((p) => {
        return (
          typeof p === "string" && p.includes(".gemini/antigravity-cli/bin/agy")
        );
      });

      const resolved = resolveAgyCommand();
      expect(resolved).toContain(".gemini/antigravity-cli/bin/agy");
      existsSpy.mockRestore();
    });

    it("should fallback to 'agy' when neither env nor candidate files exist", () => {
      const existsSpy = vi.spyOn(fs, "existsSync").mockReturnValue(false);
      expect(resolveAgyCommand()).toBe("agy");
      existsSpy.mockRestore();
    });
  });

  describe("verifyAgyExecutable", () => {
    it("should resolve with stdout when binary executes --version successfully", async () => {
      vi.mocked(execFile).mockImplementation(
        (
          _cmd: string,
          _args: readonly string[] | null | undefined,
          _opts: unknown,
          cb: unknown,
        ) => {
          const callback = typeof _opts === "function" ? _opts : cb;
          if (typeof callback === "function") {
            callback(null, "agy version 1.4.2\n", "");
          }
          return {} as ReturnType<typeof execFile>;
        },
      );

      const version = await verifyAgyExecutable("agy");
      expect(version).toBe("agy version 1.4.2");
      expect(execFile).toHaveBeenCalledWith(
        "agy",
        ["--version"],
        { timeout: 10_000 },
        expect.any(Function),
      );
    });

    it("should reject when binary is not executable or fails", async () => {
      vi.mocked(execFile).mockImplementation(
        (
          _cmd: string,
          _args: readonly string[] | null | undefined,
          _opts: unknown,
          cb: unknown,
        ) => {
          const callback = typeof _opts === "function" ? _opts : cb;
          if (typeof callback === "function") {
            callback(
              new Error("Command failed: agy --version (ENOENT)"),
              "",
              "",
            );
          }
          return {} as ReturnType<typeof execFile>;
        },
      );

      await expect(verifyAgyExecutable("/invalid/path/agy")).rejects.toThrow(
        "ENOENT",
      );
    });
  });

  describe("parseModelAndEffort", () => {
    it("should extract base model and effort from modelId with suffix", () => {
      const result = parseModelAndEffort("gemini-3.8-flash-high");
      expect(result.model).toBe("gemini-3.8-flash");
      expect(result.effort).toBe("high");
    });

    it("should support low, medium, xhigh, and max effort suffixes case-insensitively", () => {
      const low = parseModelAndEffort("gemini-3.8-flash-LOW");
      expect(low.model).toBe("gemini-3.8-flash");
      expect(low.effort).toBe("low");

      const med = parseModelAndEffort("gemini-4-argon-MEDIUM");
      expect(med.model).toBe("gemini-4-argon");
      expect(med.effort).toBe("medium");

      const xhigh = parseModelAndEffort("claude-sonnet-5-5-xhigh");
      expect(xhigh.model).toBe("claude-sonnet-5-5");
      expect(xhigh.effort).toBe("xhigh");

      const max = parseModelAndEffort("gpt-oss-120b-MAX");
      expect(max.model).toBe("gpt-oss-120b");
      expect(max.effort).toBe("max");
    });

    it("should keep model as-is when no effort suffix is present", () => {
      const result = parseModelAndEffort("gemini-3.8-flash");
      expect(result.model).toBe("gemini-3.8-flash");
      expect(result.effort).toBeUndefined();
    });

    it("should allow configured effort to override parsed suffix", () => {
      const result = parseModelAndEffort("gemini-3.8-flash-low", "max");
      expect(result.model).toBe("gemini-3.8-flash");
      expect(result.effort).toBe("max");
    });

    it("should use DEFAULT_ANTIGRAVITY_MODEL when modelId is empty or undefined", () => {
      expect(parseModelAndEffort("").model).toBe(DEFAULT_ANTIGRAVITY_MODEL);
      expect(parseModelAndEffort(undefined).model).toBe(
        DEFAULT_ANTIGRAVITY_MODEL,
      );
    });

    it("should map legacy or standard Gemini models to Antigravity models", () => {
      const flash = parseModelAndEffort("gemini-3-flash-preview");
      expect(flash.model).toBe("gemini-3.8-flash");
      expect(flash.effort).toBe("low");

      const classifier = parseModelAndEffort("gemini-2.5-flash");
      expect(classifier.model).toBe("gemini-3.8-flash");
      expect(classifier.effort).toBe("low");

      const lite = parseModelAndEffort("gemini-3.5-flash-lite");
      expect(lite.model).toBe("gemini-3.8-flash");
      expect(lite.effort).toBe("low");

      const pro = parseModelAndEffort("gemini-1.5-pro");
      expect(pro.model).toBe("gemini-4-argon");
      expect(pro.effort).toBe("medium");

      const withEffort = parseModelAndEffort("gemini-2.5-flash-high");
      expect(withEffort.model).toBe("gemini-3.8-flash");
      expect(withEffort.effort).toBe("high");
    });

    it("should export correct default constants and allowed attachment paths", () => {
      expect(DEFAULT_ANTIGRAVITY_TIMEOUT_MS).toBe(120_000);
      expect(DEFAULT_TOOL_ITERATION_TIMEOUT_MS).toBe(30_000);
      expect(DEFAULT_ALLOWED_ATTACHMENT_DIRS).toContain(os.tmpdir());
      expect(STANDARD_SYSTEM_ENV_VARS.has("PATH")).toBe(true);
      expect(STANDARD_SYSTEM_ENV_VARS.has("HOME")).toBe(true);
      expect(STANDARD_SYSTEM_ENV_VARS.has("ANTIGRAVITY_CONFIG_DIR")).toBe(true);
    });
  });

  describe("buildSanitizedEnvironment", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = {
        ...originalEnv,
        PATH: "/usr/bin:/bin",
        HOME: "/home/user",
        USER: "testuser",
        LOGNAME: "testuser",
        TMPDIR: "/tmp",
        TMP: "/tmp",
        TEMP: "/tmp",
        SHELL: "/bin/bash",
        LANG: "en_US.UTF-8",
        LC_ALL: "en_US.UTF-8",
        NODE_ENV: "test",
        ANTIGRAVITY_CONFIG_DIR: "/default/config",
        // Sensitive credentials matching each pattern:
        DISCORD_TOKEN: "secret-token",
        MY_BOT_TOKEN: "secret-bot-token",
        BEARER_TOKEN: "secret-bearer",
        AUTH_TOKEN: "secret-auth-token",
        SESSION_SECRET: "secret-session",
        JWT_SECRET: "secret-jwt",
        CLIENT_SECRET: "secret-client",
        DATABASE_PASSWORD: "secret-password",
        ADMIN_PASSWORD: "secret-admin-pass",
        GEMINI_API_KEY: "secret-gemini-key",
        OPENAI_API_KEY: "secret-openai-key",
        AI_API_KEY: "secret-ai-key",
        CUSTOM_API_KEY: "secret-custom-key",
        AUTHORIZATION_HEADER: "Bearer xyz",
        OAUTH_CREDENTIALS: "secret-oauth",
        GOOGLE_APPLICATION_CREDENTIALS: "/secret/credentials.json",
        SSH_PRIVATE_KEY: "secret-private-key",
        RSA_PRIVATE: "secret-rsa-private",
        // Safe custom application variables:
        CUSTOM_APP_NAME: "DiscordBotApp",
        FEATURE_ALPHA_ENABLED: "true",
      };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should preserve all system variables in the strict allowlist", () => {
      const sanitized = buildSanitizedEnvironment();
      expect(sanitized.PATH).toBe("/usr/bin:/bin");
      expect(sanitized.HOME).toBe("/home/user");
      expect(sanitized.USER).toBe("testuser");
      expect(sanitized.LOGNAME).toBe("testuser");
      expect(sanitized.TMPDIR).toBe("/tmp");
      expect(sanitized.TMP).toBe("/tmp");
      expect(sanitized.TEMP).toBe("/tmp");
      expect(sanitized.SHELL).toBe("/bin/bash");
      expect(sanitized.LANG).toBe("en_US.UTF-8");
      expect(sanitized.LC_ALL).toBe("en_US.UTF-8");
      expect(sanitized.NODE_ENV).toBe("test");
      expect(sanitized.ANTIGRAVITY_CONFIG_DIR).toBe("/default/config");
    });

    it("should strictly exclude non-allowlisted credentials, database URLs, and application variables by default", () => {
      process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";
      process.env.REDIS_URL = "redis://:secret@localhost:6379";
      const sanitized = buildSanitizedEnvironment();
      expect(sanitized.DISCORD_TOKEN).toBeUndefined();
      expect(sanitized.MY_BOT_TOKEN).toBeUndefined();
      expect(sanitized.BEARER_TOKEN).toBeUndefined();
      expect(sanitized.AUTH_TOKEN).toBeUndefined();
      expect(sanitized.SESSION_SECRET).toBeUndefined();
      expect(sanitized.JWT_SECRET).toBeUndefined();
      expect(sanitized.CLIENT_SECRET).toBeUndefined();
      expect(sanitized.DATABASE_PASSWORD).toBeUndefined();
      expect(sanitized.ADMIN_PASSWORD).toBeUndefined();
      expect(sanitized.GEMINI_API_KEY).toBeUndefined();
      expect(sanitized.OPENAI_API_KEY).toBeUndefined();
      expect(sanitized.AI_API_KEY).toBeUndefined();
      expect(sanitized.CUSTOM_API_KEY).toBeUndefined();
      expect(sanitized.AUTHORIZATION_HEADER).toBeUndefined();
      expect(sanitized.OAUTH_CREDENTIALS).toBeUndefined();
      expect(sanitized.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
      expect(sanitized.SSH_PRIVATE_KEY).toBeUndefined();
      expect(sanitized.RSA_PRIVATE).toBeUndefined();
      expect(sanitized.DATABASE_URL).toBeUndefined();
      expect(sanitized.REDIS_URL).toBeUndefined();
      expect(sanitized.CUSTOM_APP_NAME).toBeUndefined();
      expect(sanitized.FEATURE_ALPHA_ENABLED).toBeUndefined();
    });

    it("should allow passing specific variables via ANTIGRAVITY_ENV_ALLOWLIST or extraAllowlist", () => {
      process.env.ANTIGRAVITY_ENV_ALLOWLIST =
        "CUSTOM_APP_NAME,FEATURE_ALPHA_ENABLED";
      const sanitized = buildSanitizedEnvironment();
      expect(sanitized.CUSTOM_APP_NAME).toBe("DiscordBotApp");
      expect(sanitized.FEATURE_ALPHA_ENABLED).toBe("true");

      process.env.CUSTOM_OPTIONAL_VAR = "extra_value";
      const withExtra = buildSanitizedEnvironment(undefined, [
        "CUSTOM_OPTIONAL_VAR",
      ]);
      expect(withExtra.CUSTOM_OPTIONAL_VAR).toBe("extra_value");
    });

    it("should support ANTIGRAVITY_ENV_PASSTHROUGH alias for allowlisted variables", () => {
      delete process.env.ANTIGRAVITY_ENV_ALLOWLIST;
      process.env.ANTIGRAVITY_ENV_PASSTHROUGH = "CUSTOM_APP_NAME";
      const sanitized = buildSanitizedEnvironment();
      expect(sanitized.CUSTOM_APP_NAME).toBe("DiscordBotApp");
      expect(sanitized.FEATURE_ALPHA_ENABLED).toBeUndefined();
    });

    it("should set custom ANTIGRAVITY_CONFIG_DIR override when specified", () => {
      const sanitized = buildSanitizedEnvironment("/custom/config/dir");
      expect(sanitized.ANTIGRAVITY_CONFIG_DIR).toBe("/custom/config/dir");
    });
  });

  describe("parseAgyJsonOutput", () => {
    it("should parse well-formed agy JSON output with status SUCCESS", () => {
      const raw = JSON.stringify({
        conversation_id: "conv-123",
        status: "SUCCESS",
        response: "Hello from Antigravity!",
      });

      const parsed = parseAgyJsonOutput(raw);
      expect(parsed.status).toBe("SUCCESS");
      expect(parsed.response).toBe("Hello from Antigravity!");
      expect(parsed.conversation_id).toBe("conv-123");
    });

    it("should extract embedded JSON substring when surrounded by log lines", () => {
      const raw = `[INFO] Initializing agy CLI\n[DEBUG] Connecting session\n{"status":"SUCCESS","response":"Extracted response"}\n[INFO] Complete`;
      const parsed = parseAgyJsonOutput(raw);
      expect(parsed.status).toBe("SUCCESS");
      expect(parsed.response).toBe("Extracted response");
    });

    it("should throw error when agy status is ERROR with error field", () => {
      const raw = JSON.stringify({
        status: "ERROR",
        error: "Google One subscription authentication expired",
      });

      expect(() => parseAgyJsonOutput(raw)).toThrow(
        "Antigravity CLI returned unsuccessful status 'ERROR': Google One subscription authentication expired",
      );
    });

    it("should throw error when agy status is FAILED with response field", () => {
      const raw = JSON.stringify({
        status: "FAILED",
        response: "Rate limit reached",
      });

      expect(() => parseAgyJsonOutput(raw)).toThrow(
        "Antigravity CLI returned unsuccessful status 'FAILED': Rate limit reached",
      );
    });

    it("should throw error when status is unsuccessful without error or response fields", () => {
      const raw = JSON.stringify({
        status: "UNAUTHORIZED",
      });

      expect(() => parseAgyJsonOutput(raw)).toThrow(
        "Antigravity CLI returned unsuccessful status 'UNAUTHORIZED': No error details",
      );
    });

    it("should throw error for completely non-JSON output", () => {
      expect(() =>
        parseAgyJsonOutput("plain non-json text without braces"),
      ).toThrow(
        "Failed to parse agy JSON output: plain non-json text without braces",
      );
    });

    it("should throw error for empty or whitespace-only stdout", () => {
      expect(() => parseAgyJsonOutput("")).toThrow(
        "Failed to parse agy JSON output: ",
      );
      expect(() => parseAgyJsonOutput("   \n\t  ")).toThrow(
        "Failed to parse agy JSON output: ",
      );
    });

    it("should throw error for truncated JSON output", () => {
      expect(() =>
        parseAgyJsonOutput(
          '{"status": "SUCCESS", "response": "Incomplete string',
        ),
      ).toThrow();
    });
  });

  describe("executeAgyProcess", () => {
    const defaultOptions = {
      command: "agy",
      model: "gemini-3.8-flash",
      effort: "high",
      promptText: "Explain quantum computing briefly",
    };

    it("should execute agy process, pipe stdin, and resolve parsed JSON on exit code 0", async () => {
      const mockProc = new MockChildProcess();
      vi.mocked(spawn).mockImplementationOnce(() => {
        queueMicrotask(() => {
          mockProc.stdout.emit(
            "data",
            Buffer.from(
              JSON.stringify({
                status: "SUCCESS",
                response: "Quantum computing uses qubits.",
              }),
            ),
          );
          mockProc.emit("close", 0);
        });
        return mockProc as unknown as ReturnType<typeof spawn>;
      });

      const result = await executeAgyProcess(defaultOptions);
      expect(result.status).toBe("SUCCESS");
      expect(result.response).toBe("Quantum computing uses qubits.");

      expect(spawn).toHaveBeenCalledWith(
        "agy",
        [
          "--output-format",
          "json",
          "--disable-slash-commands",
          "--model",
          "gemini-3.8-flash",
          "--effort",
          "high",
        ],
        expect.objectContaining({
          stdio: ["pipe", "pipe", "pipe"],
          env: expect.any(Object),
        }),
      );
      expect(mockProc.stdin.write).toHaveBeenCalledWith(
        "Explain quantum computing briefly",
        "utf-8",
        expect.any(Function),
      );
      expect(mockProc.stdin.end).toHaveBeenCalled();
    });

    it("should reject with exit code and stderr when process exits with non-zero code", async () => {
      const mockProc = new MockChildProcess();
      vi.mocked(spawn).mockImplementationOnce(() => {
        queueMicrotask(() => {
          mockProc.stderr.emit(
            "data",
            Buffer.from("Error: Authentication token missing"),
          );
          mockProc.emit("close", 1);
        });
        return mockProc as unknown as ReturnType<typeof spawn>;
      });

      await expect(executeAgyProcess(defaultOptions)).rejects.toThrow(
        "Google Antigravity CLI exited with code 1: Error: Authentication token missing",
      );
    });

    it("should fallback to stdout in error message when stderr is empty on non-zero exit code", async () => {
      const mockProc = new MockChildProcess();
      vi.mocked(spawn).mockImplementationOnce(() => {
        queueMicrotask(() => {
          mockProc.stdout.emit(
            "data",
            Buffer.from("Syntax error in parameters"),
          );
          mockProc.emit("close", 2);
        });
        return mockProc as unknown as ReturnType<typeof spawn>;
      });

      await expect(executeAgyProcess(defaultOptions)).rejects.toThrow(
        "Google Antigravity CLI exited with code 2: Syntax error in parameters",
      );
    });

    it("should reject when spawn emits an error event", async () => {
      const mockProc = new MockChildProcess();
      vi.mocked(spawn).mockImplementationOnce(() => {
        queueMicrotask(() => {
          mockProc.emit("error", new Error("spawn agy ENOENT"));
        });
        return mockProc as unknown as ReturnType<typeof spawn>;
      });

      await expect(executeAgyProcess(defaultOptions)).rejects.toThrow(
        "spawn agy ENOENT",
      );
    });

    it("should reject when stdin write fails", async () => {
      const mockProc = new MockChildProcess();
      mockProc.stdin.write = vi.fn((_chunk, enc, cb) => {
        const callback = typeof enc === "function" ? enc : cb;
        if (typeof callback === "function") {
          callback(new Error("EPIPE: Broken pipe writing to stdin"));
        }
        return false;
      });

      vi.mocked(spawn).mockImplementationOnce(() => {
        return mockProc as unknown as ReturnType<typeof spawn>;
      });

      await expect(executeAgyProcess(defaultOptions)).rejects.toThrow(
        "EPIPE: Broken pipe writing to stdin",
      );
    });

    it("should timeout, send SIGTERM, and escalate to SIGKILL if process hangs", async () => {
      vi.useFakeTimers();
      const mockProc = new MockChildProcess();
      // Keep killed as false initially so SIGKILL branch can be triggered
      mockProc.killed = false;
      mockProc.kill = vi.fn().mockReturnValue(true);

      vi.mocked(spawn).mockImplementationOnce(() => {
        return mockProc as unknown as ReturnType<typeof spawn>;
      });

      const executePromise = executeAgyProcess({
        ...defaultOptions,
        timeoutMs: 3000,
      });

      const rejectionAssertion = expect(executePromise).rejects.toThrow(
        "Google Antigravity CLI ('agy') timed out after 3000ms",
      );

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(3001);
      await rejectionAssertion;

      expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM");

      // Advance 2000ms grace period for SIGKILL
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockProc.kill).toHaveBeenCalledWith("SIGKILL");

      vi.useRealTimers();
    });

    it("should reject when exit code is 0 but output is malformed JSON", async () => {
      const mockProc = new MockChildProcess();
      vi.mocked(spawn).mockImplementationOnce(() => {
        queueMicrotask(() => {
          mockProc.stdout.emit(
            "data",
            Buffer.from("Unparseable corrupt stream"),
          );
          mockProc.emit("close", 0);
        });
        return mockProc as unknown as ReturnType<typeof spawn>;
      });

      await expect(executeAgyProcess(defaultOptions)).rejects.toThrow(
        "Failed to parse agy JSON output",
      );
    });

    it("should catch and reject on stdin error event to prevent unhandled stream crash", async () => {
      const mockProc = new MockChildProcess();
      vi.mocked(spawn).mockImplementationOnce(() => {
        queueMicrotask(() => {
          mockProc.stdin.emit(
            "error",
            new Error("EPIPE: stream was destroyed"),
          );
        });
        return mockProc as unknown as ReturnType<typeof spawn>;
      });

      await expect(executeAgyProcess(defaultOptions)).rejects.toThrow(
        "EPIPE: stream was destroyed",
      );
    });

    it("should enforce MAX_AGY_BUFFER_BYTES DoS guard and kill process when output exceeds limit", async () => {
      const mockProc = new MockChildProcess();
      vi.mocked(spawn).mockImplementationOnce(() => {
        queueMicrotask(() => {
          const overflowChunk = "x".repeat(MAX_AGY_BUFFER_BYTES + 100);
          mockProc.stdout.emit("data", Buffer.from(overflowChunk));
        });
        return mockProc as unknown as ReturnType<typeof spawn>;
      });

      await expect(executeAgyProcess(defaultOptions)).rejects.toThrow(
        `exceeded maximum buffer output limit of ${MAX_AGY_BUFFER_BYTES} bytes`,
      );
      expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM");
      expect(mockProc.stdout.destroy).toHaveBeenCalled();
      expect(mockProc.stderr.destroy).toHaveBeenCalled();
    });

    it("should ignore incoming stdout/stderr chunks after settled is true", async () => {
      const mockProc = new MockChildProcess();
      vi.mocked(spawn).mockImplementationOnce(() => {
        queueMicrotask(() => {
          mockProc.stdout.emit(
            "data",
            Buffer.from(
              JSON.stringify({ status: "SUCCESS", response: "Initial ok" }),
            ),
          );
          mockProc.emit("close", 0);
          // Trailing chunks emitted after process closed and settled
          mockProc.stdout.emit("data", Buffer.from("trailing data"));
          mockProc.stderr.emit("data", Buffer.from("trailing error"));
        });
        return mockProc as unknown as ReturnType<typeof spawn>;
      });

      const res = await executeAgyProcess(defaultOptions);
      expect(res.response).toBe("Initial ok");
    });
  });

  describe("killProcessTree", () => {
    it("should send SIGTERM and schedule SIGKILL if process does not exit", () => {
      vi.useFakeTimers();
      const mockProc = new MockChildProcess();
      mockProc.killed = false;
      mockProc.exitCode = null;
      mockProc.signalCode = null;
      mockProc.kill = vi.fn().mockReturnValue(true);

      killProcessTree(mockProc as unknown as ReturnType<typeof spawn>);
      expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM");

      vi.advanceTimersByTime(2000);
      expect(mockProc.kill).toHaveBeenCalledWith("SIGKILL");

      vi.useRealTimers();
    });

    it("should not send SIGKILL if process exits before timer fires", () => {
      vi.useFakeTimers();
      const mockProc = new MockChildProcess();
      mockProc.killed = true;
      mockProc.exitCode = 0;
      mockProc.kill = vi.fn().mockReturnValue(true);

      killProcessTree(mockProc as unknown as ReturnType<typeof spawn>);
      expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM");

      vi.advanceTimersByTime(2000);
      expect(mockProc.kill).not.toHaveBeenCalledWith("SIGKILL");

      vi.useRealTimers();
    });
  });

  describe("prepareAttachments & cleanupTemporaryAttachments", () => {
    it("should return empty array when files is empty or undefined", async () => {
      expect(await prepareAttachments([])).toEqual([]);
      expect(await prepareAttachments(undefined)).toEqual([]);
    });

    it("should ignore unsupported non-image mime types", async () => {
      const result = await prepareAttachments([
        { uri: "https://example.com/doc.pdf", mimeType: "application/pdf" },
        { uri: "https://example.com/note.txt", mimeType: "text/plain" },
        { uri: "https://example.com/video.mp4", mimeType: "video/mp4" },
      ]);

      expect(result).toEqual([]);
      expect(axios.get).not.toHaveBeenCalled();
    });

    it("should download HTTP/HTTPS images and create temporary files with appropriate extensions", async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: Buffer.from("mock-binary-image-data"),
      });

      const attachments = await prepareAttachments([
        { uri: "https://example.com/photo.png", mimeType: "image/png" },
        { uri: "https://example.com/picture.jpeg", mimeType: "image/jpeg" },
        { uri: "https://example.com/graphic.webp", mimeType: "image/webp" },
        { uri: "https://example.com/anim.gif", mimeType: "image/gif" },
        { uri: "https://example.com/drawing.bmp", mimeType: "image/bmp" },
      ]);

      expect(attachments).toHaveLength(5);
      expect(attachments[0].mimeType).toBe("image/png");
      expect(attachments[0].isTemporary).toBe(true);
      expect(attachments[0].localPath.endsWith(".png")).toBe(true);
      expect(attachments[1].localPath.endsWith(".jpg")).toBe(true);
      expect(attachments[2].localPath.endsWith(".webp")).toBe(true);
      expect(attachments[3].localPath.endsWith(".gif")).toBe(true);
      expect(attachments[4].localPath.endsWith(".png")).toBe(true);

      // Verify files were actually written to disk
      for (const att of attachments) {
        expect(fs.existsSync(att.localPath)).toBe(true);
      }

      // Cleanup and verify deletion
      await cleanupTemporaryAttachments(attachments);
      for (const att of attachments) {
        expect(fs.existsSync(att.localPath)).toBe(false);
      }
    });

    it("should throw error and fail when image download fails", async () => {
      vi.mocked(axios.get).mockRejectedValueOnce(
        new Error("Network Error: 404 Not Found"),
      );

      await expect(
        prepareAttachments([
          { uri: "https://example.com/missing.png", mimeType: "image/png" },
        ]),
      ).rejects.toThrow("404 Not Found");
    });

    it("should decode base64 data URIs and create temporary files", async () => {
      const base64Data = Buffer.from("fake-png-pixels").toString("base64");
      const dataUri = `data:image/png;base64,${base64Data}`;

      const attachments = await prepareAttachments([
        { uri: dataUri, mimeType: "image/png" },
      ]);

      expect(attachments).toHaveLength(1);
      expect(attachments[0].isTemporary).toBe(true);
      expect(attachments[0].mimeType).toBe("image/png");
      expect(fs.existsSync(attachments[0].localPath)).toBe(true);

      await cleanupTemporaryAttachments(attachments);
      expect(fs.existsSync(attachments[0].localPath)).toBe(false);
    });

    it("should preserve existing local files as isTemporary: false without deleting them on cleanup", async () => {
      const tempLocal = path.join(os.tmpdir(), `test-local-${Date.now()}.png`);
      fs.writeFileSync(tempLocal, "fake-png-content");

      const attachments = await prepareAttachments([
        { uri: tempLocal, mimeType: "image/png" },
        { uri: "/non/existent/local.png", mimeType: "image/png" },
      ]);

      expect(attachments).toHaveLength(1);
      expect(attachments[0].localPath).toBe(tempLocal);
      expect(attachments[0].isTemporary).toBe(false);

      await cleanupTemporaryAttachments(attachments);
      expect(fs.existsSync(tempLocal)).toBe(true);
      fs.unlinkSync(tempLocal);
    });

    it("should gracefully handle unlink errors when cleaning temporary attachments", async () => {
      await expect(
        cleanupTemporaryAttachments([
          {
            localPath: "/already/deleted/temp-file.png",
            mimeType: "image/png",
            isTemporary: true,
          },
        ]),
      ).resolves.toBeUndefined();
    });

    it("should reject local attachment files outside allowed safe directories", async () => {
      const outsideFile = path.join(os.homedir(), "unauthorized-secret.png");
      const existsSpy = vi.spyOn(fs, "existsSync").mockReturnValue(true);

      const attachments = await prepareAttachments([
        { uri: outsideFile, mimeType: "image/png" },
        { uri: "/etc/shadow.png", mimeType: "image/png" },
      ]);

      expect(attachments).toEqual([]);
      existsSpy.mockRestore();
    });

    it("should reject path traversal attempts attempting to escape allowed directories", async () => {
      const traversalPath = path.join(os.tmpdir(), "..", "etc", "passwd.png");
      const attachments = await prepareAttachments([
        { uri: traversalPath, mimeType: "image/png" },
      ]);
      expect(attachments).toEqual([]);
    });

    it("should allow files in custom allowed directories", async () => {
      const customDir = path.join(os.tmpdir(), `custom-safe-${Date.now()}`);
      const safeFile = path.join(customDir, "image.png");
      if (!fs.existsSync(customDir)) {
        fs.mkdirSync(customDir, { recursive: true });
      }
      fs.writeFileSync(safeFile, "fake-png");

      const attachments = await prepareAttachments(
        [{ uri: safeFile, mimeType: "image/png" }],
        [customDir],
      );

      expect(attachments).toHaveLength(1);
      expect(attachments[0].localPath).toBe(safeFile);

      fs.unlinkSync(safeFile);
      fs.rmdirSync(customDir);
    });

    it("should pass maxContentLength and maxBodyLength size limit options to axios.get", async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: Buffer.from("image-bytes"),
      });

      const attachments = await prepareAttachments([
        { uri: "https://example.com/large-photo.png", mimeType: "image/png" },
      ]);

      expect(axios.get).toHaveBeenCalledWith(
        "https://example.com/large-photo.png",
        expect.objectContaining({
          responseType: "arraybuffer",
          timeout: 15_000,
          maxContentLength: MAX_REMOTE_ATTACHMENT_BYTES,
          maxBodyLength: MAX_REMOTE_ATTACHMENT_BYTES,
        }),
      );

      await cleanupTemporaryAttachments(attachments);
    });

    it("should return false for invalid or empty file paths in isSafeAttachmentPath", () => {
      expect(isSafeAttachmentPath("")).toBe(false);
      expect(isSafeAttachmentPath(undefined as unknown as string)).toBe(false);
    });

    it("should reject symlinks residing in allowed directory that point outside allowed directory (symlink bypass guard)", () => {
      const allowedDir = path.join(os.tmpdir(), `safe-dir-${Date.now()}`);
      const outsideDir = path.join(os.tmpdir(), `outside-dir-${Date.now()}`);
      fs.mkdirSync(allowedDir, { recursive: true });
      fs.mkdirSync(outsideDir, { recursive: true });

      const targetFile = path.join(outsideDir, "secret-outside.png");
      fs.writeFileSync(targetFile, "secret outside content");

      const symlinkFile = path.join(allowedDir, "malicious-symlink.png");
      try {
        fs.symlinkSync(targetFile, symlinkFile);
        expect(isSafeAttachmentPath(symlinkFile, [allowedDir])).toBe(false);
      } finally {
        if (fs.existsSync(symlinkFile)) fs.unlinkSync(symlinkFile);
        if (fs.existsSync(targetFile)) fs.unlinkSync(targetFile);
        if (fs.existsSync(allowedDir)) fs.rmdirSync(allowedDir);
        if (fs.existsSync(outsideDir)) fs.rmdirSync(outsideDir);
      }
    });

    it("should allow safe symlinks residing inside allowed directory that point inside allowed directory", () => {
      const allowedDir = path.join(os.tmpdir(), `safe-dir-valid-${Date.now()}`);
      fs.mkdirSync(allowedDir, { recursive: true });

      const targetFile = path.join(allowedDir, "real-image.png");
      fs.writeFileSync(targetFile, "real image content");

      const symlinkFile = path.join(allowedDir, "valid-symlink.png");
      try {
        fs.symlinkSync(targetFile, symlinkFile);
        expect(isSafeAttachmentPath(symlinkFile, [allowedDir])).toBe(true);
      } finally {
        if (fs.existsSync(symlinkFile)) fs.unlinkSync(symlinkFile);
        if (fs.existsSync(targetFile)) fs.unlinkSync(targetFile);
        if (fs.existsSync(allowedDir)) fs.rmdirSync(allowedDir);
      }
    });

    it("should clean up already downloaded temporary files if a subsequent attachment download fails mid-loop", async () => {
      let createdTempPath = "";
      const originalWriteFile = fs.promises.writeFile;
      const writeFileSpy = vi
        .spyOn(fs.promises, "writeFile")
        .mockImplementation(async (targetPath, data) => {
          createdTempPath = targetPath as string;
          return originalWriteFile(targetPath, data);
        });

      vi.mocked(axios.get)
        .mockResolvedValueOnce({ data: Buffer.from("first-image") })
        .mockRejectedValueOnce(new Error("Second image download failed"));

      await expect(
        prepareAttachments([
          { uri: "https://example.com/first.png", mimeType: "image/png" },
          { uri: "https://example.com/second.png", mimeType: "image/png" },
        ]),
      ).rejects.toThrow("Second image download failed");

      writeFileSpy.mockRestore();

      // Verify that the first downloaded file was cleaned up on error
      if (createdTempPath) {
        expect(fs.existsSync(createdTempPath)).toBe(false);
      }
    });

    it("should validate remote attachment URLs for SSRF safety", () => {
      expect(
        isSafeRemoteAttachmentUrl(
          "https://cdn.discordapp.com/attachments/123/photo.png",
        ),
      ).toBe(true);
      expect(isSafeRemoteAttachmentUrl("http://example.com/pic.jpg")).toBe(
        true,
      );
      expect(isSafeRemoteAttachmentUrl("http://localhost:3001/private")).toBe(
        false,
      );
      expect(isSafeRemoteAttachmentUrl("http://127.0.0.1:8080/")).toBe(false);
      expect(
        isSafeRemoteAttachmentUrl("http://169.254.169.254/latest/meta-data"),
      ).toBe(false);
      expect(isSafeRemoteAttachmentUrl("http://10.0.0.1/admin")).toBe(false);
      expect(isSafeRemoteAttachmentUrl("http://192.168.1.1/router")).toBe(
        false,
      );
      expect(isSafeRemoteAttachmentUrl("http://172.16.0.1/internal")).toBe(
        false,
      );
      expect(isSafeRemoteAttachmentUrl("http://[::1]/")).toBe(false);
      expect(isSafeRemoteAttachmentUrl("ftp://example.com/photo.png")).toBe(
        false,
      );
      expect(isSafeRemoteAttachmentUrl("not-a-valid-url")).toBe(false);
    });

    it("should reject SSRF unsafe remote URLs when preparing attachments", async () => {
      await expect(
        prepareAttachments([
          {
            uri: "http://169.254.169.254/latest/meta-data",
            mimeType: "image/png",
          },
        ]),
      ).rejects.toThrow(/SSRF safety/);
    });
  });

  describe("extractToolCall", () => {
    it("should parse well-formed <tool_call> tags", () => {
      const text = `Let me check that for you.\n<tool_call>\n{"name": "get_weather", "arguments": {"city": "Hanoi"}}\n</tool_call>`;
      const call = extractToolCall(text);
      expect(call).toEqual({
        name: "get_weather",
        arguments: { city: "Hanoi" },
      });
    });

    it("should return null when no <tool_call> is present", () => {
      const call = extractToolCall("Hello there, how can I help you?");
      expect(call).toBeNull();
    });

    it("should return null for malformed JSON inside tool_call tag", () => {
      const text = `<tool_call>{invalid json}</tool_call>`;
      expect(extractToolCall(text)).toBeNull();
    });

    it("should return null when tool name is missing or not a string", () => {
      expect(
        extractToolCall(`<tool_call>{"arguments": {}}</tool_call>`),
      ).toBeNull();
      expect(
        extractToolCall(
          `<tool_call>{"name": 12345, "arguments": {}}</tool_call>`,
        ),
      ).toBeNull();
    });

    it("should default arguments to empty object when missing or null", () => {
      const missingArgs = extractToolCall(
        `<tool_call>{"name": "ping"}</tool_call>`,
      );
      expect(missingArgs).toEqual({ name: "ping", arguments: {} });

      const nullArgs = extractToolCall(
        `<tool_call>{"name": "ping", "arguments": null}</tool_call>`,
      );
      expect(nullArgs).toEqual({ name: "ping", arguments: {} });
    });

    it("should default arguments to empty object when arguments is not an object", () => {
      const stringArgs = extractToolCall(
        `<tool_call>{"name": "ping", "arguments": "invalid"}</tool_call>`,
      );
      expect(stringArgs).toEqual({ name: "ping", arguments: {} });
    });
  });

  describe("cleanOutputContent", () => {
    it("should remove <tool_call> tags from final text", () => {
      const text = `Here is the answer.\n<tool_call>{"name":"test"}</tool_call>\nHave a great day!`;
      const clean = cleanOutputContent(text);
      expect(clean).toBe("Here is the answer.\n\nHave a great day!");
    });

    it("should return fallback response when content is empty after stripping", () => {
      const clean = cleanOutputContent("<tool_call>{}</tool_call>");
      expect(clean).toBe(DEFAULT_FALLBACK_RESPONSE);
    });

    it("should return fallback response for empty whitespace string", () => {
      expect(cleanOutputContent("   \n\t  ")).toBe(DEFAULT_FALLBACK_RESPONSE);
    });
  });

  describe("executeSingleTool", () => {
    const mockContext: ToolExecutionContext = {
      botId: "bot-123",
    };

    it("should execute available tool and format result tag with serialized JSON", async () => {
      const mockTool: ToolDefinition = {
        name: "search_docs",
        description: "Search documentation",
        parameters: { type: "OBJECT", properties: {} },
        execute: vi.fn().mockResolvedValue({ result: "Found 3 articles" }),
      };

      const prompt: AiPrompt = {
        text: "search",
        tools: [mockTool],
        toolContext: mockContext,
      };

      const resultTag = await executeSingleTool(
        { name: "search_docs", arguments: { q: "test" } },
        prompt,
      );

      expect(resultTag).toContain('<tool_result name="search_docs">');
      expect(resultTag).toContain("Found 3 articles");
      expect(mockTool.execute).toHaveBeenCalledWith({ q: "test" }, mockContext);
    });

    it("should format string tool output directly without extra JSON quotes", async () => {
      const mockTool: ToolDefinition = {
        name: "get_time",
        description: "Get server time",
        parameters: { type: "OBJECT", properties: {} },
        execute: vi.fn().mockResolvedValue("2026-10-27T21:00:00Z"),
      };

      const prompt: AiPrompt = {
        text: "time",
        tools: [mockTool],
        toolContext: mockContext,
      };

      const resultTag = await executeSingleTool(
        { name: "get_time", arguments: {} },
        prompt,
      );

      expect(resultTag).toBe(
        '<tool_result name="get_time">\n2026-10-27T21:00:00Z\n</tool_result>',
      );
    });

    it("should handle tool execution Error gracefully", async () => {
      const mockTool: ToolDefinition = {
        name: "failing_tool",
        description: "Always fails",
        parameters: { type: "OBJECT", properties: {} },
        execute: vi.fn().mockRejectedValue(new Error("Network timeout")),
      };

      const prompt: AiPrompt = {
        text: "fail",
        tools: [mockTool],
        toolContext: mockContext,
      };

      const resultTag = await executeSingleTool(
        { name: "failing_tool", arguments: {} },
        prompt,
      );

      expect(resultTag).toContain('<tool_result name="failing_tool">');
      expect(resultTag).toContain("Network timeout");
    });

    it("should handle non-Error exceptions in tool execution", async () => {
      const mockTool: ToolDefinition = {
        name: "throw_string_tool",
        description: "Throws string",
        parameters: { type: "OBJECT", properties: {} },
        execute: vi.fn().mockRejectedValue("Fatal internal error string"),
      };

      const prompt: AiPrompt = {
        text: "fail",
        tools: [mockTool],
        toolContext: mockContext,
      };

      const resultTag = await executeSingleTool(
        { name: "throw_string_tool", arguments: {} },
        prompt,
      );

      expect(resultTag).toContain("Fatal internal error string");
    });

    it("should return error when tool is not found", async () => {
      const prompt: AiPrompt = {
        text: "missing",
        tools: [],
        toolContext: mockContext,
      };

      const resultTag = await executeSingleTool(
        { name: "unknown_tool", arguments: {} },
        prompt,
      );

      expect(resultTag).toContain("not found or no tool context provided");
    });

    it("should return error when toolContext is undefined", async () => {
      const mockTool: ToolDefinition = {
        name: "valid_tool",
        description: "Valid tool",
        parameters: { type: "OBJECT", properties: {} },
        execute: vi.fn(),
      };

      const prompt: AiPrompt = {
        text: "no context",
        tools: [mockTool],
        toolContext: undefined,
      };

      const resultTag = await executeSingleTool(
        { name: "valid_tool", arguments: {} },
        prompt,
      );

      expect(resultTag).toContain("not found or no tool context provided");
    });

    it("should log parameter keys and summary at console.info without exposing raw arguments or outputs", async () => {
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      const mockTool: ToolDefinition = {
        name: "secure_tool",
        description: "Process secrets",
        parameters: { type: "OBJECT", properties: {} },
        execute: vi
          .fn()
          .mockResolvedValue({ secretToken: "very-secret-token" }),
      };

      const prompt: AiPrompt = {
        text: "secure",
        tools: [mockTool],
        toolContext: mockContext,
      };

      await executeSingleTool(
        {
          name: "secure_tool",
          arguments: { secretParam: "super-secret-value" },
        },
        prompt,
      );

      // Verify console.info only logged parameter names
      const infoCalls = infoSpy.mock.calls.map((c) => c.join(" "));
      expect(
        infoCalls.some((c) => c.includes("parameters: [secretParam]")),
      ).toBe(true);
      expect(infoCalls.some((c) => c.includes("super-secret-value"))).toBe(
        false,
      );
      expect(infoCalls.some((c) => c.includes("very-secret-token"))).toBe(
        false,
      );

      // Verify console.debug received redacted arguments and output for debugging
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining("secure_tool"),
        expect.objectContaining({
          args: { secretParam: "[REDACTED]" },
        }),
      );
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining("secure_tool"),
        expect.objectContaining({
          output: { secretToken: "[REDACTED]" },
        }),
      );

      infoSpy.mockRestore();
      debugSpy.mockRestore();
    });

    it("should suppress console.debug when NODE_ENV is production", async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const mockTool: ToolDefinition = {
        name: "prod_tool",
        description: "Production tool",
        parameters: { type: "OBJECT", properties: {} },
        execute: vi.fn().mockResolvedValue({ status: "ok" }),
      };

      const prompt: AiPrompt = {
        text: "prod",
        tools: [mockTool],
        toolContext: mockContext,
      };

      try {
        await executeSingleTool(
          { name: "prod_tool", arguments: { token: "secret" } },
          prompt,
        );
        expect(debugSpy).not.toHaveBeenCalled();
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        debugSpy.mockRestore();
      }
    });

    it("should enforce timeout barrier when tool execution hangs indefinitely", async () => {
      const hangingTool: ToolDefinition = {
        name: "hanging_tool",
        description: "Hangs indefinitely",
        parameters: { type: "OBJECT", properties: {} },
        execute: vi.fn(
          () =>
            new Promise((resolve) => {
              // Hangs for 5 seconds
              setTimeout(resolve, 5000);
            }),
        ),
      };

      const prompt: AiPrompt = {
        text: "hang",
        tools: [hangingTool],
        toolContext: mockContext,
      };

      const resultTag = await executeSingleTool(
        { name: "hanging_tool", arguments: {} },
        prompt,
        50, // 50ms timeout barrier
      );

      expect(resultTag).toContain('<tool_result name="hanging_tool">');
      expect(resultTag).toContain("timed out after 50ms");
    });

    it("should prevent unhandled rejection if tool execution rejects after timeout barrier", async () => {
      let lateReject: (err: Error) => void = () => {};
      const delayedFailingTool: ToolDefinition = {
        name: "delayed_failing_tool",
        description: "Fails after timeout",
        parameters: { type: "OBJECT", properties: {} },
        execute: vi.fn(
          () =>
            new Promise((_, reject) => {
              lateReject = reject;
            }),
        ),
      };

      const prompt: AiPrompt = {
        text: "test",
        tools: [delayedFailingTool],
        toolContext: mockContext,
      };

      const resultTag = await executeSingleTool(
        { name: "delayed_failing_tool", arguments: {} },
        prompt,
        20, // 20ms timeout
      );

      expect(resultTag).toContain("timed out after 20ms");

      // Trigger late rejection - should not crash process or trigger unhandled rejection
      expect(() =>
        lateReject(new Error("Late asynchronous failure")),
      ).not.toThrow();
    });
  });

  describe("redactSensitiveData", () => {
    it("should export SENSITIVE_KEY_REGEX matching expected keywords", () => {
      expect(SENSITIVE_KEY_REGEX.test("apiToken")).toBe(true);
      expect(SENSITIVE_KEY_REGEX.test("secret_key")).toBe(true);
      expect(SENSITIVE_KEY_REGEX.test("password")).toBe(true);
      expect(SENSITIVE_KEY_REGEX.test("authHeader")).toBe(true);
      expect(SENSITIVE_KEY_REGEX.test("credential")).toBe(true);
      expect(SENSITIVE_KEY_REGEX.test("cert")).toBe(true);
      expect(SENSITIVE_KEY_REGEX.test("cookie")).toBe(true);
      expect(SENSITIVE_KEY_REGEX.test("unrelatedField")).toBe(false);
    });

    it("should redact keys matching sensitive regex (token, key, secret, password, auth, credential, cert, cookie)", () => {
      const input = {
        normalParam: "normal",
        apiToken: "secret-token",
        secret_key: "secret-key",
        userPassword: "password123",
        authHeader: "Bearer 12345",
        awsCredential: "cred",
        sslCert: "-----BEGIN CERTIFICATE-----",
        sessionCookie: "session=abc",
      };

      const redacted = redactSensitiveData(input) as Record<string, unknown>;
      expect(redacted.normalParam).toBe("normal");
      expect(redacted.apiToken).toBe("[REDACTED]");
      expect(redacted.secret_key).toBe("[REDACTED]");
      expect(redacted.userPassword).toBe("[REDACTED]");
      expect(redacted.authHeader).toBe("[REDACTED]");
      expect(redacted.awsCredential).toBe("[REDACTED]");
      expect(redacted.sslCert).toBe("[REDACTED]");
      expect(redacted.sessionCookie).toBe("[REDACTED]");
    });

    it("should recursively redact sensitive fields in nested objects and arrays", () => {
      const input = {
        user: {
          name: "alice",
          authToken: "xyz",
        },
        items: [
          { id: 1, secret: "s1" },
          { id: 2, apiKey: "k2" },
        ],
      };

      const redacted = redactSensitiveData(input) as {
        user: { name: string; authToken: string };
        items: Array<{ id: number; secret?: string; apiKey?: string }>;
      };
      expect(redacted.user.name).toBe("alice");
      expect(redacted.user.authToken).toBe("[REDACTED]");
      expect(redacted.items[0].secret).toBe("[REDACTED]");
      expect(redacted.items[1].apiKey).toBe("[REDACTED]");
    });

    it("should handle circular references without infinite recursion", () => {
      const circular: Record<string, unknown> = { key: "secret-key" };
      circular.self = circular;

      const redacted = redactSensitiveData(circular) as Record<string, unknown>;
      expect(redacted.key).toBe("[REDACTED]");
      expect(redacted.self).toBe("[CIRCULAR]");
    });

    it("should return primitives, null, and undefined directly", () => {
      expect(redactSensitiveData(null)).toBeNull();
      expect(redactSensitiveData(undefined)).toBeUndefined();
      expect(redactSensitiveData(42)).toBe(42);
      expect(redactSensitiveData("plain text")).toBe("plain text");
    });
  });

  describe("runToolCallingLoop", () => {
    const mockContext: ToolExecutionContext = { botId: "bot-123" };
    const mockTool: ToolDefinition = {
      name: "fetch_data",
      description: "Fetch data",
      parameters: { type: "OBJECT", properties: {} },
      execute: vi.fn().mockResolvedValue({ status: "ok", data: 42 }),
    };

    it("should return answer immediately on turn 1 if model does not call any tools", async () => {
      const mockProc = new MockChildProcess();
      vi.mocked(spawn).mockImplementationOnce(() => {
        queueMicrotask(() => {
          mockProc.stdout.emit(
            "data",
            Buffer.from(
              JSON.stringify({
                status: "SUCCESS",
                response: "Direct answer without tools.",
              }),
            ),
          );
          mockProc.emit("close", 0);
        });
        return mockProc as unknown as ReturnType<typeof spawn>;
      });

      const result = await runToolCallingLoop(
        {
          command: "agy",
          model: "gemini-3.8-flash",
          promptText: "Question",
        },
        { text: "Question", tools: [mockTool], toolContext: mockContext },
      );

      expect(result).toBe("Direct answer without tools.");
      expect(mockTool.execute).not.toHaveBeenCalled();
    });

    it("should execute multi-turn tool interaction until final answer is provided", async () => {
      const proc1 = new MockChildProcess();
      const proc2 = new MockChildProcess();

      vi.mocked(spawn)
        // Iteration 1: model returns tool call
        .mockImplementationOnce(() => {
          queueMicrotask(() => {
            proc1.stdout.emit(
              "data",
              Buffer.from(
                JSON.stringify({
                  status: "SUCCESS",
                  response:
                    '<tool_call>\n{"name": "fetch_data", "arguments": {}}\n</tool_call>',
                }),
              ),
            );
            proc1.emit("close", 0);
          });
          return proc1 as unknown as ReturnType<typeof spawn>;
        })
        // Iteration 2: model receives tool output and returns final answer
        .mockImplementationOnce(() => {
          queueMicrotask(() => {
            proc2.stdout.emit(
              "data",
              Buffer.from(
                JSON.stringify({
                  status: "SUCCESS",
                  response: "The fetched data value is 42.",
                }),
              ),
            );
            proc2.emit("close", 0);
          });
          return proc2 as unknown as ReturnType<typeof spawn>;
        });

      const result = await runToolCallingLoop(
        {
          command: "agy",
          model: "gemini-3.8-flash",
          promptText: "Question",
        },
        { text: "Question", tools: [mockTool], toolContext: mockContext },
      );

      expect(result).toBe("The fetched data value is 42.");
      expect(mockTool.execute).toHaveBeenCalledWith({}, mockContext);
    });

    it("should enforce recursion limit when model continuously requests tools (MAX_TOOL_ITERATIONS)", async () => {
      // 7 loop iterations returning tool call + 1 termination call
      const procs = Array.from(
        { length: MAX_TOOL_ITERATIONS + 1 },
        () => new MockChildProcess(),
      );

      procs.forEach((proc, idx) => {
        vi.mocked(spawn).mockImplementationOnce(() => {
          queueMicrotask(() => {
            if (idx < MAX_TOOL_ITERATIONS) {
              proc.stdout.emit(
                "data",
                Buffer.from(
                  JSON.stringify({
                    status: "SUCCESS",
                    response: `<tool_call>\n{"name": "fetch_data", "arguments": {"step": ${idx}}}\n</tool_call>`,
                  }),
                ),
              );
            } else {
              // Final termination response
              proc.stdout.emit(
                "data",
                Buffer.from(
                  JSON.stringify({
                    status: "SUCCESS",
                    response: "Summary after hitting maximum tool call limit.",
                  }),
                ),
              );
            }
            proc.emit("close", 0);
          });
          return proc as unknown as ReturnType<typeof spawn>;
        });
      });

      const result = await runToolCallingLoop(
        {
          command: "agy",
          model: "gemini-3.8-flash",
          promptText: "Question",
        },
        { text: "Question", tools: [mockTool], toolContext: mockContext },
      );

      expect(result).toBe("Summary after hitting maximum tool call limit.");
      expect(spawn).toHaveBeenCalledTimes(MAX_TOOL_ITERATIONS + 1);
    });

    it("should stop multi-turn loop and return clean fallback if global timeout budget is exhausted", async () => {
      let currentTime = 1_000_000;
      const dateSpy = vi
        .spyOn(Date, "now")
        .mockImplementation(() => currentTime);

      const mockProc = new MockChildProcess();
      vi.mocked(spawn).mockImplementationOnce(() => {
        queueMicrotask(() => {
          mockProc.stdout.emit(
            "data",
            Buffer.from(
              JSON.stringify({
                status: "SUCCESS",
                response:
                  '<tool_call>\n{"name": "fetch_data", "arguments": {}}\n</tool_call>',
              }),
            ),
          );
          mockProc.emit("close", 0);
        });
        return mockProc as unknown as ReturnType<typeof spawn>;
      });

      vi.mocked(mockTool.execute).mockImplementationOnce(async () => {
        currentTime += 70_000; // Advance past 60_000 budget
        return { data: 123 };
      });

      const result = await runToolCallingLoop(
        {
          command: "agy",
          model: "gemini-3.8-flash",
          promptText: "Question",
          totalMaxBudgetMs: 60_000,
        },
        { text: "Question", tools: [mockTool], toolContext: mockContext },
      );

      expect(result).toBe(DEFAULT_FALLBACK_RESPONSE);
      expect(spawn).toHaveBeenCalledTimes(1);

      dateSpy.mockRestore();
    });

    it("should calculate iteration timeout using Math.min(remainingBudget, iterationTimeoutMs)", async () => {
      const mockProc = new MockChildProcess();
      vi.mocked(spawn).mockImplementationOnce(() => {
        queueMicrotask(() => {
          mockProc.stdout.emit(
            "data",
            Buffer.from(
              JSON.stringify({
                status: "SUCCESS",
                response: "Immediate answer",
              }),
            ),
          );
          mockProc.emit("close", 0);
        });
        return mockProc as unknown as ReturnType<typeof spawn>;
      });

      const result = await runToolCallingLoop(
        {
          command: "agy",
          model: "gemini-3.8-flash",
          promptText: "Question",
          timeoutMs: 15_000,
          totalMaxBudgetMs: 50_000,
        },
        { text: "Question", tools: [mockTool], toolContext: mockContext },
      );

      expect(result).toBe("Immediate answer");
      expect(spawn).toHaveBeenCalledWith(
        "agy",
        expect.any(Array),
        expect.any(Object),
      );
    });
  });

  describe("Prompt building and formatting helpers", () => {
    it("should format history correctly with display names or usernames", () => {
      const history = [
        {
          author: "user" as const,
          content: "Can you help me?",
          displayName: "AliceDev",
          username: "alice",
        },
        { author: "bot" as const, content: "Of course! What do you need?" },
      ];
      const formatted = formatHistory(history);
      expect(formatted).toContain("[AliceDev]: Can you help me?");
      expect(formatted).toContain("[Assistant]: Of course! What do you need?");
    });

    it("should return empty string for empty or undefined history", () => {
      expect(formatHistory([])).toBe("");
      expect(formatHistory(undefined)).toBe("");
    });

    it("should build tools instruction block with tool metadata and protocol", () => {
      const tools: ToolDefinition[] = [
        {
          name: "calculate_sum",
          description: "Calculates sum of two numbers",
          parameters: {
            type: "OBJECT",
            properties: {
              a: { type: "NUMBER", description: "First number" },
              b: { type: "NUMBER", description: "Second number" },
            },
          },
          execute: vi.fn(),
        },
      ];
      const instruction = buildToolsInstruction(tools);
      expect(instruction).toContain("### Available Tools:");
      expect(instruction).toContain("Tool: calculate_sum");
      expect(instruction).toContain(
        "Description: Calculates sum of two numbers",
      );
      expect(instruction).toContain("<tool_call>");
    });

    it("should return empty string when tools list is empty or undefined", () => {
      expect(buildToolsInstruction([])).toBe("");
      expect(buildToolsInstruction(undefined)).toBe("");
    });

    it("should format attachment descriptions with mime types and paths", () => {
      const attachments: PreparedAttachment[] = [
        {
          localPath: "/tmp/img1.png",
          mimeType: "image/png",
          isTemporary: false,
        },
        {
          localPath: "/tmp/img2.jpg",
          mimeType: "image/jpeg",
          isTemporary: true,
        },
      ];
      const formatted = formatAttachmentDescriptions(attachments);
      expect(formatted).toContain("format=image/png, path=/tmp/img1.png");
      expect(formatted).toContain("format=image/jpeg, path=/tmp/img2.jpg");
    });

    it("should return empty string when attachments list is empty", () => {
      expect(formatAttachmentDescriptions([])).toBe("");
    });

    it("should assemble full prompt text from all sections", () => {
      const full = buildFullPromptText({
        systemInstruction: "You are a helpful assistant",
        toolsInstruction: "Tools info",
        historyText: "History info",
        attachmentsInstruction: "Attachments info",
        userPromptText: "Hello world",
      });

      expect(full).toContain(
        "### System Instruction:\nYou are a helpful assistant",
      );
      expect(full).toContain("Tools info");
      expect(full).toContain("History info");
      expect(full).toContain("Attachments info");
      expect(full).toContain("User: Hello world");
    });
  });

  describe("AntigravityGenAi class", () => {
    it("should initialize and verify executable successfully", async () => {
      vi.mocked(execFile).mockImplementation(
        (
          _cmd: string,
          _args: readonly string[] | null | undefined,
          _opts: unknown,
          cb: unknown,
        ) => {
          const callback = typeof _opts === "function" ? _opts : cb;
          if (typeof callback === "function") {
            callback(null, "agy 1.2.0\n", "");
          }
          return {} as ReturnType<typeof execFile>;
        },
      );

      const provider = new AntigravityGenAi(baseConfig);
      await expect(provider.init()).resolves.toBeUndefined();

      // Calling init() a second time should use cached resolution without re-executing
      await provider.init();
      expect(execFile).toHaveBeenCalledTimes(1);
    });

    it("should throw informative error when agy binary is not found or not executable", async () => {
      vi.mocked(execFile).mockImplementation(
        (
          _cmd: string,
          _args: readonly string[] | null | undefined,
          _opts: unknown,
          cb: unknown,
        ) => {
          const callback = typeof _opts === "function" ? _opts : cb;
          if (typeof callback === "function") {
            callback(
              new Error("Command failed: /missing/agy --version (ENOENT)"),
              "",
              "",
            );
          }
          return {} as ReturnType<typeof execFile>;
        },
      );

      const provider = new AntigravityGenAi({
        ...baseConfig,
        antigravityCommand: "/missing/agy",
      });

      await expect(provider.init()).rejects.toThrow(
        "Google Antigravity CLI ('agy') binary not found or not executable",
      );
    });

    it("should generate a response using generate() without tools", async () => {
      vi.mocked(execFile).mockImplementation(
        (
          _cmd: string,
          _args: readonly string[] | null | undefined,
          _opts: unknown,
          cb: unknown,
        ) => {
          const callback = typeof _opts === "function" ? _opts : cb;
          if (typeof callback === "function") {
            callback(null, "agy 1.2.0\n", "");
          }
          return {} as ReturnType<typeof execFile>;
        },
      );

      const mockProc = new MockChildProcess();
      vi.mocked(spawn).mockImplementationOnce(() => {
        queueMicrotask(() => {
          mockProc.stdout.emit(
            "data",
            Buffer.from(
              JSON.stringify({
                status: "SUCCESS",
                response: "Hello! How can I assist you today?",
              }),
            ),
          );
          mockProc.emit("close", 0);
        });
        return mockProc as unknown as ReturnType<typeof spawn>;
      });

      const provider = new AntigravityGenAi({
        ...baseConfig,
        modelId: "gemini-3.8-flash-low",
      });

      const response: AiPromptResponse = await provider.generate({
        text: "Hello",
      });

      expect(response.content).toBe("Hello! How can I assist you today?");
      expect(response.data).toEqual({
        provider: "antigravity",
        model: "gemini-3.8-flash",
        effort: "low",
      });
    });

    it("should automatically call init() on generate() if not initialized yet", async () => {
      vi.mocked(execFile).mockImplementation(
        (
          _cmd: string,
          _args: readonly string[] | null | undefined,
          _opts: unknown,
          cb: unknown,
        ) => {
          const callback = typeof _opts === "function" ? _opts : cb;
          if (typeof callback === "function") {
            callback(null, "agy 1.2.0\n", "");
          }
          return {} as ReturnType<typeof execFile>;
        },
      );

      const mockProc = new MockChildProcess();
      vi.mocked(spawn).mockImplementationOnce(() => {
        queueMicrotask(() => {
          mockProc.stdout.emit(
            "data",
            Buffer.from(
              JSON.stringify({
                status: "SUCCESS",
                response: "Initialized on demand.",
              }),
            ),
          );
          mockProc.emit("close", 0);
        });
        return mockProc as unknown as ReturnType<typeof spawn>;
      });

      const provider = new AntigravityGenAi(baseConfig);
      const res = await provider.generate({ text: "Hi" });
      expect(res.content).toBe("Initialized on demand.");
      expect(execFile).toHaveBeenCalledTimes(1);
    });

    it("should route to runToolCallingLoop when prompt.tools is provided", async () => {
      vi.mocked(execFile).mockImplementation(
        (
          _cmd: string,
          _args: readonly string[] | null | undefined,
          _opts: unknown,
          cb: unknown,
        ) => {
          const callback = typeof _opts === "function" ? _opts : cb;
          if (typeof callback === "function") {
            callback(null, "agy 1.2.0\n", "");
          }
          return {} as ReturnType<typeof execFile>;
        },
      );

      const mockProc = new MockChildProcess();
      vi.mocked(spawn).mockImplementationOnce(() => {
        queueMicrotask(() => {
          mockProc.stdout.emit(
            "data",
            Buffer.from(
              JSON.stringify({
                status: "SUCCESS",
                response: "Answer with tools enabled.",
              }),
            ),
          );
          mockProc.emit("close", 0);
        });
        return mockProc as unknown as ReturnType<typeof spawn>;
      });

      const mockTool: ToolDefinition = {
        name: "test_tool",
        description: "Test tool",
        parameters: { type: "OBJECT", properties: {} },
        execute: vi.fn(),
      };

      const provider = new AntigravityGenAi(baseConfig);
      const res = await provider.generate({
        text: "Hi",
        tools: [mockTool],
        toolContext: { botId: "bot-1" },
      });

      expect(res.content).toBe("Answer with tools enabled.");
    });

    it("should always clean up temporary attachments in finally block even if generation fails", async () => {
      vi.mocked(execFile).mockImplementation(
        (
          _cmd: string,
          _args: readonly string[] | null | undefined,
          _opts: unknown,
          cb: unknown,
        ) => {
          const callback = typeof _opts === "function" ? _opts : cb;
          if (typeof callback === "function") {
            callback(null, "agy 1.2.0\n", "");
          }
          return {} as ReturnType<typeof execFile>;
        },
      );

      vi.mocked(axios.get).mockResolvedValue({
        data: Buffer.from("fake-png-bytes"),
      });

      const mockProc = new MockChildProcess();
      vi.mocked(spawn).mockImplementationOnce(() => {
        queueMicrotask(() => {
          mockProc.stderr.emit("data", Buffer.from("Process crash"));
          mockProc.emit("close", 1);
        });
        return mockProc as unknown as ReturnType<typeof spawn>;
      });

      const provider = new AntigravityGenAi(baseConfig);

      try {
        await provider.generate({
          text: "Analyze this image",
          files: [
            { uri: "https://example.com/test.png", mimeType: "image/png" },
          ],
        });
      } catch (err: unknown) {
        expect(String(err)).toContain("Process crash");
      }

      // Check tmpdir for any leftover agy-attachment files from this test
      const tempFiles = fs
        .readdirSync(os.tmpdir())
        .filter((f) => f.startsWith("agy-attachment-"));
      // The finally block cleaned up the file
      expect(tempFiles).toEqual([]);
    });
  });
});
