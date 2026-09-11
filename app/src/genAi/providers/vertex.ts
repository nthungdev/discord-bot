import {
  ClientError,
  FinishReason,
  type FunctionDeclarationSchema,
  type GenerativeModel,
  type InlineDataPart,
  type SafetySetting,
  type TextPart,
  VertexAI,
} from "@google-cloud/vertexai";
import type { AiPrompt, AiPromptResponse } from "../../types";
import { imageToBase64 } from "../../utils";
import { getCredentials } from "../../utils/google";
import { IGNORED_CONTENT } from "../helpers";
import type { GenAi, GenAiConfig } from "../types";

export class VertexGenAi implements GenAi {
  private vertexAI: VertexAI | undefined;
  private aiAPI: GenerativeModel | undefined;

  constructor(private readonly config: GenAiConfig) {}

  async init() {
    this.vertexAI = new VertexAI({
      apiEndpoint: this.config.apiEndpoint,
      project: this.config.projectId,
      location: this.config.locationId,
      googleAuthOptions: {
        credentials: await getCredentials(),
      },
    });

    const systemInstruction =
      this.config.systemInstruction + (this.config.membersInstruction || "");

    const model = this.vertexAI.getGenerativeModel({
      model: this.config.modelId,
      systemInstruction,
      generationConfig: {
        maxOutputTokens: this.config.maxOutputTokens,
      },
      safetySettings: this.config.safetySettings as SafetySetting[],
    });
    this.aiAPI = model;
  }

