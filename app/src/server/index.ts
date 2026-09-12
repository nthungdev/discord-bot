import fs from "node:fs";
import path from "node:path";
import bodyParser from "body-parser";
import express, {
  type Application,
  type Request,
  type Response,
} from "express";
import auth from "./middlewares/auth";
import errorHandler from "./middlewares/errorHandler";
import v1Router from "./routes/api/v1";
import testRouter from "./routes/testRouter";
import utilityRouter from "./routes/utilityRouter";

const app: Application = express();

// Google Cloud setting
app.set("trust proxy", true);

// Parse JSON request bodies
app.use(bodyParser.json());

// Basic CORS header helper for web frontend
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Cookie",
    );
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// Health check endpoint
app.get("/healthz", (_, res: Response) => {
  res.json({ ok: true, status: "healthy", timestamp: Date.now() });
});

// Mount Versioned API (v1)
app.use("/api/v1", v1Router);

// Legacy / Existing Endpoints
app.use("/tests", auth, testRouter);
app.use("/utility", auth, utilityRouter);

// Serve Web Management SPA in production or if static build exists (skip in test environment)
const webDistPath = path.resolve(process.cwd(), "..", "web", "dist");
const localWebDistPath = path.resolve(process.cwd(), "web", "dist");
const staticPath =
  process.env.NODE_ENV !== "test" &&
  (fs.existsSync(webDistPath)
    ? webDistPath
    : fs.existsSync(localWebDistPath)
      ? localWebDistPath
      : null);

if (staticPath) {
  app.use(express.static(staticPath));
  app.get("*", (req: Request, res: Response, next) => {
    if (req.path.startsWith("/api/")) {
      return next();
    }
    res.sendFile(path.join(staticPath, "index.html"));
  });
} else {
  app.get("/", (_, res: Response) => {
    res.send("Hello world!");
  });
}

app.use(errorHandler);

export default app;
