/**
 * Streaming GenAI Session Interfaces and Events for Bidirectional Live Voice Interaction.
 */

import type { EventEmitter } from "node:events";
import type { ToolExecutionContext } from "../../../tools/types";
import type { SupportedGeminiVoice } from "../constants";

export interface StreamingSessionConfig {
  readonly apiKey?: string;
  readonly modelId?: string;
  readonly voiceName?: SupportedGeminiVoice;
  readonly systemInstruction?: string;
  readonly toolContext?: ToolExecutionContext;
  readonly enableTools?: boolean;
}

export interface LiveContentPart {
  readonly text?: string;
  readonly inlineData?: {
    readonly mimeType: string;
    readonly data: string; // Base64
  };
}

export interface LiveContentTurn {
  readonly role: "user" | "model" | "system";
  readonly parts: LiveContentPart[];
}

export interface LiveFunctionCall {
  readonly id?: string;
  readonly name: string;
  readonly args: Record<string, unknown>;
}

export interface LiveFunctionResponse {
  readonly id?: string;
  readonly name: string;
  readonly response: {
    readonly output: unknown;
  };
}

export interface StreamingSessionEvents {
  /** Emitted when model sends raw 24kHz mono PCM audio */
  audio: (pcmBuffer: Buffer) => void;
  /** Emitted when model sends text transcription or reasoning */
  text: (text: string) => void;
  /** Emitted when model turn is complete */
  turnComplete: () => void;
  /** Emitted when server-side interruption / barge-in is detected */
  interrupted: () => void;
  /** Emitted when model requests mid-stream tool execution */
  toolCall: (calls: LiveFunctionCall[]) => void;
  /** Emitted on session error */
  error: (err: Error) => void;
  /** Emitted when live connection closes */
  close: (code?: number, reason?: string) => void;
}

/**
 * Contract for Bidirectional Live Voice AI Sessions.
 */
export interface IStreamingGenAiSession extends EventEmitter {
  /** Connects live bidirectional WebSocket session */
  connect(config: StreamingSessionConfig): Promise<void>;

  /** Streams a 16kHz mono PCM chunk to the model via realtimeInput */
  sendAudioChunk(pcmChunk16kMono: Buffer): void;

  /** Injects structured conversation turns / speaker tags into model context */
  sendClientContent(turns: LiveContentTurn[], turnComplete?: boolean): void;

  /** Sends function execution responses back to model mid-stream */
  sendToolResponse(responses: LiveFunctionResponse[]): void;

  /** Closes active live session and releases WebSocket resources */
  close(): Promise<void>;

  /** Whether the session is currently connected and active */
  isConnected(): boolean;
}
