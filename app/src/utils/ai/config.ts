import { besties, instructions } from "./data"

export const API_ENDPOINT = 'us-central1-aiplatform.googleapis.com'
export const PROJECT_ID = 'stay-home-discord-bot'
export const MODEL_ID = 'chat-bison'
export const LOCATION_ID = 'us-central1'
export const dataFileName = 'predict-request.json'

export const getContext = () => {
  const bestiesString = besties.map(({ name, gender, username }) => `${name} (${gender} username: ${username})`).join(', ')
  return [...instructions, `Some of the besties are: ${bestiesString}.`].join('; ')
}