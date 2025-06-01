import { PredictionServiceClient, helpers } from "@google-cloud/aiplatform";
import { google } from "@google-cloud/aiplatform/build/protos/protos";
import { AiChatMessage } from "../../types";
import { getCredentials } from "../../utils/google";
import { LOCATION_ID, MODEL_ID, PROJECT_ID } from "../config";
import { getContext } from "../helpers";

/**
 * Uses @google-cloud/aiplatform API
 */
const generateContent = async (
  prompt: string,
  history: AiChatMessage[] = [],
) => {
  const credentials = await getCredentials();
  const predictionServiceClient = new PredictionServiceClient({
    apiEndpoint: "us-central1-aiplatform.googleapis.com",
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
  });

  const endpoint = `projects/${PROJECT_ID}/locations/${LOCATION_ID}/publishers/google/models/${MODEL_ID}`;

  const instances = [
    helpers.toValue({
      context: getContext(),
      example: [],
      messages: [
        ...history,
        {
          author: "user",
          content: prompt,
        },
      ],
    }),
  ];

  const parameters = helpers.toValue({
    candidateCount: 2,
    // maxOutputTokens: 1024,
    maxOutputTokens: 2048,
    // maxOutputTokens: 4096,
    temperature: 0.92,
    topP: 1,
  });

  const request = {
    endpoint,
    instances,
    parameters,
  } as google.cloud.aiplatform.v1.IPredictRequest;

  try {
    const [response] = await predictionServiceClient.predict(request);
    const prediction =
      (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response.predictions?.[0].structValue?.fields?.candidates?.listValue
          ?.values as any[]
      )
        ?.find(
          (value) =>
            !value.structValue?.fields?.content.stringValue?.includes(
              `I'm not able to help with that, as I'm only a language model.`,
            ),
        )
        ?.structValue?.fields?.content.stringValue?.trim() ?? "";

    return {
      content: prediction,
      data: response,
    };
  } catch (error) {
    console.log("error generateContent", { error });
    throw error;
  }
};

export default generateContent;
