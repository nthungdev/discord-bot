/**
 * Validates essential environment variables and fails fast if any required variables are missing.
 * @returns boolean True if all required environment variables are valid, false otherwise.
 */
export const validateEnvs = (): boolean => {
  const missingEnvs: string[] = [];

  // Discord Bot Token
  if (!process.env.DISCORD_TOKEN?.trim()) {
    missingEnvs.push("DISCORD_TOKEN");
  }

  // Discord Client ID
  if (!process.env.DISCORD_CLIENT_ID?.trim()) {
    missingEnvs.push("DISCORD_CLIENT_ID");
  }

  // AI API Key
  if (!process.env.AI_API_KEY?.trim()) {
    missingEnvs.push("AI_API_KEY");
  }

  // API Secret Bearer Token
  if (!process.env.BEARER_TOKEN?.trim()) {
    missingEnvs.push("BEARER_TOKEN");
  }

  if (missingEnvs.length !== 0) {
    console.error(
      `[EnvValidator] Missing required environment variable(s): ${missingEnvs
        .map((env) => `'${env}'`)
        .join(
          ", ",
        )}!\nPlease configure them in your .env file or environment before starting the application.`,
    );
    return false;
  }

  // Management Portal OAuth notices
  if (!process.env.DISCORD_CLIENT_SECRET?.trim()) {
    console.warn(
      "[EnvValidator] Notice: 'DISCORD_CLIENT_SECRET' is not set. Discord OAuth2 web portal login will be disabled until configured.",
    );
  }

  if (!process.env.SESSION_SECRET?.trim()) {
    console.warn(
      "[EnvValidator] Notice: 'SESSION_SECRET' is not set. Using default fallback session signing key.",
    );
  }

  return true;
};
