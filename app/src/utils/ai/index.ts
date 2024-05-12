import axios from 'axios'
import { getAccessToken, getCredentials } from '../google'
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import { PredictionServiceClient, helpers } from '@google-cloud/aiplatform'
import { AiChatMessage } from '../../types';
import { API_ENDPOINT, LOCATION_ID, MODEL_ID, PROJECT_ID, dataFileName, getContext } from './config';
import { google } from '@google-cloud/aiplatform/build/protos/protos';

/**
 * Uses VertexAI RestAPI
 */
export const generateContentREST = async (
  message: string,
  history: AiChatMessage[] = []
) => {
  const token = await getAccessToken()

  const url = `https://${API_ENDPOINT}/v1/projects/${PROJECT_ID}/locations/${LOCATION_ID}/publishers/google/models/${MODEL_ID}:predict`

  const requestData = {
    instances: [
      {
        context: getContext(),
        examples: [],
        messages: [
          ...history.map(({ content, author }) => ({
            content,
            author,
            ...(author === 'bot'
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
            author: 'user',
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
  }
  const requestJson = JSON.stringify(requestData)

  try {
    const response = await axios.post(url, requestJson, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    return {
      data: response.data,
      content: ((
        response.data.predictions[0].candidates
          // ignore prediction without result
          .find(
            (c: any) =>
              !(c.content as string).includes(
                `I'm not able to help with that, as I'm only a language model.`
              )
          ) ?? { content: '' }
      ).content as string).trim(),
    }
  } catch (error) {
    console.log({ message, history })
    throw error
  }
}

/**
 * Uses @google/generative-ai API
 */
export const generate = async (prompt: string, history: AiChatMessage[] = []) => {
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
    ]
  });

  const chat = model.startChat({
    history: history.map(({ content, author }) => ({
      role: author === 'bot' ? 'model' : 'user',
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
  }
}

/**
 * Uses @google-cloud/aiplatform API
 */
export const generateContent = async (prompt: string, history: AiChatMessage[] = []) => {
  const credentials = await getCredentials()
  const predictionServiceClient = new PredictionServiceClient({
    apiEndpoint: 'us-central1-aiplatform.googleapis.com',
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
  });

  const endpoint = `projects/${PROJECT_ID}/locations/${LOCATION_ID}/publishers/google/models/${MODEL_ID}`;

  const instances = [helpers.toValue({
    context: getContext(),
    example: [],
    messages: [
      ...history,
      {
        author: 'user',
        content: prompt,
      },
    ]
  })]

  const parameters = helpers.toValue({
    candidateCount: 2,
    // maxOutputTokens: 1024,
    maxOutputTokens: 2048,
    // maxOutputTokens: 4096,
    temperature: 0.92,
    topP: 1,
  })

  const request = {
    endpoint,
    instances,
    parameters
  } as google.cloud.aiplatform.v1.IPredictRequest

  try {
    // Predict request
    const [response] = await predictionServiceClient.predict(request);
    const predictions = response.predictions;

    return {
      content: predictions?.[0].structValue?.fields?.candidates?.listValue?.values?.[0].structValue?.fields?.content.stringValue?.trim() ?? '',
      data: predictions,
    }
  } catch (error) {
    console.log('error generateContent', { error })
    throw error
  }
}
