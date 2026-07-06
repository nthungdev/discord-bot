import { GoogleGenAI } from "@google/genai";
import { GenAi, GenAiConfig } from "../types";
import { AiPrompt, AiPromptResponse } from "../../types";

export class MyGoogleGenAI implements GenAi {
  private aiAPI: GoogleGenAI | undefined;

  constructor(private readonly config: GenAiConfig) {}

  async init() {
    this.aiAPI = new GoogleGenAI({
      apiKey: this.config.apiKey,
    });
  }

  async generate(prompt: AiPrompt): Promise<AiPromptResponse> {
    if (!this.aiAPI) {
      throw new Error("AI API not initialized");
    }

    const interaction = await this.aiAPI.interactions.create({
      model: this.config.modelId,
      input: prompt.text,
      system_instruction: this.getSystemInstruction(),
    });

    return {
      content: interaction.output_text || "",
    };
  }

  private getSystemInstruction(): string {
    return this.config.systemInstruction + (this.config.membersInstruction || "");
  }
}
