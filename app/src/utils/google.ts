import { type CredentialBody, GoogleAuth, JWT } from "google-auth-library";
import { loadServiceAccount, type ServiceAccountCredentials } from "./firebase";

const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

let credentials: CredentialBody | undefined;

function requireServiceAccount(): ServiceAccountCredentials {
  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) {
    throw new Error(
      "Service account file (service-account.json) not found. Configure GOOGLE_APPLICATION_CREDENTIALS or place service-account.json in the app directory.",
    );
  }
  const hasClientEmail =
    typeof serviceAccount.client_email === "string" &&
    serviceAccount.client_email.trim().length > 0;
  const hasPrivateKey =
    typeof serviceAccount.private_key === "string" &&
    serviceAccount.private_key.trim().length > 0;
  if (!(hasClientEmail && hasPrivateKey)) {
    throw new Error(
      "Invalid service account credentials: client_email and private_key must be non-empty strings.",
    );
  }
  return serviceAccount;
}

/**
 * Generates a Google Cloud OAuth2 access token using the configured service account.
 */
export const getAccessToken = async (): Promise<string | null | undefined> => {
  const serviceAccount = requireServiceAccount();
  const client = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: [CLOUD_PLATFORM_SCOPE],
  });
  const res = await client.getAccessToken();
  return res.token;
};

/**
 * Get credentials from service account, if got before, return the cached one.
 */
export const getCredentials = async (): Promise<CredentialBody> => {
  if (credentials) {
    return credentials;
  }
  const serviceAccount = requireServiceAccount();
  const auth = new GoogleAuth({
    scopes: [CLOUD_PLATFORM_SCOPE],
    credentials: serviceAccount,
  });
  credentials = await auth.getCredentials();
  return credentials;
};

/**
 * Clears the cached Google Cloud credentials (primarily for testing).
 */
export const resetCredentialsCache = (): void => {
  credentials = undefined;
};
