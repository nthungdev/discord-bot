import type { GenAi, GenAiConfig } from "../types";
import { AntigravityGenAi } from "./antigravity";
import { MyGoogleGenAI } from "./google-genai";
import { VertexGenAi } from "./vertex";

const providerMap = {
  "google-genai": MyGoogleGenAI,
  vertex: VertexGenAi,
  antigravity: AntigravityGenAi,
} as const;

export type GenAiProviderName = keyof typeof providerMap;

export const createGenAi = (config: GenAiConfig): GenAi => {
  const Provider = providerMap[config.provider];

  if (!Provider) {
    throw new Error(`Unsupported GenAI provider: ${config.provider}`);
  }

  return new Provider(config);
};

export { AntigravityGenAi } from "./antigravity";
export { MyGoogleGenAI } from "./google-genai";
export { VertexGenAi } from "./vertex";