  async generate(prompt: AiPrompt): Promise<AiPromptResponse> {
    if (!(this.aiAPI && this.vertexAI)) {
      throw new Error("AI API not initialized");
    }

    let model = this.aiAPI;

    if (prompt.tools && prompt.tools.length > 0) {
      const systemInstruction =
        this.config.systemInstruction + (this.config.membersInstruction || "");
      const functionDeclarations = prompt.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters as unknown as FunctionDeclarationSchema,
      }));

      model = this.vertexAI.getGenerativeModel({
        model: this.config.modelId,
        systemInstruction,
        generationConfig: {
          maxOutputTokens: this.config.maxOutputTokens,
        },
        safetySettings: this.config.safetySettings as SafetySetting[],
        tools: [{ functionDeclarations }],
      });
    }

    const { text, history = [], files = [] } = prompt;

    const chat = model.startChat({
      history: history.map(({ content, author }) => ({
        role: author === "bot" ? "model" : "user",
        parts: [{ text: content }],
      })),
    });

    const parts = [];

    for (const file of files) {
      if (file.mimeType.startsWith("image/")) {
        parts.push({
          inlineData: {
            data: await imageToBase64(file.uri),
            mimeType: file.mimeType,
          },
        } as InlineDataPart);
      }
      // TODO handle videos
    }

    if (text) {
      parts.push({ text } as TextPart);
    }

    try {
      let result = await chat.sendMessage(parts);
      const MAX_TOOL_ITERATIONS = 7;

      for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
        const candidate = result.response.candidates?.[0];
        const functionCallParts = candidate?.content?.parts?.filter(
          (part) => "functionCall" in part && Boolean(part.functionCall),
        ) as
          | {
              functionCall: {
                name: string;
                args: Record<string, unknown>;
              };
            }[]
          | undefined;

        if (!functionCallParts || functionCallParts.length === 0) {
          break;
        }

        console.info(
          `[VertexGenAI] Model requested ${functionCallParts.length} tool call(s) on iteration ${i + 1}:`,
          functionCallParts.map((p) => p.functionCall.name),
        );

        const responseParts = [];
        for (const callPart of functionCallParts) {
          const call = callPart.functionCall;
          const tool = prompt.tools?.find((t) => t.name === call.name);
          let output: unknown;
          if (tool && prompt.toolContext) {
            console.info(`[VertexGenAI] Invoking tool: ${call.name}`, {
              args: call.args,
            });
            try {
              output = await tool.execute(call.args ?? {}, prompt.toolContext);
              console.info(`[VertexGenAI] Tool '${call.name}' completed`, {
                output,
              });
            } catch (err: unknown) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              console.error(
                `[VertexGenAI] Tool '${call.name}' failed: ${errorMsg}`,
              );
              output = { error: errorMsg };
            }
          } else {
            console.warn(
              `[VertexGenAI] Tool '${call.name}' not found or no tool context provided.`,
            );
            output = {
              error: `Tool ${call.name} not found or no tool context provided.`,
            };
          }

          responseParts.push({
            functionResponse: {
              name: call.name,
              response: { output },
            },
          });
        }

        result = await chat.sendMessage(
          responseParts as unknown as (InlineDataPart | TextPart)[],
        );
      }

      // If loop exited with pending functionCalls, gracefully send termination responses
      const latestCandidate = result.response.candidates?.[0];
      const pendingCalls = latestCandidate?.content?.parts?.filter(
        (part) => "functionCall" in part && Boolean(part.functionCall),
      ) as
        | {
            functionCall: {
              name: string;
              args: Record<string, unknown>;
            };
          }[]
        | undefined;

      if (pendingCalls && pendingCalls.length > 0) {
        console.warn(
          `[VertexGenAI] Reached maximum tool iterations (${MAX_TOOL_ITERATIONS}) with pending function calls. Requesting final answer.`,
        );
        const terminationParts = pendingCalls.map((p) => ({
          functionResponse: {
            name: p.functionCall.name,
            response: {
              error:
                "Maximum tool call limit reached. Do not call any more tools. Summarize and provide your best final response to the user with the information gathered so far.",
            },
          },
        }));
        try {
          result = await chat.sendMessage(
            terminationParts as unknown as (InlineDataPart | TextPart)[],
          );
        } catch (err) {
          console.error(
            "[VertexGenAI] Failed to get final text after tool limit:",
            err,
          );
        }
      }

      // get valid candidate
      const candidate = result.response.candidates?.find((candidate) => {
        // response stopped due to violating some guidelines
        if (
          candidate.finishReason &&
          candidate.finishReason !== FinishReason.STOP
        )
          return false;

        return !!candidate.content.parts?.every((part) => {
          return !part.text?.includes(IGNORED_CONTENT);
        });
      });

      if (!candidate) {
        return {
          content: "Xin lỗi, hiện tại mình không thể xử lý yêu cầu này.",
          data: result.response,
        };
      }

      const candidateText = candidate.content.parts.find(
        (part) => part.text,
      )?.text;

      return {
        content:
          candidateText ||
          "Xin lỗi, hiện tại mình không thể thu thập đủ thông tin để trả lời câu hỏi này.",
        data: result.response,
      };
    } catch (error: unknown) {
      if (error instanceof ClientError) {
        // TODO handle invalid argument error
        throw error;
      }
      throw error;
    }
  }

  private async _generate(
    model: GenerativeModel,
    prompt: AiPrompt,
  ): Promise<AiPromptResponse> {
    const { text, history = [], files = [] } = prompt;

    const chat = model.startChat({
      history: history.map(({ content, author }) => ({
        role: author === "bot" ? "model" : "user",
        parts: [{ text: content }],
      })),
    });

    const parts = [];

    for (const file of files) {
      if (file.mimeType.startsWith("image/")) {
        parts.push({
          inlineData: {
            data: await imageToBase64(file.uri),
            mimeType: file.mimeType,
          },
        } as InlineDataPart);
      }
      // TODO handle videos
    }

    if (text) {
      parts.push({ text } as TextPart);
    }

    try {
      const result = await chat.sendMessage(parts);

      // get valid candidate
      const candidate = result.response.candidates?.find((candidate) => {
        // response stopped due to violating some guidelines
        if (candidate.finishReason !== FinishReason.STOP) return false;

        return !!candidate.content.parts?.every((part) => {
          return !part.text?.includes(IGNORED_CONTENT);
        });
      });

      if (!candidate) {
        return { content: "", data: result.response };
      }

      const candidateText = candidate.content.parts.find(
        (part) => part.text,
      )?.text;

      if (!candidateText) {
        return { content: "", data: result.response };
      }

      return { content: candidateText, data: result.response };
    } catch (error: unknown) {
      if (error instanceof ClientError) {
        // TODO handle invalid argument error
        throw error;
      }
      throw error;
    }
  }
}
