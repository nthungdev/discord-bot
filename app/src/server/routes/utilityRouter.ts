import { Router } from 'express'
import { deployGuildCommands } from '../../discord/deployCommands'
import { clearMessageHistory } from '../../features/chatbot'
import { store } from '../../store'

const utilityRouter = Router()

utilityRouter.post('/deploy-command', async (req, res) => {
  const { token, clientId, guildId } = req.body

  if (token === undefined || clientId === undefined || guildId === undefined) {
    res.status(400) // bad request
    res.send({ ok: false, message: 'missing required fields' })
    return
  }

  try {
    await deployGuildCommands(token, clientId, guildId)
    res.json({ ok: true, message: 'commands deployed' })
  } catch (error: any) {
    res.status(500)
    res.send({ ok: false, message: error?.message })
  }
})

/// Clear the chat bot history
utilityRouter.post('/clearHistory', async (req, res) => {
  const { channelId } = req.body

  try {
    store.dispatch(clearMessageHistory({ channelId }))
    res.json({ ok: true })
  } catch (error) {
    res.json({ ok: false })
  }
})

export default utilityRouter
