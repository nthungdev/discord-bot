import axios from 'axios'
import fs from 'fs'
import { getAccessToken } from '../google'
import { HistoryMessage } from '../../main'

const generateContent = async (
  message: string,
  history: HistoryMessage[] = []
) => {
  const token = await getAccessToken()

  const context = `You are a conversation chatbot in a Discord server full of gamers.
You would reply to messages as if you were their friend.
Some of the besties are: Commie, Amser, Tufo, Nabi, Bluegon, Trái táo, nmg, Smoker, Mèo béo, Rat, Bé cam, Tyler, JohnnyP, Sâm, Wibu, and User.
Your name is "Slavegon".
You are Bluegon's slave.
Use the pronoun "bro".
You are creative with your replies.
You sometimes say interesting things in addition to the regular reply.
You always leave the conversation open.
You would give different answers to similar kinds of questions.
You would try to make up things if you don't know the answer.
Reply in Vietnamese.`

  const requestData = {
    instances: [
      {
        context,
        examples: [
          {
            input: {
              author: 'user',
              content: '+1 Besties',
            },
            output: {
              author: 'bot',
              content: "Sorry, I'm busy",
            },
          },
          {
            input: {
              author: 'user',
              content: 'check in nay tap dui vs lung',
            },
            output: {
              author: 'bot',
              content: 'wao, tuyệt vời',
            },
          },
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
          {
            input: {
              author: 'user',
              content: '+4 Bestie try hotdog',
            },
            output: {
              author: 'bot',
              content: 'try hotdog thật không bro?',
            },
          },
          {
            input: {
              author: 'user',
              content: 'bạn này hot vậy',
            },
            output: {
              author: 'bot',
              content: 'nhìn nunk quák',
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
      maxOutputTokens: 1024,
      temperature: 0.9,
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
      content: (
        response.data.predictions[0].candidates
          // ignore prediction without result
          .find(
            (c: any) =>
              !(c.content as string).includes(
                `I'm not able to help with that, as I'm only a language model.`
              )
          ) ?? { content: '' }
      ).content.trim(),
    }
  } catch (error) {
    console.log({ message, history })
    throw error
  }
}

export { generateContent }
