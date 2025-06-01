export const validateEnvs = () => {
  const requiredEnvs = [
    "TOKEN",
    // 'SLEEP_REMINDER_SERVER_ID',
    "AI_API_KEY",
    "CLIENT_ID",
    "BEARER_TOKEN",
  ];
  // Validate environment variables
  const missingEnvs = requiredEnvs.filter((env) => !(env in process.env));
  if (missingEnvs.length !== 0) {
    console.error(
      `Missing ${missingEnvs
        .map((env) => `'${env}'`)
        .join(" ")} environment variables!`,
    );
    return false;
  }
  return true;
};
