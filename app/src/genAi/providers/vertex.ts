import { SafetySetting, VertexAI } from "@google-cloud/vertexai";
import { AiPrompt, AiPromptResponse } from "../../types";
import { getCredentials } from "../../utils/google";
import * as vertexAi from "../apis/vertextAi";
import { GenAi, GenAiConfig } from "../types";

export class VertexGenAi implements GenAi {
  private aiAPI: VertexAI | undefined;

  constructor(private readonly config: GenAiConfig) {}

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

  async generate(prompt: AiPrompt): Promise<AiPromptResponse> {
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
