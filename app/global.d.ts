namespace NodeJS {
  interface ProcessEnv {
    // Primary Discord App Credentials (Unified)
    DISCORD_TOKEN?: string;
    DISCORD_CLIENT_ID?: string;
    DISCORD_CLIENT_SECRET?: string;
    DISCORD_REDIRECT_URI?: string;

    // AI Provider
    AI_API_KEY?: string;

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
  }
}

