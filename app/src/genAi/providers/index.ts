import { GenAi } from "../types";
import { GenAiConfig } from "../types";
import { MyGoogleGenAI } from "./google-genai";
import { VertexGenAi } from "./vertex";

const providerMap = {
  "google-genai": MyGoogleGenAI,
  vertex: VertexGenAi,
} as const;

export type GenAiProviderName = keyof typeof providerMap;

export const createGenAi = (config: GenAiConfig): GenAi => {
  const Provider = providerMap[config.provider];

  if (!Provider) {
    throw new Error(`Unsupported GenAI provider: ${config.provider}`);
  }

  return new Provider(config);
};

export { MyGoogleGenAI } from "./google-genai";
export { VertexGenAi } from "./vertex";