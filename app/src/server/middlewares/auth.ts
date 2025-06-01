import { Response, Request, NextFunction } from "express";

export default function (req: Request, res: Response, next: NextFunction) {
  const authorization = req.headers["authorization"]?.toString() || "";
  const [, token] = authorization.split(" ");
  if (token !== process.env.BEARER_TOKEN) {
    res.status(401);
    res.send({ ok: false, message: "unauthorized" });
    return;
  }
  next();
}
