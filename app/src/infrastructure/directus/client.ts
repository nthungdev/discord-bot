import { createDirectus, rest, staticToken } from "@directus/sdk";
import type { DirectusSchema } from "./types";

const directusUrl = process.env.DIRECTUS_URL || "http://localhost:8055";
const directusToken =
  process.env.DIRECTUS_BOT_TOKEN || "bot-dev-static-token-12345";

export const directusClient = createDirectus<DirectusSchema>(directusUrl)
  .with(staticToken(directusToken))
  .with(rest());
