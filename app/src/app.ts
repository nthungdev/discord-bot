import express, { Application, Request, Response } from 'express'

const app: Application = express()

app.get('/helloworld', (req: Request, res: Response) => {
  res.send('Hello world!')
})

export default app