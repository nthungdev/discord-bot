namespace NodeJS {
  interface ProcessEnv {
    // Primary Discord App Credentials (Unified)
    DISCORD_TOKEN?: string;
    DISCORD_CLIENT_ID?: string;
    DISCORD_CLIENT_SECRET?: string;
    DISCORD_REDIRECT_URI?: string;

    // AI Providers (Default: Gemini, extensible for other providers)
    GEMINI_API_KEY?: string;
    AI_API_KEY?: string; // Legacy fallback for GEMINI_API_KEY
    OPENAI_API_KEY?: string;
    ANTHROPIC_API_KEY?: string;

    // Security & Auth
    BEARER_TOKEN?: string;
    SESSION_SECRET?: string;
    ADMIN_DISCORD_USER_IDS?: string;

    // Storage & Runtime
    MEMORY_STORE_TYPE?: string;
    PORT?: string;
    NODE_ENV?: string;
    USE_CONFIG_FILE?: string;
    CONFIG_PATH?: string;
    GOOGLE_APPLICATION_CREDENTIALS?: string;
    ENABLE_POLICE_CAPABILITY?: string;

    // Directus Control Plane
    DIRECTUS_URL?: string;
    DIRECTUS_BOT_TOKEN?: string;
    INTERNAL_WEBHOOK_SECRET?: string;
    WEBHOOK_RECEIVER_URL?: string;
    DIRECTUS_ADMIN_EMAIL?: string;
    DIRECTUS_ADMIN_PASSWORD?: string;
    ADMIN_EMAIL?: string;
    ADMIN_PASSWORD?: string;
  }
}


