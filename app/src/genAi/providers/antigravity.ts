import { type ChildProcess, execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import axios from "axios";
import type { ToolDefinition } from "../../tools/types";
import type {
  AiChatMessage,
  AiPrompt,
  AiPromptFile,
  AiPromptResponse,
} from "../../types";
import type { GenAi, GenAiConfig } from "../types";

export const DEFAULT_ANTIGRAVITY_MODEL = "gemini-3.8-flash";
export const DEFAULT_ANTIGRAVITY_TIMEOUT_MS = 120_000;
export const DEFAULT_TOOL_ITERATION_TIMEOUT_MS = 30_000;
export const MAX_AGY_BUFFER_BYTES = 10 * 1024 * 1024; // 10MB DoS buffer guard
export const MAX_REMOTE_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB remote attachment size limit
export const MAX_TOOL_ITERATIONS = 7;
export const DEFAULT_FALLBACK_RESPONSE =
  "Xin lỗi, hiện tại mình không thể thu thập đủ thông tin để trả lời câu hỏi này.";

export const DEFAULT_ALLOWED_ATTACHMENT_DIRS: readonly string[] = [
  os.tmpdir(),
  path.resolve(process.cwd(), "assets"),
];

export const SENSITIVE_KEY_REGEX =
  /token|key|secret|password|auth|credential|cert|cookie/i;

/**
 * Deeply redacts sensitive keys matching SENSITIVE_KEY_REGEX with '[REDACTED]'.
 * Safely handles circular references and arbitrary nested data structures.
 */
export function redactSensitiveData(
  data: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (data === null || typeof data !== "object") {
    return data;
  }

  if (seen.has(data)) {
    return "[CIRCULAR]";
  }
  seen.add(data);

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = redactSensitiveData(value, seen);
    } else {
      result[key] = value;
    }
  }

  return result;
}

const REASONING_EFFORT_REGEX = /^(.*?)-(low|medium|high|xhigh|max)$/i;
const TOOL_CALL_TAG_REGEX = /<tool_call>([\s\S]*?)<\/tool_call>/i;

export const STANDARD_SYSTEM_ENV_VARS: ReadonlySet<string> = new Set([
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SHELL",
  "LANG",
  "LC_ALL",
  "NODE_ENV",
  "ANTIGRAVITY_CONFIG_DIR",
  "TERM",
  "SYSTEMROOT",
  "COMSPEC",
  "PATHEXT",
  "APPDATA",
  "LOCALAPPDATA",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "XDG_RUNTIME_DIR",
]);

export interface ParsedModelConfig {
  model: string;
  effort?: string;
}

export interface PreparedAttachment {
  localPath: string;
  mimeType: string;
  isTemporary: boolean;
}

export interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ExecuteAgyOptions {
  command: string;
  model: string;
  effort?: string;
  promptText: string;
  configDir?: string;
  timeoutMs?: number;
  totalMaxBudgetMs?: number;
}

export interface AgySuccessPayload {
  conversation_id?: string;
  status: string;
  response?: string;
  error?: string;
  [key: string]: unknown;
}

/**
 * Safely terminates a child process and any spawned descendants.
 */
export function killProcessTree(proc: ChildProcess): void {
  try {
    proc.kill("SIGTERM");
  } catch {
    // Process may have already exited
  }

  const forceKillTimer = setTimeout(() => {
    try {
      if (proc.exitCode === null && proc.signalCode === null) {
        proc.kill("SIGKILL");
      }
    } catch {
      // Ignore
    }
  }, 2000);

  if (typeof forceKillTimer.unref === "function") {
    forceKillTimer.unref();
  }
}

/**
 * Resolves the path to the Antigravity CLI executable ('agy').
 * Searches user configuration, environment variables, known install locations, and PATH.
 */
