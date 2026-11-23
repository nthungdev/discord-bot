import { createDirectus, rest, staticToken } from "@directus/sdk";
import type { DirectusSchema } from "./types";

const DIRECTUS_REQUEST_TIMEOUT_MS = 10_000;

const directusUrl = process.env.DIRECTUS_URL || "http://localhost:8055";
const directusToken = process.env.DIRECTUS_BOT_TOKEN || "";

export const directusClient = createDirectus<DirectusSchema>(directusUrl)
  .with(staticToken(directusToken))
  .with(
    rest({
      onRequest: (options) => ({
        ...options,
        signal:
          options.signal ?? AbortSignal.timeout(DIRECTUS_REQUEST_TIMEOUT_MS),
      }),
    }),
  );
