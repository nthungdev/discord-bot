/**
 * Gemini Live Multimodal WebSocket Streaming Session Implementation.
 * Wraps @google/genai client.live.connect for bidirectional full-duplex voice streaming.
 */

import { EventEmitter } from "node:events";
import {
  GoogleGenAI,
  type LiveServerMessage,
  Modality,
  type Tool,
} from "@google/genai";
import { getToolRegistry } from "../../../tools/registry";
import { resolveProviderApiKey } from "../../../utils/genAi";
import { DEFAULT_GEMINI_LIVE_MODEL, DEFAULT_VOICE_NAME } from "../constants";
import { buildFunctionDeclarations, executeToolCalls } from "./tool-bridge";
import type {
  IStreamingGenAiSession,
  LiveContentTurn,
  LiveFunctionCall,
  LiveFunctionResponse,
  StreamingSessionConfig,
} from "./types";

interface LiveSessionHandle {
  sendRealtimeInput(params: {
    audio?: { data: string; mimeType: string };
    media?: { data: string; mimeType: string };
  }): void;
  sendClientContent(params: {
    turns?: unknown[];
    turnComplete?: boolean;
  }): void;
  sendToolResponse(params: { functionResponses: unknown[] }): void;
  close(): Promise<void> | void;
}

export class GeminiLiveSession
  extends EventEmitter
  implements IStreamingGenAiSession
{
  private session: LiveSessionHandle | null = null;
  private connected = false;
  private currentConfig: StreamingSessionConfig | null = null;

  /**
   * Connects bidirectional WebSocket streaming session with Gemini Live API.
   */
  public async connect(config: StreamingSessionConfig): Promise<void> {
    this.currentConfig = config;
    const apiKey = config.apiKey || this.resolveGlobalApiKey();

    if (!apiKey) {
      throw new Error(
        "Gemini API key is required to start Gemini Live voice session.",
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = config.modelId || DEFAULT_GEMINI_LIVE_MODEL;
    const voiceName = config.voiceName || DEFAULT_VOICE_NAME;

    // Build tools if enabled
    const tools: Tool[] = [];
    if (config.enableTools !== false && config.toolContext) {
      const availableTools = await getToolRegistry().getAvailableTools(
        config.toolContext,
      );
      if (availableTools.length > 0) {
        tools.push({
          functionDeclarations: buildFunctionDeclarations(availableTools),
        });
      }
    }

    try {
      this.session = (await ai.live.connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
          systemInstruction: config.systemInstruction
            ? {
                parts: [{ text: config.systemInstruction }],
              }
            : undefined,
          tools: tools.length > 0 ? tools : undefined,
        },
        callbacks: {
          onopen: () => {
            console.info(
              "[GeminiLiveSession] WebSocket connection established.",
            );
          },
          onmessage: (message: LiveServerMessage) => {
            void this.handleIncomingMessage(
              message as unknown as Record<string, unknown>,
            );
          },
          onerror: (err: unknown) => {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error("[GeminiLiveSession] WebSocket error:", error);
            this.emit("error", error);
          },
          onclose: (event: unknown) => {
            this.connected = false;
            this.session = null;
            const code = (event as { code?: number })?.code;
            const reason = (event as { reason?: string })?.reason;
            console.info("[GeminiLiveSession] WebSocket closed:", {
              code,
              reason,
            });
            this.emit("close", code, reason);
          },
        },
      })) as unknown as LiveSessionHandle;

      this.connected = true;
      console.info(
        `[GeminiLiveSession] Session active for model '${model}' (Voice: ${voiceName})`,
      );
    } catch (err: unknown) {
      this.connected = false;
      this.session = null;
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(
        "[GeminiLiveSession] Failed to connect live session:",
        error,
      );
      throw error;
    }
  }

  /**
   * Streams a 16kHz mono PCM audio chunk to the model.
   */
  public sendAudioChunk(pcmChunk16kMono: Buffer): void {
    if (!(this.connected && this.session)) {
      return;
    }

    const base64Audio = pcmChunk16kMono.toString("base64");
    this.session.sendRealtimeInput({
      audio: {
        data: base64Audio,
        mimeType: "audio/pcm;rate=16000",
      },
    });
  }

  /**
   * Injects structured user/system turns or speaker attribution tags.
   */
  public sendClientContent(
    turns: LiveContentTurn[],
    turnComplete = false,
  ): void {
    if (!(this.connected && this.session)) {
      return;
    }

    this.session.sendClientContent({
      turns: turns as unknown[],
      turnComplete,
    });
  }

  /**
   * Sends function execution outputs back to the model.
   */
  public sendToolResponse(responses: LiveFunctionResponse[]): void {
    if (!(this.connected && this.session)) {
      return;
    }

    this.session.sendToolResponse({
      functionResponses: responses.map((r) => ({
        id: r.id,
        name: r.name,
        response: r.response,
      })),
    });
  }

  /**
   * Closes active streaming session and releases resources.
   */
  public async close(): Promise<void> {
    if (this.session) {
      try {
        await this.session.close();
      } catch (err) {
        console.warn("[GeminiLiveSession] Error closing session:", err);
      }
    }
    this.connected = false;
    this.session = null;
    this.currentConfig = null;
  }

  /**
   * Returns whether the session is currently active.
   */
  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Dispatches incoming WebSocket messages into audio chunks, text, interruptions, and tool calls.
   */
  private async handleIncomingMessage(
    message: Record<string, unknown>,
  ): Promise<void> {
    const serverContent = message.serverContent as
      | Record<string, unknown>
      | undefined;
    if (serverContent) {
      this.handleServerContent(serverContent);
    }

    const toolCall = message.toolCall as
      | {
          functionCalls?: {
            id?: string;
            name: string;
            args?: Record<string, unknown>;
          }[];
        }
      | undefined;
    if (toolCall?.functionCalls && toolCall.functionCalls.length > 0) {
      await this.handleToolCalls(toolCall.functionCalls);
    }
  }

  private handleServerContent(serverContent: Record<string, unknown>): void {
    if (serverContent.interrupted) {
      this.emit("interrupted");
    }

    const modelTurn = serverContent.modelTurn as
      | { parts?: unknown[] }
      | undefined;
    if (modelTurn?.parts) {
      this.dispatchModelParts(modelTurn.parts);
    }

    if (serverContent.turnComplete) {
      this.emit("turnComplete");
    }
  }

  private dispatchModelParts(parts: unknown[]): void {
    for (const part of parts) {
      const item = part as {
        text?: string;
        inlineData?: { mimeType?: string; data?: string };
      };

      if (item.inlineData?.data) {
        const pcmBuffer = Buffer.from(item.inlineData.data, "base64");
        this.emit("audio", pcmBuffer);
      }

      if (item.text) {
        this.emit("text", item.text);
      }
    }
  }

  private async handleToolCalls(
    functionCalls: {
      id?: string;
      name: string;
      args?: Record<string, unknown>;
    }[],
  ): Promise<void> {
    const calls: LiveFunctionCall[] = functionCalls.map((c) => ({
      id: c.id,
      name: c.name,
      args: c.args ?? {},
    }));

    this.emit("toolCall", calls);

    if (this.currentConfig?.toolContext) {
      const responses = await executeToolCalls(
        calls,
        this.currentConfig.toolContext,
      );
      this.sendToolResponse(responses);
    }
  }

  private resolveGlobalApiKey(): string | undefined {
    return resolveProviderApiKey("gemini");
  }
}
