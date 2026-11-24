import type { AiPrompt, AiPromptResponse } from "../types";

export type SupportedClassifierModel =
  | "gemini-2.5-flash"
  | "gemini-3.5-flash-lite"
  | "gemini-3-flash-preview"
  | "gemini-3.5-flash"
  | "gemini-4-hydrogen"
  | "gemini-4-hydrogen-low"
  | (string & {});

export type SupportedChatBotModel =
  | "gemini-3.5-flash-lite"
  | "gemini-3-flash-preview"
  | "gemini-3.5-flash"
  | "gemini-4-hydrogen"
  | "gemini-4-hydrogen-low"
  | "gemini-4-hydrogen-medium"
  | "gemini-4-hydrogen-high"
  | "gemini-4-hydrogen-xhigh"
  | "gemini-4-argon"
  | "gemini-4-argon-high"
  | "gemini-4-argon-medium"
  | "gemini-4-argon-low"
  | "gemini-4-neon"
  | "gemini-4-neon-low"
  | "gemini-4-neon-medium"
  | "gemini-4-neon-high"
  | "gemini-4-neon-xhigh"
  | "gemini-4-carbon"
  | "gemini-4-carbon-low"
  | "gemini-4-carbon-medium"
  | "gemini-4-carbon-high"
  | "claude-sonnet-5-5-high"
  | "claude-opus-5-5-high"
  | "gpt-oss-120b-medium"
  | (string & {});

export type SupportedGenAiModel =
  | "gemini-2.5-flash"
  | "gemini-3.5-flash-lite"
  | "gemini-3-flash-preview"
  | "gemini-3.5-flash"
  | "gemini-4-hydrogen"
  | "gemini-4-hydrogen-low"
  | "gemini-4-hydrogen-medium"
  | "gemini-4-hydrogen-high"
  | "gemini-4-hydrogen-xhigh"
  | "gemini-4-argon"
  | "gemini-4-argon-high"
  | "gemini-4-argon-medium"
  | "gemini-4-argon-low"
  | "gemini-4-neon"
  | "gemini-4-neon-low"
  | "gemini-4-neon-medium"
  | "gemini-4-neon-high"
  | "gemini-4-neon-xhigh"
  | "gemini-4-carbon"
  | "gemini-4-carbon-low"
  | "gemini-4-carbon-medium"
  | "gemini-4-carbon-high"
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
  temperature?: number;
  topP?: number;
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
