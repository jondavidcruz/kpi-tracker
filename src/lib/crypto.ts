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
  // Preferred: an explicit 32-byte VAULT_KEY (hex or base64). Most durable.
  const k = process.env.VAULT_KEY;
  if (k) {
    let buf: Buffer;
    try {
      buf = /^[0-9a-fA-F]{64}$/.test(k) ? Buffer.from(k, "hex") : Buffer.from(k, "base64");
    } catch {
      buf = Buffer.alloc(0);
    }
    if (buf.length === 32) return buf;
  }

  // Zero-setup fallback: derive a stable key from a secret the server already
  // has (still an env var, never in the database — a DB leak alone can't decrypt).
  // Trade-off: if that base secret is rotated, stored passwords must be re-entered;
  // set a dedicated VAULT_KEY to avoid that.
  const base =
    process.env.INGEST_SECRET ||
    process.env.CRON_SECRET ||
    process.env.DIRECT_URL ||
    process.env.DATABASE_URL;
  if (!base) return null;
  return crypto.scryptSync(base, "freedom-offers-vault-v1", 32);
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
