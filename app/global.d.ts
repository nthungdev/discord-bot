namespace NodeJS {
  interface ProcessEnv {
    BEARER_TOKEN?: string;
    TOKEN?: string;
    POLICE_BOT_TOKEN?: string;
    CLIENT_ID?: string;

    AI_API_KEY?: string;
    SLEEP_REMINDER_SERVER_ID?: string;
    ALLOWED_SERVERS?: string; // comma separated
    FREE_CHANNELS?: string; // comma separated
  }
}
