import type { AiPrompt, AiPromptResponse } from "../types";

export type SupportedGenAiModel =
  | "gemini-2.5-flash-lite"
  | "gemini-2.5-flash"
  | "gemini-2.5-pro"
  | "gemini-3.6-flash"
  | "gemini-2.0-flash"
  | "gemini-1.5-flash-8b"
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
