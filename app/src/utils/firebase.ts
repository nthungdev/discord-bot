import fs from "node:fs";
import path from "node:path";
import * as admin from "firebase-admin";
import type { ConfigSource } from "../config";

const DEFAULT_SERVICE_ACCOUNT_FILENAME = "service-account.json";

export interface ServiceAccountCredentials {
  type?: string;
  project_id?: string;
  private_key_id?: string;
  private_key?: string;
  client_email?: string;
  client_id?: string;
  auth_uri?: string;
  token_uri?: string;
  auth_provider_x509_cert_url?: string;
  client_x509_cert_url?: string;
  universe_domain?: string;
  [key: string]: unknown;
}

export interface FirebaseRequirementOptions {
  configSource: ConfigSource;
  memoryStoreType?: string;
  aiProvider?: string;
}

export interface InitFirebaseOptions extends FirebaseRequirementOptions {
  serviceAccountPath?: string;
}

function isRegularFile(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolves the filesystem path to a Firebase service account JSON file.
 * When `customPath` is provided, only that explicit path is checked without fallback.
 */
export function resolveServiceAccountPath(customPath?: string): string | null {
  if (customPath !== undefined) {
    const trimmed = customPath.trim();
    if (trimmed.length === 0) {
      return null;
    }
    return isRegularFile(trimmed) ? trimmed : null;
  }

  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.resolve(process.cwd(), DEFAULT_SERVICE_ACCOUNT_FILENAME),
    path.resolve(process.cwd(), "app", DEFAULT_SERVICE_ACCOUNT_FILENAME),
    path.resolve(__dirname, "../../", DEFAULT_SERVICE_ACCOUNT_FILENAME),
  ]
    .map((candidate) => candidate?.trim())
    .filter((candidate): candidate is string =>
      Boolean(candidate && candidate.length > 0),
    );

  for (const candidate of candidates) {
    if (isRegularFile(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Lazily reads and parses the Firebase service account credentials JSON file, returning `null` if absent or invalid.
 */
export function loadServiceAccount(
  customPath?: string,
): ServiceAccountCredentials | null {
  const resolvedPath = resolveServiceAccountPath(customPath);
  if (!resolvedPath) {
    return null;
  }

  try {
    const rawContent = fs.readFileSync(resolvedPath, "utf-8");
    const parsed: unknown = JSON.parse(rawContent);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      console.warn(
        `[Firebase] Service account file at ${resolvedPath} is not a JSON object. Ignoring.`,
      );
      return null;
    }
    return parsed as ServiceAccountCredentials;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[Firebase] Failed to read or parse service account file at ${resolvedPath}: ${message}`,
    );
    return null;
  }
}

/**
 * Determines whether Firebase Admin SDK initialization is required for the active configuration.
 */
export function shouldInitializeFirebase(
  options: FirebaseRequirementOptions,
): boolean {
  return (
    options.configSource === "remote-config" ||
    options.memoryStoreType === "firestore" ||
    options.aiProvider === "vertex"
  );
}

/**
 * Conditionally initializes the Firebase Admin SDK only when required by the active runtime mode.
 */
export function initFirebaseIfNeeded(options: InitFirebaseOptions): boolean {
  if (!shouldInitializeFirebase(options)) {
    console.info(
      `[Firebase] Skipping Firebase Admin initialization (not required for configSource=${options.configSource}, memoryStoreType=${options.memoryStoreType ?? "unset"}, aiProvider=${options.aiProvider ?? "unset"}).`,
    );
    return false;
  }

  if (admin.apps.length > 0) {
    return true;
  }

  const serviceAccount = loadServiceAccount(options.serviceAccountPath);
  if (!serviceAccount) {
    console.warn(
      `[Firebase] Firebase Admin is required for configSource=${options.configSource}, memoryStoreType=${options.memoryStoreType ?? "unset"}, aiProvider=${options.aiProvider ?? "unset"}, but service-account.json was not found. Skipping initialization.`,
    );
    return false;
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  });
  return true;
}
