import { config } from 'dotenv'
import app from './app'
import { login, registerChatbot } from './discord'

config({
  path:
    process.env.NODE_ENV === 'production'
      ? '.env.production'
      : '.env.development',
})

const { TOKEN, PORT } = process.env
const port: number | string = PORT || 3001

const main = async () => {
  // Validate environment variables
  const requiredEnvs = [
    'TOKEN',
    'SLEEP_REMINDER_SERVER_ID',
    'AI_API_KEY',
  ]
  const missingEnvs = requiredEnvs.filter((env) => !(env in process.env))
  if (missingEnvs.length !== 0) {
    console.error(
      `Missing ${missingEnvs
        .map((env) => `'${env}'`)
        .join(' ')} environment variables!`
    )
    process.exit(1)
  }

  // Log the bot into Discord
  await login(TOKEN as string)

  registerChatbot()

  // Run express app
  app.listen(port, function () {
    console.log(`App is listening on port ${port} !`)
  })
}

main()
