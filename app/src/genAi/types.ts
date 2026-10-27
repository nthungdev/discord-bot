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
  | "gemini-3.8-flash-high"
  | "gemini-3.8-flash-medium"
  | "gemini-3.8-flash-low"
  | "gemini-3.8-flash"
  | "gemini-4-argon-high"
  | "gemini-4-argon-medium"
  | "gemini-4-argon-low"
  | "claude-sonnet-5-5-high"
  | "claude-opus-5-5-high"
  | "gpt-oss-120b-medium"
  | (string & {});

export type SupportedGenAiModel =
  | "gemini-2.5-flash"
  | "gemini-3.5-flash-lite"
  | "gemini-3-flash-preview"
  | "gemini-3.5-flash"
  | "gemini-3.6-flash"
  | "gemini-3.8-flash-high"
  | "gemini-3.8-flash-medium"
  | "gemini-3.8-flash-low"
  | "gemini-3.8-flash"
  | "gemini-4-argon-high"
  | "gemini-4-argon-medium"
  | "gemini-4-argon-low"
  | "claude-sonnet-5-5-high"
  | "claude-opus-5-5-high"
  | "gpt-oss-120b-medium"
  | (string & {});

export interface ModelConfig {
  /** AI Provider backend ('google-genai' | 'vertex' | 'antigravity') */
  provider?: "google-genai" | "vertex" | "antigravity";
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
  provider: "google-genai" | "vertex" | "antigravity";
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
  antigravityCommand?: string;
  antigravityConfigDir?: string;
  antigravityEffort?: string;
  antigravityTimeoutMs?: number;
}

export interface GenAi {
  init(): Promise<void>;
  generate(prompt: AiPrompt): Promise<AiPromptResponse>;
}
