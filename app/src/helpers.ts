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