export function resolveAgyCommand(configuredCommand?: string): string {
  const explicitCommand =
    configuredCommand?.trim() ||
    process.env.ANTIGRAVITY_COMMAND?.trim() ||
    process.env.AGY_CLI_PATH?.trim() ||
    process.env.ANTIGRAVITY_CLI_PATH?.trim();

  if (explicitCommand) {
    return explicitCommand;
  }

  const defaultLocations = [
    path.join(os.homedir(), ".local", "bin", "agy"),
    path.join(os.homedir(), ".gemini", "antigravity-cli", "bin", "agy"),
  ];

  for (const candidate of defaultLocations) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return "agy";
}

/**
 * Verifies that the Antigravity binary is runnable by checking '--version'.
 */
export function verifyAgyExecutable(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, ["--version"], { timeout: 10_000 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * Separates model name and reasoning effort suffix if present.
 */
export function parseModelAndEffort(
  modelId?: string,
  configuredEffort?: string,
): ParsedModelConfig {
  const rawModel = (modelId || DEFAULT_ANTIGRAVITY_MODEL).trim();
  const match = rawModel.match(REASONING_EFFORT_REGEX);

  if (match) {
    const [, baseModel, effortSuffix] = match;
    return {
      model: baseModel,
      effort: configuredEffort || effortSuffix.toLowerCase(),
    };
  }

  return {
    model: rawModel,
    effort: configuredEffort,
  };
}

function extractPassthroughKeys(envValue?: string): string[] {
  if (!envValue) return [];
  return envValue
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

function resolveAllowedEnvKeys(extraAllowlist?: Iterable<string>): Set<string> {
  const allowedKeys = new Set(STANDARD_SYSTEM_ENV_VARS);

  if (extraAllowlist) {
    for (const key of extraAllowlist) {
      const trimmed = key.trim();
      if (trimmed) {
        allowedKeys.add(trimmed);
      }
    }
  }

  const passthroughEnv =
    process.env.ANTIGRAVITY_ENV_ALLOWLIST ||
    process.env.ANTIGRAVITY_ENV_PASSTHROUGH;

  for (const key of extractPassthroughKeys(passthroughEnv)) {
    allowedKeys.add(key);
  }

  return allowedKeys;
}

/**
 * Creates a sanitized environment object using a strict allowlist.
 * Only standard system variables and explicitly allowlisted variables are passed.
 * Ensures zero credentials, database connection strings, or secret tokens are leaked to the child process.
 */
export function buildSanitizedEnvironment(
  customConfigDir?: string,
  extraAllowlist?: Iterable<string>,
): NodeJS.ProcessEnv {
  const allowedKeys = resolveAllowedEnvKeys(extraAllowlist);
  const sanitized: NodeJS.ProcessEnv = {};

  for (const key of allowedKeys) {
    const value = process.env[key];
    if (value !== undefined) {
      sanitized[key] = value;
    }
  }

  if (customConfigDir) {
    sanitized.ANTIGRAVITY_CONFIG_DIR = customConfigDir;
  }

  return sanitized;
}

/**
 * Parses JSON output produced by agy in print mode.
 */
export function parseAgyJsonOutput(rawStdout: string): AgySuccessPayload {
  const trimmed = rawStdout.trim();
  let parsed: AgySuccessPayload;

  try {
    parsed = JSON.parse(trimmed) as AgySuccessPayload;
  } catch {
    const startIdx = trimmed.indexOf("{");
    const endIdx = trimmed.lastIndexOf("}");
    if (startIdx !== -1 && endIdx > startIdx) {
      const jsonSub = trimmed.substring(startIdx, endIdx + 1);
      parsed = JSON.parse(jsonSub) as AgySuccessPayload;
    } else {
      throw new Error(
        `Failed to parse agy JSON output: ${trimmed.slice(0, 300)}`,
      );
    }
  }

  if (parsed.status && parsed.status !== "SUCCESS") {
    throw new Error(
      `Antigravity CLI returned unsuccessful status '${parsed.status}': ${parsed.error || parsed.response || "No error details"}`,
    );
  }

  return parsed;
}

/**
 * Executes the Antigravity CLI process with piped input and returns the parsed payload.
 */
export function executeAgyProcess(
  options: ExecuteAgyOptions,
): Promise<AgySuccessPayload> {
  const {
    command,
    model,
    effort,
    promptText,
    configDir,
    timeoutMs = DEFAULT_ANTIGRAVITY_TIMEOUT_MS,
  } = options;

  const args = [
    "--output-format",
    "json",
    "--disable-slash-commands",
    "--model",
    model,
  ];
  if (effort) {
    args.push("--effort", effort);
  }

  const env = buildSanitizedEnvironment(configDir);

  return new Promise((resolve, reject) => {
    let settled = false;

    const proc = spawn(command, args, {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(proc);
      cleanupAndReject(
        new Error(
          `Google Antigravity CLI ('agy') timed out after ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);

    const cleanupAndReject = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    };

    const cleanupAndResolve = (payload: AgySuccessPayload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(payload);
    };

    // SEC-03: Trap stdin errors immediately to prevent unhandled EPIPE / ERR_STREAM_DESTROYED process crashes
    proc.stdin.on("error", (err: Error) => {
      cleanupAndReject(err);
    });

    const checkBufferLimit = () => {
      if (stdout.length + stderr.length > MAX_AGY_BUFFER_BYTES) {
        if (typeof proc.stdout?.destroy === "function") {
          proc.stdout.destroy();
        }
        if (typeof proc.stderr?.destroy === "function") {
          proc.stderr.destroy();
        }
        killProcessTree(proc);
        cleanupAndReject(
          new Error(
            `Google Antigravity CLI ('agy') exceeded maximum buffer output limit of ${MAX_AGY_BUFFER_BYTES} bytes. Process terminated.`,
          ),
        );
      }
    };

    proc.stdout.on("data", (chunk: Buffer) => {
      if (settled) return;
      stdout += chunk.toString("utf-8");
      checkBufferLimit();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      if (settled) return;
      stderr += chunk.toString("utf-8");
      checkBufferLimit();
    });

    proc.on("error", (err) => {
      cleanupAndReject(err);
    });

    proc.on("close", (code) => {
      if (settled || timedOut) return;

      if (code !== 0) {
        cleanupAndReject(
          new Error(
            `Google Antigravity CLI exited with code ${code}: ${stderr || stdout}`,
          ),
        );
        return;
      }

      try {
        const parsed = parseAgyJsonOutput(stdout);
        cleanupAndResolve(parsed);
      } catch (parseErr) {
        cleanupAndReject(
          parseErr instanceof Error ? parseErr : new Error(String(parseErr)),
        );
      }
    });

    proc.stdin.write(promptText, "utf-8", (err) => {
      if (err) {
        cleanupAndReject(err);
      }
    });
    proc.stdin.end();
  });
}

function getExtensionFromMime(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "png";
  }
}

function isInsideTargetDirectory(target: string, parent: string): boolean {
  const rel = path.relative(parent, target);
  return !(rel.startsWith("..") || path.isAbsolute(rel));
}

function resolveCanonicalPath(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  if (fs.existsSync(resolved)) {
    try {
      return fs.realpathSync(resolved);
    } catch {
      return resolved;
    }
  }
  return resolved;
}

/**
 * Verifies whether a local file path is strictly contained within allowed safe directories.
 * Resolves symlinks and traversal sequences to guard against path traversal attacks.
 */
export function isSafeAttachmentPath(
  filePath: string,
  allowedDirs: readonly string[] = DEFAULT_ALLOWED_ATTACHMENT_DIRS,
): boolean {
  if (!filePath || typeof filePath !== "string") {
    return false;
  }

  try {
    const resolvedPath = path.resolve(filePath);
    const canonicalPath = resolveCanonicalPath(resolvedPath);

    return allowedDirs.some((dir) => {
      const resolvedDir = path.resolve(dir);
      const canonicalDir = resolveCanonicalPath(resolvedDir);
      return (
        isInsideTargetDirectory(canonicalPath, canonicalDir) &&
        (isInsideTargetDirectory(resolvedPath, resolvedDir) ||
          isInsideTargetDirectory(resolvedPath, canonicalDir))
      );
    });
  } catch {
    return false;
  }
}

const PRIVATE_IPV4_REGEX =
  /^(127\.|169\.254\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\.)/;

/**
 * Validates that a remote attachment URL does not target loopback, link-local,
 * cloud metadata (169.254.169.254), or RFC1918 private IP ranges (SSRF defense-in-depth).
 */
export function isSafeRemoteAttachmentUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase().trim();

    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "[::1]"
    ) {
      return false;
    }

    if (PRIVATE_IPV4_REGEX.test(hostname)) {
      return false;
    }

    const normalized = hostname.replace(/^\[|\]$/g, "");
    if (
      normalized.startsWith("fe80:") ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("::ffff:127.") ||
      normalized.startsWith("::ffff:169.254.") ||
      normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:192.168.")
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function saveRemoteAttachment(
  file: AiPromptFile,
): Promise<PreparedAttachment> {
  if (!isSafeRemoteAttachmentUrl(file.uri)) {
    throw new Error(
      `Remote attachment URL rejected for SSRF safety: ${file.uri}`,
    );
  }

  const ext = getExtensionFromMime(file.mimeType);
  const tempPath = path.join(
    os.tmpdir(),
    `agy-attachment-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`,
  );
  const response = await axios.get(file.uri, {
    responseType: "arraybuffer",
    timeout: 15_000,
    maxContentLength: MAX_REMOTE_ATTACHMENT_BYTES,
    maxBodyLength: MAX_REMOTE_ATTACHMENT_BYTES,
  });
  await fs.promises.writeFile(tempPath, Buffer.from(response.data));
  return {
    localPath: tempPath,
    mimeType: file.mimeType,
    isTemporary: true,
  };
}

async function saveDataUriAttachment(
  file: AiPromptFile,
): Promise<PreparedAttachment> {
  const ext = getExtensionFromMime(file.mimeType);
  const tempPath = path.join(
    os.tmpdir(),
    `agy-attachment-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`,
  );
  const base64Data = file.uri.split(",")[1];
  await fs.promises.writeFile(tempPath, Buffer.from(base64Data, "base64"));
  return {
    localPath: tempPath,
    mimeType: file.mimeType,
    isTemporary: true,
  };
}

function resolveLocalAttachment(
  file: AiPromptFile,
  allowedDirs: readonly string[],
): PreparedAttachment | null {
  const localCandidate = file.uri.startsWith("file://")
    ? file.uri.slice(7)
    : file.uri;

  if (!isSafeAttachmentPath(localCandidate, allowedDirs)) {
    console.warn(
      `[AntigravityGenAi] Attachment path rejected for safety or path traversal: ${file.uri}`,
    );
    return null;
  }

  if (!fs.existsSync(localCandidate)) {
    console.warn(
      `[AntigravityGenAi] Local attachment path does not exist: ${localCandidate}`,
    );
    return null;
  }

  return {
    localPath: path.resolve(localCandidate),
    mimeType: file.mimeType,
    isTemporary: false,
  };
}

async function processSingleAttachment(
  file: AiPromptFile,
  allowedDirs: readonly string[],
): Promise<PreparedAttachment | null> {
  if (!file.mimeType.startsWith("image/")) {
    return null;
  }

  if (file.uri.startsWith("http://") || file.uri.startsWith("https://")) {
    return await saveRemoteAttachment(file);
  }

  if (file.uri.startsWith("data:")) {
    return await saveDataUriAttachment(file);
  }

  return resolveLocalAttachment(file, allowedDirs);
}

/**
 * Downloads or saves multimodal prompt attachments to local temporary paths.
 * Validates local attachments strictly against allowed safe directories (SEC-01).
 */
export async function prepareAttachments(
  files?: AiPromptFile[],
  allowedDirs: readonly string[] = DEFAULT_ALLOWED_ATTACHMENT_DIRS,
): Promise<PreparedAttachment[]> {
  if (!files || files.length === 0) {
    return [];
  }

  const results: PreparedAttachment[] = [];
  try {
    for (const file of files) {
      const prepared = await processSingleAttachment(file, allowedDirs);
      if (prepared) {
        results.push(prepared);
      }
    }
    return results;
  } catch (err) {
    await cleanupTemporaryAttachments(results);
    throw err;
  }
}

/**
 * Deletes any temporary files created during attachment preparation.
 */
export async function cleanupTemporaryAttachments(
  attachments: PreparedAttachment[],
): Promise<void> {
  for (const att of attachments) {
    if (att.isTemporary) {
      try {
        await fs.promises.unlink(att.localPath);
      } catch {
        // Ignore deletion errors for temporary files
      }
    }
  }
}

/**
 * Formats conversation history into structured dialog turns.
 */
export function formatHistory(history?: AiChatMessage[]): string {
  if (!history || history.length === 0) {
    return "";
  }

  const lines = history.map((msg) => {
    const speaker =
      msg.author === "bot"
        ? "Assistant"
        : msg.displayName || msg.username || "User";
    return `[${speaker}]: ${msg.content}`;
  });

  return `### Recent Conversation History:\n${lines.join("\n")}`;
}

/**
 * Formats descriptions and local paths of attached images.
 */
export function formatAttachmentDescriptions(
  attachments: PreparedAttachment[],
): string {
  if (attachments.length === 0) {
    return "";
  }

  const lines = attachments.map(
    (att, index) =>
      `- Image #${index + 1}: format=${att.mimeType}, path=${att.localPath}`,
  );

  return `### Attached Images:\nThe user has attached the following image(s) accessible at local paths:\n${lines.join("\n")}\nYou may inspect and reference them.`;
}

/**
 * Formats tool definitions and instructions for headless tool execution.
 */
export function buildToolsInstruction(tools?: ToolDefinition[]): string {
  if (!tools || tools.length === 0) {
    return "";
  }

  const toolDescriptions = tools
    .map((t) => {
      const paramStr = t.parameters ? JSON.stringify(t.parameters) : "{}";
      return `- Tool: ${t.name}\n  Description: ${t.description}\n  Parameters: ${paramStr}`;
    })
    .join("\n\n");

  return `### Available Tools:\n${toolDescriptions}\n\n### Tool Calling Protocol:\nIf you need to call a tool, you MUST respond ONLY with a tool call in the following XML format:\n<tool_call>\n{"name": "tool_name", "arguments": { ... }}\n</tool_call>\nDo NOT include markdown backticks around the tool_call tags. Wait for the tool result before providing your final answer.\nWhen no further tools are needed, provide your final response to the user without any <tool_call> tags.`;
}

export interface FullPromptParams {
  systemInstruction?: string;
  toolsInstruction?: string;
  historyText?: string;
  attachmentsInstruction?: string;
  userPromptText: string;
}

/**
 * Assembles the complete prompt string from system instructions, tools, history, and attachments.
 */
export function buildFullPromptText(params: FullPromptParams): string {
  const sections: string[] = [];

  if (params.systemInstruction?.trim()) {
    sections.push(
      `### System Instruction:\n${params.systemInstruction.trim()}`,
    );
  }
  if (params.toolsInstruction?.trim()) {
    sections.push(params.toolsInstruction.trim());
  }
  if (params.historyText?.trim()) {
    sections.push(params.historyText.trim());
  }
  if (params.attachmentsInstruction?.trim()) {
    sections.push(params.attachmentsInstruction.trim());
  }
  sections.push(`User: ${params.userPromptText}`);

  return sections.join("\n\n");
}

/**
 * Extracts and parses a tool call request from model output.
 */
export function extractToolCall(text: string): ParsedToolCall | null {
  const match = text.match(TOOL_CALL_TAG_REGEX);
  if (!match) {
    return null;
  }

  const rawJson = match[1].trim();
  try {
    const parsed = JSON.parse(rawJson);
    if (parsed && typeof parsed.name === "string") {
      return {
        name: parsed.name,
        arguments:
          typeof parsed.arguments === "object" && parsed.arguments !== null
            ? (parsed.arguments as Record<string, unknown>)
            : {},
      };
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Executes a single tool against provided tool definitions and context.
 * Enforces a timeout barrier to prevent hanging executions.
 */
export async function executeSingleTool(
  call: ParsedToolCall,
  prompt: AiPrompt,
  timeoutMs: number = DEFAULT_TOOL_ITERATION_TIMEOUT_MS,
): Promise<string> {
  const tool = prompt.tools?.find((t) => t.name === call.name);

  if (!(tool && prompt.toolContext)) {
    const errObj = {
      error: `Tool '${call.name}' not found or no tool context provided.`,
    };
    return `<tool_result name="${call.name}">\n${JSON.stringify(errObj)}\n</tool_result>`;
  }

  const argKeys = Object.keys(call.arguments || {});
  console.info(
    `[AntigravityGenAi] Invoking tool: ${call.name} (parameters: [${argKeys.join(", ")}])`,
  );
  if (process.env.NODE_ENV !== "production") {
    console.debug(
      `[AntigravityGenAi] Tool invocation '${call.name}' arguments:`,
      {
        args: redactSensitiveData(call.arguments),
      },
    );
  }

  let output: unknown;
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `Tool '${call.name}' execution timed out after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);
    });

    const executionPromise = Promise.resolve(
      tool.execute(call.arguments, prompt.toolContext),
    );
    // Prevent unhandled rejection if timeoutPromise wins the race
    executionPromise.catch(() => {});

    output = await Promise.race([executionPromise, timeoutPromise]);
    console.info(
      `[AntigravityGenAi] Tool '${call.name}' completed successfully`,
    );
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[AntigravityGenAi] Tool '${call.name}' output:`, {
        output: redactSensitiveData(output),
      });
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[AntigravityGenAi] Tool '${call.name}' failed: ${errorMsg}`);
    output = { error: errorMsg };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }

  const serialized =
    typeof output === "string" ? output : JSON.stringify(output, null, 2);

  return `<tool_result name="${call.name}">\n${serialized}\n</tool_result>`;
}

/**
 * Removes any remaining tool call markup and strips extraneous whitespace.
 */
export function cleanOutputContent(raw: string): string {
  const stripped = raw.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "").trim();
  if (!stripped) {
    return DEFAULT_FALLBACK_RESPONSE;
  }
  return stripped;
}

/**
 * Coordinates multi-turn tool execution loop with agy.
 * Tracks global timeout budget across iterations to prevent hanging loops (SEC-05).
 */
export async function runToolCallingLoop(
  options: ExecuteAgyOptions,
  prompt: AiPrompt,
): Promise<string> {
  const totalMaxBudgetMs =
    options.totalMaxBudgetMs ??
    options.timeoutMs ??
    DEFAULT_ANTIGRAVITY_TIMEOUT_MS;
  const iterationTimeoutMs =
    options.timeoutMs ?? DEFAULT_TOOL_ITERATION_TIMEOUT_MS;
  const deadline = Date.now() + totalMaxBudgetMs;

  let currentPrompt = options.promptText;
  let lastResponse = "";

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const remainingBudget = deadline - Date.now();
    if (remainingBudget <= 0) {
      console.warn(
        `[AntigravityGenAi] Tool calling global budget exhausted (${totalMaxBudgetMs}ms). Stopping loop.`,
      );
      break;
    }

    const currentTimeoutMs = Math.min(remainingBudget, iterationTimeoutMs);

    const output = await executeAgyProcess({
      ...options,
      promptText: currentPrompt,
      timeoutMs: currentTimeoutMs,
    });

    const responseText = output.response || "";
    lastResponse = responseText;
    const toolCall = extractToolCall(responseText);

    if (!toolCall) {
      return cleanOutputContent(responseText);
    }

    console.info(
      `[AntigravityGenAi] Model requested tool call '${toolCall.name}' (iteration ${i + 1}/${MAX_TOOL_ITERATIONS})`,
    );

    const toolResult = await executeSingleTool(
      toolCall,
      prompt,
      currentTimeoutMs,
    );
    currentPrompt += `\n\nAssistant:\n${responseText}\n\n${toolResult}\n\nSystem: Continue your response based on the tool result. If you have enough information, answer the user.`;
  }

  const remainingBudgetForFinal = deadline - Date.now();
  if (remainingBudgetForFinal <= 0) {
    console.warn(
      `[AntigravityGenAi] Global timeout budget exhausted before final summary. Returning clean output from last response.`,
    );
    return cleanOutputContent(lastResponse);
  }

  console.warn(
    `[AntigravityGenAi] Reached maximum tool iterations (${MAX_TOOL_ITERATIONS}). Requesting final answer.`,
  );

  const terminationPrompt = `${currentPrompt}\n\nSystem: Maximum tool call limit reached. Do not call any more tools. Summarize and provide your best final response to the user with the information gathered so far.`;

  try {
    const finalOutput = await executeAgyProcess({
      ...options,
      promptText: terminationPrompt,
      timeoutMs: Math.min(remainingBudgetForFinal, iterationTimeoutMs),
    });

    return cleanOutputContent(finalOutput.response || "");
  } catch (err: unknown) {
    console.warn(
      `[AntigravityGenAi] Final summary generation failed, falling back to clean last response: ${err}`,
    );
    return cleanOutputContent(lastResponse);
  }
}

/**
 * GenAi provider implementation routing inference through the Google Antigravity CLI ('agy').
 * Allows leveraging Google One AI Pro subscriptions with zero per-token API cost.
 */
export class AntigravityGenAi implements GenAi {
  private initialized = false;
  private resolvedCommand = "";

  constructor(private readonly config: GenAiConfig) {}

  /**
   * Validates that the agy binary is present and executable.
   */
  public async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const command = resolveAgyCommand(this.config.antigravityCommand);
    try {
      await verifyAgyExecutable(command);
      this.resolvedCommand = command;
      this.initialized = true;
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Google Antigravity CLI ('agy') binary not found or not executable at "${command}". Ensure 'agy' is installed and authenticated via Google One AI Pro subscription, or specify ANTIGRAVITY_COMMAND / AGY_CLI_PATH. Details: ${detail}`,
      );
    }
  }

  /**
   * Generates AI responses using the Antigravity CLI subprocess.
   */
  public async generate(prompt: AiPrompt): Promise<AiPromptResponse> {
    if (!this.initialized) {
      await this.init();
    }

    const { model, effort } = parseModelAndEffort(
      this.config.modelId,
      this.config.antigravityEffort,
    );

    const attachments = await prepareAttachments(prompt.files);

    try {
      const systemInstruction =
        (this.config.systemInstruction || "") +
        (this.config.membersInstruction || "");

      const toolsInstruction = buildToolsInstruction(prompt.tools);
      const historyText = formatHistory(prompt.history);
      const attachmentsInstruction = formatAttachmentDescriptions(attachments);

      const promptText = buildFullPromptText({
        systemInstruction,
        toolsInstruction,
        historyText,
        attachmentsInstruction,
        userPromptText: prompt.text,
      });

      const timeoutMs =
        this.config.antigravityTimeoutMs || DEFAULT_ANTIGRAVITY_TIMEOUT_MS;

      const executeOptions: ExecuteAgyOptions = {
        command: this.resolvedCommand,
        model,
        effort,
        promptText,
        configDir: this.config.antigravityConfigDir,
        timeoutMs: DEFAULT_TOOL_ITERATION_TIMEOUT_MS,
        totalMaxBudgetMs: timeoutMs,
      };

      const content =
        prompt.tools && prompt.tools.length > 0
          ? await runToolCallingLoop(executeOptions, prompt)
          : cleanOutputContent(
              (
                await executeAgyProcess({
                  ...executeOptions,
                  timeoutMs,
                })
              ).response || "",
            );

      return {
        content,
        data: {
          provider: "antigravity",
          model,
          effort,
        },
      };
    } finally {
      await cleanupTemporaryAttachments(attachments);
    }
  }
}
