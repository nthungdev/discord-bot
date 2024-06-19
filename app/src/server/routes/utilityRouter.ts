import { Router } from 'express'
import { deployGuildCommands } from '../../discord/deployCommands'
import { clearMessageHistory } from '../../features/chatbot'
import { store } from '../../store'
import { Config } from '../../config'

const utilityRouter = Router()

utilityRouter.post('/deploy-command', async (req, res, next) => {
  const { token, clientId, guildId } = req.body

  if (token === undefined || clientId === undefined || guildId === undefined) {
    res.status(400) // bad request
    res.send({ ok: false, message: 'missing required fields' })
    return
  }

  try {
    await deployGuildCommands(token, clientId, guildId)
    res.json({ ok: true, message: 'commands deployed' })
  } catch (error: unknown) {
    next(error)
  }
})

/// Clear the chat bot history
utilityRouter.post('/clearHistory', async (req, res, next) => {
  const { channelId } = req.body

  try {
    store.dispatch(clearMessageHistory({ channelId }))
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

utilityRouter.post('/loadConfig', async (req, res, next) => {
  try {
    await Config.getInstance().loadConfig()
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

export default utilityRouter
