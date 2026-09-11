import {
  type FunctionDeclaration,
  type GenerateContentResponse,
  GoogleGenAI,
  type Part,
  type Tool,
} from "@google/genai";
import type { AiPrompt, AiPromptResponse } from "../../types";
import type { GenAi, GenAiConfig } from "../types";

const MAX_TOOL_ITERATIONS = 7;

/**
 * This class implements the GenAi interface for the Google GenAI provider.
 * Supports Google Search and dynamic Function Calling tools.
 */
/**
 * Builds tools configuration including Google Search and custom functions.
 */
function buildToolsConfig(prompt: AiPrompt): Tool[] {
  const toolsConfig: Tool[] = [];
  if (prompt.enableGoogleSearch) {
    toolsConfig.push({ googleSearch: {} });
  }
  if (prompt.tools && prompt.tools.length > 0) {
    const functionDeclarations = prompt.tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters as unknown as FunctionDeclaration["parameters"],
    }));
    toolsConfig.push({ functionDeclarations });
  }
  return toolsConfig;
}

/**
 * Executes a single function call against provided tool definitions and context.
 */
async function executeSingleToolCall(
  call: { name?: string; args?: unknown },
  prompt: AiPrompt,
): Promise<Part> {
  const tool = prompt.tools?.find((t) => t.name === call.name);
  let output: unknown;

  if (tool && prompt.toolContext) {
    console.info(`[GoogleGenAI] Invoking tool: ${call.name}`, {
      args: call.args,
    });
    try {
      output = await tool.execute(
        (call.args as Record<string, unknown>) ?? {},
        prompt.toolContext,
      );
      console.info(`[GoogleGenAI] Tool '${call.name}' completed`, { output });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[GoogleGenAI] Tool '${call.name}' failed: ${errorMsg}`);
      output = { error: errorMsg };
    }
  } else {
    console.warn(
      `[GoogleGenAI] Tool '${call.name}' not found or no tool context provided.`,
    );
    output = {
      error: `Tool ${call.name} not found or no tool context provided.`,
    };
  }

  return {
    functionResponse: {
      name: call.name ?? "",
      response: { output },
    },
  };
}

/**
 * Executes the multi-turn tool calling loop until model produces text or reaches max iterations.
 */
async function runToolCallingLoop(
  chat: ReturnType<GoogleGenAI["chats"]["create"]>,
  prompt: AiPrompt,
  initialResponse: Awaited<ReturnType<typeof chat.sendMessage>>,
): Promise<Awaited<ReturnType<typeof chat.sendMessage>>> {
  let response = initialResponse;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const functionCalls = response.functionCalls;
    if (!functionCalls || functionCalls.length === 0) {
      break;
    }

    console.info(
      `[GoogleGenAI] Model requested ${functionCalls.length} tool call(s) on iteration ${i + 1}:`,
      functionCalls.map((c) => c.name),
    );

    const responseParts: Part[] = [];
    for (const call of functionCalls) {
      const part = await executeSingleToolCall(call, prompt);
      responseParts.push(part);
    }

    response = await chat.sendMessage({ message: responseParts });
  }

  // Gracefully handle case where loop exited with pending functionCalls and no text
  if (response.functionCalls && response.functionCalls.length > 0) {
    console.warn(
      `[GoogleGenAI] Reached maximum tool iterations (${MAX_TOOL_ITERATIONS}) with pending function calls. Requesting final answer.`,
    );
    const terminationParts: Part[] = response.functionCalls.map((call) => ({
      functionResponse: {
        name: call.name ?? "",
        response: {
          error:
            "Maximum tool call limit reached. Do not call any more tools. Summarize and provide your best final response to the user with the information gathered so far.",
        },
      },
    }));
    try {
      response = await chat.sendMessage({ message: terminationParts });
    } catch (err) {
      console.error(
        "[GoogleGenAI] Failed to get final text after tool limit:",
        err,
      );
    }
  }

  return response;
}

/**
 * Extracts and sanitizes the final text response content.
 */
function extractResponseContent(response: GenerateContentResponse): string {
  let content = "";
  try {
    content = response.text || "";
  } catch {
    content = "";
  }

  if (!content.trim()) {
    return "Xin lỗi, hiện tại mình không thể thu thập đủ thông tin để trả lời câu hỏi này.";
  }

  return content;
}

export class MyGoogleGenAI implements GenAi {
  private aiAPI: GoogleGenAI | undefined;

  constructor(private readonly config: GenAiConfig) {}

  async init() {
    this.aiAPI = new GoogleGenAI({
      apiKey: this.config.apiKey,
    });
  }

  async generate(prompt: AiPrompt): Promise<AiPromptResponse> {
    if (!this.aiAPI) {
      throw new Error("AI API not initialized");
    }

    const toolsConfig = buildToolsConfig(prompt);

    const chat = this.aiAPI.chats.create({
      model: this.config.modelId,
      config: {
        systemInstruction: this.getSystemInstruction(),
        maxOutputTokens: this.config.maxOutputTokens,
        ...(toolsConfig.length > 0
          ? {
              tools: toolsConfig,
              toolConfig: {
                includeServerSideToolInvocations: true,
              },
            }
          : {}),
      },
    });

    const initialResponse = await chat.sendMessage({ message: prompt.text });
    const finalResponse = await runToolCallingLoop(
      chat,
      prompt,
      initialResponse,
    );
    const content = extractResponseContent(finalResponse);

    return {
      content,
      data: finalResponse,
    };
  }

  private getSystemInstruction(): string {
    return (
      (this.config.systemInstruction || "") +
      (this.config.membersInstruction || "")
    );
  }
}
