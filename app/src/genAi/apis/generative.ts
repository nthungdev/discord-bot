import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";
import { AiChatMessage } from "../../types";
import { getContext } from "../helpers";

/**
 * Uses @google/generative-ai API
 */
const generateContent = async (
  prompt: string,
  history: AiChatMessage[] = [],
) => {
  const genAI = new GoogleGenerativeAI(process.env.AI_API_KEY as string);

  // For text-only input, use the gemini-pro model
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro-latest",
    // model: "chat-bison-001",
    // model: "gemini-pro",
    // model: "chat-bison@001",
    // model: "gemini-1.0-pro-latest",
    systemInstruction: {
      text: getContext(),
    },
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
    ],
  });

  const chat = model.startChat({
    history: history.map(({ content, author }) => ({
      role: author === "bot" ? "model" : "user",
      parts: [{ text: content }],
    })),
    generationConfig: {
      maxOutputTokens: 4096, // 100 token -> 60-80 words
    },
  });

  const result = await chat.sendMessage(prompt);
  return {
    data: result.response,
    content: result.response.text(),
  };
};

export default generateContent;
