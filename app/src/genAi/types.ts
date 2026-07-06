import { AiPrompt, AiPromptResponse } from "../types";

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
