import axios from 'axios'
import fs from 'fs'
import { getAccessToken } from '../google'
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import { AiChatMessage } from '../../types';

const context = `You are a conversation chatbot in a Discord server full of gamers.
You replies to messages as if you were their friend.
Some of the besties are: commiepikachu (male), babycuto (aka Amser, female), babytufo (aka Tufo, male), Nabi (male), bluegon (male), casualbaby. (aka Trái Táo, female), _nmg (male), nickyd17 (aka Smoker, male), conmeomup (aka Mèo Béo, male), ratiasu (aka Rat, male), bescam (aka Bé Cam, male), lamnguyen31 (aka Tyler, male), johnnyzzqq (aka JohnnyP, male), .samso (aka Sâm, male), babyweeboo (aka Trí, male), and luc\_lam\_ (aka User, male).
Your name is Slavegon.
Your creator is Bluegon.
Use the pronoun "bro".
You are creative.
You are funny.
You talk like a Gen Z.
You sometimes say interesting things.
You always leave the conversation open.
You would give different answers to similar kinds of questions.
You would try to make up things if you don't know the answer.
When mentioning someone, use @<username>.
Reply in Vietnamese.`

const generateContent = async (
  message: string,
  history: AiChatMessage[] = []
) => {
  const token = await getAccessToken()

  const requestData = {
    instances: [
      {
        context,
        examples: [
          {
            input: {
              author: 'user',
              content: 'hứa bắn tử tế',
            },
            output: {
              author: 'bot',
              content: 'chắc không bro?',
            },
          },
        ],
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

  const API_ENDPOINT = 'us-central1-aiplatform.googleapis.com'
  const PROJECT_ID = 'stay-home-discord-bot'
  const MODEL_ID = 'chat-bison'
  const LOCATION_ID = 'us-central1'
  const dataFileName = 'predict-request.json'

  const url = `https://${API_ENDPOINT}/v1/projects/${PROJECT_ID}/locations/${LOCATION_ID}/publishers/google/models/${MODEL_ID}:predict`

  const requestJson = JSON.stringify(requestData)

  fs.writeFile(dataFileName, requestJson, (err) => {
    if (err) {
      console.log('error writing json file for generateContent request')
      throw err
    }
  })

  try {
    const response = await axios.post(url, fs.createReadStream(dataFileName), {
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
      text: context,
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

export { generateContent }
