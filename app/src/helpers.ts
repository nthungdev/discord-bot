import axios from 'axios'
import config from './config'

export const validateEnvs = () => {
  // Validate environment variables
  const missingEnvs = config.requiredEnvs
    .filter((env) => !(env in process.env))
  if (missingEnvs.length !== 0) {
    console.error(
      `Missing ${missingEnvs
        .map((env) => `'${env}'`)
        .join(' ')} environment variables!`
    )
    return false
  }
  return true
}


export const imageToBase64 = async (url: string) => {
  const response = await axios.get(url, { responseType: 'arraybuffer' })
  const buffer = Buffer.from(response.data, 'binary')
  return buffer.toString('base64')
}