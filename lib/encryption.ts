import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const keyB64 = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyB64) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  }
  // Key should be 32 bytes base64 encoded (44 chars) or raw 32 bytes hex
  // Try base64 first
  try {
    const buf = Buffer.from(keyB64, "base64");
    if (buf.length === 32) return buf;
  } catch {}
  // Try hex
  if (keyB64.length === 64) {
    return Buffer.from(keyB64, "hex");
  }
  // If raw string 32 chars, use as is (less ideal)
  if (keyB64.length >= 32) {
    // Derive 32 byte key via SHA256 for compatibility
    return crypto.createHash("sha256").update(keyB64).digest();
  }
  throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes (base64 or hex)");
}

export function encryptToken(plaintext: string): string {
  if (!plaintext) return "";
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:ciphertext all base64
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

export function decryptToken(ciphertextB64: string): string {
  if (!ciphertextB64) return "";
  const key = getEncryptionKey();
  const combined = Buffer.from(ciphertextB64, "base64");
  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted token format");
  }
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

// Utility to generate a secure random key for env setup
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString("base64");
}
