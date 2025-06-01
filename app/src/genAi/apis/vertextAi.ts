import {
  ClientError,
  FinishReason,
  GenerativeModel,
  HarmBlockThreshold,
  HarmCategory,
  InlineDataPart,
  TextPart,
  VertexAI,
} from "@google-cloud/vertexai";
import { AiPrompt, AiPromptResponse } from "../../types";
import { getCredentials } from "../../utils/google";
import { LOCATION_ID, PROJECT_ID } from "../config";
import { imageToBase64 } from "../../utils";
import { IGNORED_CONTENT, getContext } from "../helpers";

export const generate = async (
  model: GenerativeModel,
  prompt: AiPrompt,
): Promise<AiPromptResponse> => {
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
};

/**
 * Uses "@google-cloud/vertexai" API
 */
export const generateContent = async (
  prompt: AiPrompt,
): Promise<AiPromptResponse> => {
  // const model = 'gemini-1.0-pro-vision-001'
  const model = "gemini-1.5-pro";

  // Initialize Vertex with your Cloud project and location
  const vertexAI = new VertexAI({
    project: PROJECT_ID,
    location: LOCATION_ID,
    googleAuthOptions: {
      credentials: await getCredentials(),
    },
  });

  // Instantiate the model
  const generativeVisionModel = vertexAI.getGenerativeModel({
    model,
    systemInstruction: getContext(),
    generationConfig: {
      maxOutputTokens: 8192,
    },
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
    ],
  });

  return generate(generativeVisionModel, prompt);
};
