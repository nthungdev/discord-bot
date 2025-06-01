import axios from "axios";
import { AiChatMessage } from "../../types";
import { getAccessToken } from "../../utils/google";
import { API_ENDPOINT, LOCATION_ID, MODEL_ID, PROJECT_ID } from "../config";
import { getContext } from "../helpers";

/**
 * Uses VertexAI RestAPI
 */
const generateContent = async (
  message: string,
  history: AiChatMessage[] = [],
) => {
  const token = await getAccessToken();

  const url = `https://${API_ENDPOINT}/v1/projects/${PROJECT_ID}/locations/${LOCATION_ID}/publishers/google/models/${MODEL_ID}:predict`;

  const requestData = {
    instances: [
      {
        context: getContext(),
        examples: [],
        messages: [
          ...history.map(({ content, author }) => ({
            content,
            author,
            ...(author === "bot"
              ? {
                  citationMetadata: {
                    citations: [],
                    sources: [],
                  },
                  groundingMetadata: {
                    citations: [],
                    sources: [],
                    references: [],
                  },
                }
              : {}),
          })),
          {
            author: "user",
            content: message,
          },
        ],
      },
    ],
    parameters: {
      candidateCount: 2,
      // maxOutputTokens: 1024,
      maxOutputTokens: 2048,
      // maxOutputTokens: 4096,
      temperature: 0.92,
      topP: 1,
    },
  };
  const requestJson = JSON.stringify(requestData);

  try {
    const response = await axios.post(url, requestJson, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    return {
      data: response.data,
      content: (
        (
          response.data.predictions[0].candidates
            // ignore prediction without result
            .find(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (c: any) =>
                !(c.content as string).includes(
                  `I'm not able to help with that, as I'm only a language model.`,
                ),
            ) ?? { content: "" }
        ).content as string
      ).trim(),
    };
  } catch (error) {
    console.log({ message, history });
    throw error;
  }
};

export default generateContent;
