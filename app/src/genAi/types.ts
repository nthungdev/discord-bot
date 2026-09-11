import type { AiPrompt, AiPromptResponse } from "../types";

export type SupportedClassifierModel =
  | "gemini-2.5-flash"
  | "gemini-3.5-flash-lite"
  | "gemini-3-flash-preview"
  | "gemini-3.5-flash"
  | "gemini-3.6-flash"
  | (string & {});

export type SupportedChatBotModel =
  | "gemini-3.5-flash-lite"
  | "gemini-3-flash-preview"
  | "gemini-3.5-flash"
  | "gemini-3.6-flash"
  | (string & {});

export type SupportedGenAiModel =
  | "gemini-2.5-flash"
  | "gemini-3.5-flash-lite"
  | "gemini-3-flash-preview"
  | "gemini-3.5-flash"
  | "gemini-3.6-flash"
  | (string & {});

export interface ModelConfig {
  /** AI Provider backend ('google-genai' | 'vertex') */
  provider?: "google-genai" | "vertex";
  /** Model identifier from the SupportedGenAiModel registry */
  modelId: SupportedGenAiModel;
  /** Sampling temperature (0.0 for deterministic classification, 0.7 for creative chat) */
  temperature?: number;
  /** Maximum output tokens limit */
  maxOutputTokens?: number;
  /** Nucleus sampling topP parameter */
  topP?: number;
}

export interface GenAiConfig {
  apiKey?: string;
  provider: "google-genai" | "vertex";
  apiEndpoint: string;
  projectId: string;
  locationId: string;
  modelId: string;
  maxOutputTokens: number;
  systemInstruction?: string;
  membersInstruction?: string;
  safetySettings?: {
    category: string;
    threshold: string;
  }[];
}

export interface GenAi {
  init(): Promise<void>;
  generate(prompt: AiPrompt): Promise<AiPromptResponse>;
}
