import { Router } from 'express'
import { getGenAi } from '../../utils/genAi'

const testRouter = Router()

testRouter.post('/1', async (_, res, next) => {
  try {
    const genAi = getGenAi()
    await genAi.init()
    const response = await genAi.generate({ text: 'Hello'})

    res.json({ ok: true, content: response.content })
    res.status(200)
  } catch (error: unknown) {
    next(error)
  }
})

export default testRouter
