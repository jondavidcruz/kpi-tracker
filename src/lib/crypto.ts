// Symmetric encryption for the in-portal software vault. AES-256-GCM with a key
// held in the VAULT_KEY env var (a Vercel secret, never in the database). Only
// the server can decrypt; the key never reaches the client.
//
// Generate a key once and set it in Vercel (Production):
//   openssl rand -base64 32
//
// NOTE: this protects SOFTWARE logins only — never bank/financial credentials.
import crypto from "crypto";

function getKey(): Buffer | null {
  const k = process.env.VAULT_KEY;
  if (!k) return null;
  let buf: Buffer;
  try {
    buf = /^[0-9a-fA-F]{64}$/.test(k) ? Buffer.from(k, "hex") : Buffer.from(k, "base64");
  } catch {
    return null;
  }
  return buf.length === 32 ? buf : null;
}

/** True when a valid 32-byte VAULT_KEY is configured. */
export function vaultConfigured(): boolean {
  return getKey() !== null;
}

/** Encrypt plaintext → base64(iv | tag | ciphertext). Throws if no key. */
export function encryptSecret(plain: string): string {
  const key = getKey();
  if (!key) throw new Error("VAULT_KEY not configured");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

/** Decrypt a base64(iv | tag | ciphertext) blob. Throws if no key / tampered. */
export function decryptSecret(blob: string): string {
  const key = getKey();
  if (!key) throw new Error("VAULT_KEY not configured");
  const raw = Buffer.from(blob, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
