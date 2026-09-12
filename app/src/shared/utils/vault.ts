import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const FALLBACK_SECRET = "discord-bot-default-master-encryption-secret-key-32b!";

/**
 * Derives a 32-byte cryptographic key from the configured vault secret or fallback.
 */
function getDerivedKey(): Buffer {
  const secret = process.env.BOT_VAULT_ENCRYPTION_KEY || FALLBACK_SECRET;
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a plaintext secret (such as a Discord Bot Token) using AES-256-GCM.
 * Output format: `ivHex:authTagHex:encryptedHex`
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) {
    return "";
  }

  const key = getDerivedKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string created by `encryptSecret`.
 */
export function decryptSecret(encryptedPayload: string): string {
  if (!encryptedPayload) {
    return "";
  }

  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    // If not formatted with IV and auth tag, treat as plaintext fallback for backwards compatibility
    return encryptedPayload;
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getDerivedKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Masks a sensitive token for safe display in UI and API responses (e.g. `MTEx...********`).
 */
export function maskToken(token: string): string {
  if (!token) {
    return "";
  }

  if (token.length <= 8) {
    return "********";
  }

  const prefix = token.slice(0, 4);
  return `${prefix}...********`;
}
