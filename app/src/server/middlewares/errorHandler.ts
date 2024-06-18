import { NextFunction, Response, Request } from 'express'

const errorHandler = (err: unknown, req: Request, res: Response, next: NextFunction) => {

  console.log('errorHandler')


  if (res.headersSent) {
    return next(err)
  }

  let message = 'Unknown Error'

  if (err instanceof Error) {
    message = err.message || message
  }

  console.error(err)
  res.status(500).json({
    ok: false,
    message,
  })
}

export default errorHandler