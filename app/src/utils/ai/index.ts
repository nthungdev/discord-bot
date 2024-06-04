import axios from 'axios'
import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from '@google/generative-ai'
import { PredictionServiceClient, helpers } from '@google-cloud/aiplatform'
import {
  ClientError,
  FinishReason,
  InlineDataPart,
  TextPart,
  VertexAI,
} from '@google-cloud/vertexai'
import { google } from '@google-cloud/aiplatform/build/protos/protos'
import { getAccessToken, getCredentials } from '../google'
import { AiChatMessage, AiPrompt, AiPromptResponse } from '../../types'
import {
  API_ENDPOINT,
  LOCATION_ID,
  MODEL_ID,
  PROJECT_ID,
  getContext,
} from './config'

const IGNORED_CONTENT = `I'm not able to help with that, as I'm only a language model.`
const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/gif']

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
      content: (
        (
          response.data.predictions[0].candidates
            // ignore prediction without result
            .find(
              (c: any) =>
                !(c.content as string).includes(
                  `I'm not able to help with that, as I'm only a language model.`
                )
            ) ?? { content: '' }
        ).content as string
      ).trim(),
    }
  } catch (error) {
    console.log({ message, history })
    throw error
  }
}

/**
 * Uses @google/generative-ai API
 */
export const generate = async (
  prompt: string,
  history: AiChatMessage[] = []
) => {
  const genAI = new GoogleGenerativeAI(process.env.AI_API_KEY as string)

  // For text-only input, use the gemini-pro model
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-pro-latest',
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
  })

  const chat = model.startChat({
    history: history.map(({ content, author }) => ({
      role: author === 'bot' ? 'model' : 'user',
      parts: [{ text: content }],
    })),
    generationConfig: {
      maxOutputTokens: 4096, // 100 token -> 60-80 words
    },
  })

  const result = await chat.sendMessage(prompt)
  return {
    data: result.response,
    content: result.response.text(),
  }
}

/**
 * Uses @google-cloud/aiplatform API
 */
export const generateContent = async (
  prompt: string,
  history: AiChatMessage[] = []
) => {
  const credentials = await getCredentials()
  const predictionServiceClient = new PredictionServiceClient({
    apiEndpoint: 'us-central1-aiplatform.googleapis.com',
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
  })

  const endpoint = `projects/${PROJECT_ID}/locations/${LOCATION_ID}/publishers/google/models/${MODEL_ID}`

  const instances = [
    helpers.toValue({
      context: getContext(),
      example: [],
      messages: [
        ...history,
        {
          author: 'user',
          content: prompt,
        },
      ],
    }),
  ]

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
    parameters,
  } as google.cloud.aiplatform.v1.IPredictRequest

  try {
    const [response] = await predictionServiceClient.predict(request)
    const prediction =
      (
        response.predictions?.[0].structValue?.fields?.candidates?.listValue
          ?.values as any[]
      )
        ?.find(
          (value) =>
            !value.structValue?.fields?.content.stringValue?.includes(
              `I'm not able to help with that, as I'm only a language model.`
            )
        )
        ?.structValue?.fields?.content.stringValue?.trim() ?? ''

    return {
      content: prediction,
      data: response,
    }
  } catch (error) {
    console.log('error generateContent', { error })
    throw error
  }
}

const imageToBase64 = async (url: string) => {
  const response = await axios.get(url, { responseType: 'arraybuffer' })
  const buffer = Buffer.from(response.data, 'binary')
  return buffer.toString('base64')
}

/**
 * Uses @google-cloud/vertexai API
 */
export const generativeResponse = async (prompt: AiPrompt) : Promise<AiPromptResponse> => {
  // const model = 'gemini-1.0-pro-vision-001'
  const model = 'gemini-1.5-pro'

  // Initialize Vertex with your Cloud project and location
  const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION_ID })

  // Instantiate the model
  const generativeVisionModel = vertexAI.getGenerativeModel({
    model,
    systemInstruction: getContext(),
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
    ]
  })

  const chat = generativeVisionModel.startChat({
    history: prompt.history.map(({ content, author }) => ({
      role: author === 'bot' ? 'model' : 'user',
      parts: [{ text: content }],
    }))
  })

  const { text } = prompt
  let parts = []

  for (const file of prompt.files) {
    if (file.mimeType.startsWith('image/')) {
      parts.push({
        inlineData: {
          data: await imageToBase64(file.uri),
          mimeType: file.mimeType,
        },
      } as InlineDataPart)
    }
    // TODO handle videos
  }

  if (text) {
    parts.push({ text } as TextPart)
  }

  try {
    const result = await chat.sendMessage(parts)

    // get valid candidate
    const candidate = result.response.candidates?.find((candidate) => {
      // response stopped due to violating some guidelines
      if (candidate.finishReason !== FinishReason.STOP) return false

      return !!candidate.content.parts?.every((part) => {
        return !part.text?.includes(IGNORED_CONTENT)
      })
    })

    if (!candidate) {
      return { content: '', data: result.response }
    }

    const candidateText = candidate.content.parts.find(part => part.text)?.text

    if (!candidateText) {
      return { content: '', data: result.response }
    }

    return { content: candidateText, data: result.response }
  } catch (error: any) {
    if (error instanceof ClientError) {
      // TODO handle invalid argument error
      throw error
    }
    throw error
  }
}
