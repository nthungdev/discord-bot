import { SafetySetting, VertexAI } from "@google-cloud/vertexai";
import { generateContent } from "./apis/vertextAi";
import { getCredentials } from "../utils/google";
import * as vertexAi from "./apis/vertextAi";
import { AiPrompt } from "../types";

export interface GenAiConfig {
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

export class GenAi {
  config: GenAiConfig;
  private aiAPI: VertexAI | undefined;

  constructor(config: GenAiConfig) {
    this.config = config;
  }

  async init() {
    this.aiAPI = new VertexAI({
      apiEndpoint: this.config.apiEndpoint,
      project: this.config.projectId,
      location: this.config.locationId,
      googleAuthOptions: {
        credentials: await getCredentials(),
      },
    });
  }

  async generate(prompt: AiPrompt) {
    if (!this.aiAPI) {
      throw new Error("AI API not initialized");
    }

    const systemInstruction =
      this.config.systemInstruction + (this.config.membersInstruction || "");

    const model = this.aiAPI.getGenerativeModel({
      model: this.config.modelId,
      systemInstruction,
      generationConfig: {
        maxOutputTokens: this.config.maxOutputTokens,
      },
      safetySettings: this.config.safetySettings as SafetySetting[],
    });

    return vertexAi.generate(model, prompt);
  }
}

export {
  /**
   * @deprecated
   */
  generateContent,
};
