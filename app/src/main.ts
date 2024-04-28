import 'dotenv/config'
import app from './app'
import { login } from './client'

const { TOKEN } = process.env
const port: number = 3001

const main = async () => {
  if (TOKEN === undefined) {
    console.error('Missing TOKEN in environment variable!')
    return
  }

  // Log the bot to Discord
  await login(TOKEN)

  // Run express app
  app.listen(port, function () {
    console.log(`App is listening on port ${port} !`)
  })
}

main()