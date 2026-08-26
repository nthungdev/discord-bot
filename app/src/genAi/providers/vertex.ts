import {
  ClientError,
  FinishReason,
  GenerativeModel,
  InlineDataPart,
  SafetySetting,
  TextPart,
  VertexAI,
} from "@google-cloud/vertexai";
import { AiPrompt, AiPromptResponse } from "../../types";
import { getCredentials } from "../../utils/google";
import { GenAi, GenAiConfig } from "../types";
import { imageToBase64 } from "../../utils";
import { IGNORED_CONTENT } from "../helpers";

export class VertexGenAi implements GenAi {
  private aiAPI: GenerativeModel | undefined;

  constructor(private readonly config: GenAiConfig) {}

  async init() {
    const vertexAI = new VertexAI({
      apiEndpoint: this.config.apiEndpoint,
      project: this.config.projectId,
      location: this.config.locationId,
      googleAuthOptions: {
        credentials: await getCredentials(),
      },
    });

    const systemInstruction =
      this.config.systemInstruction + (this.config.membersInstruction || "");

    const model = vertexAI.getGenerativeModel({
      model: this.config.modelId,
      systemInstruction,
      generationConfig: {
        maxOutputTokens: this.config.maxOutputTokens,
      },
      safetySettings: this.config.safetySettings as SafetySetting[],
    });
    this.aiAPI = model;
  }

  async generate(prompt: AiPrompt): Promise<AiPromptResponse> {
    if (!this.aiAPI) {
      throw new Error("AI API not initialized");
    }

    const model = this.aiAPI;

    const { text, history = [], files = [] } = prompt;

    const chat = model.startChat({
      history: history.map(({ content, author }) => ({
        role: author === "bot" ? "model" : "user",
        parts: [{ text: content }],
      })),
    });

    const parts = [];

    for (const file of files) {
      if (file.mimeType.startsWith("image/")) {
        parts.push({
          inlineData: {
            data: await imageToBase64(file.uri),
            mimeType: file.mimeType,
          },
        } as InlineDataPart);
      }
      // TODO handle videos
    }

    if (text) {
      parts.push({ text } as TextPart);
    }

    try {
      const result = await chat.sendMessage(parts);

      // get valid candidate
      const candidate = result.response.candidates?.find((candidate) => {
        // response stopped due to violating some guidelines
        if (candidate.finishReason !== FinishReason.STOP) return false;

        return !!candidate.content.parts?.every((part) => {
          return !part.text?.includes(IGNORED_CONTENT);
        });
      });

      if (!candidate) {
        return { content: "", data: result.response };
      }

      const candidateText = candidate.content.parts.find(
        (part) => part.text,
      )?.text;

      if (!candidateText) {
        return { content: "", data: result.response };
      }

      return { content: candidateText, data: result.response };
    } catch (error: unknown) {
      if (error instanceof ClientError) {
        // TODO handle invalid argument error
        throw error;
      }
      throw error;
    }
  }

  private async _generate(
    model: GenerativeModel,
    prompt: AiPrompt,
  ): Promise<AiPromptResponse> {
    const { text, history = [], files = [] } = prompt;

    const chat = model.startChat({
      history: history.map(({ content, author }) => ({
        role: author === "bot" ? "model" : "user",
        parts: [{ text: content }],
      })),
    });

    const parts = [];

    for (const file of files) {
      if (file.mimeType.startsWith("image/")) {
        parts.push({
          inlineData: {
            data: await imageToBase64(file.uri),
            mimeType: file.mimeType,
          },
        } as InlineDataPart);
      }
      // TODO handle videos
    }

    if (text) {
      parts.push({ text } as TextPart);
    }

    try {
      const result = await chat.sendMessage(parts);

      // get valid candidate
      const candidate = result.response.candidates?.find((candidate) => {
        // response stopped due to violating some guidelines
        if (candidate.finishReason !== FinishReason.STOP) return false;

        return !!candidate.content.parts?.every((part) => {
          return !part.text?.includes(IGNORED_CONTENT);
        });
      });

      if (!candidate) {
        return { content: "", data: result.response };
      }

      const candidateText = candidate.content.parts.find(
        (part) => part.text,
      )?.text;

      if (!candidateText) {
        return { content: "", data: result.response };
      }

      return { content: candidateText, data: result.response };
    } catch (error: unknown) {
      if (error instanceof ClientError) {
        // TODO handle invalid argument error
        throw error;
      }
      throw error;
    }
  }
}
