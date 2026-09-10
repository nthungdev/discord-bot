import { GoogleGenAI, FunctionDeclaration, Part, Tool } from "@google/genai";
import { GenAi, GenAiConfig } from "../types";
import { AiPrompt, AiPromptResponse } from "../../types";

const MAX_TOOL_ITERATIONS = 5;

/**
 * This class implements the GenAi interface for the Google GenAI provider.
 * Supports Google Search and dynamic Function Calling tools.
 */
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

    const toolsConfig: Tool[] = [{ googleSearch: {} }];
    if (prompt.tools && prompt.tools.length > 0) {
      const functionDeclarations = prompt.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters as unknown as FunctionDeclaration["parameters"],
      }));
      toolsConfig.push({ functionDeclarations });
    }

    const chat = this.aiAPI.chats.create({
      model: this.config.modelId,
      config: {
        systemInstruction: this.getSystemInstruction(),
        maxOutputTokens: this.config.maxOutputTokens,
        tools: toolsConfig,
        toolConfig: {
          includeServerSideToolInvocations: true,
        }
      },
    });

    let response = await chat.sendMessage({ message: prompt.text });

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
        const tool = prompt.tools?.find((t) => t.name === call.name);
        let output: unknown;
        if (tool && prompt.toolContext) {
          console.info(`[GoogleGenAI] Invoking tool: ${call.name}`, { args: call.args });
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
          console.warn(`[GoogleGenAI] Tool '${call.name}' not found or no tool context provided.`);
          output = {
            error: `Tool ${call.name} not found or no tool context provided.`,
          };
        }

        responseParts.push({
          functionResponse: {
            name: call.name ?? "",
            response: { output },
          },
        });
      }

      response = await chat.sendMessage({
        message: responseParts,
      });
    }

    return {
      content: response.text || "",
      data: response,
    };
  }

  private getSystemInstruction(): string {
    return (
      (this.config.systemInstruction || "") +
      (this.config.membersInstruction || "")
    );
  }
}

