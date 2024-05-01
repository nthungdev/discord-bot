import { config } from 'dotenv'
import app from './app'
import { login } from './discord'
import { registerChatbot } from './discord/chatbot'

config({
  path:
    process.env.NODE_ENV === 'production'
      ? '.env.production'
      : '.env.development',
})

const { TOKEN, PORT } = process.env
const port: number | string = PORT || 3001

const main = async () => {// Validate environment variables
  const requiredEnvs = ['TOKEN', 'SLEEP_REMINDER_SERVER_ID']
  const missingEnvs = requiredEnvs.filter((env) => !(env in process.env))
  if (missingEnvs.length !== 0) {
    console.error(
      `Missing ${missingEnvs
        .map((env) => `'${env}'`)
        .join(' ')} environment variables!`
    )
    process.exit(1)
  }

  // Log the bot to Discord
  await login(TOKEN as string)

  registerChatbot({
    allowedServers: ['1233630823496814593'],
    freeChannels: ['1234931286062272512']
  })
  // registerChatbot({
  //   allowedServers: (process.env.ALLOWED_SERVERS ?? '').split(','),
  //   freeChannels: (process.env.FREE_CHANNELS ?? '').split(',')
  // })

  // Run express app
  app.listen(port, function () {
    console.log(`App is listening on port ${port} !`)
  })
}

main()
