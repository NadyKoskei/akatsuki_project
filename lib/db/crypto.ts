import "server-only";
import crypto from "node:crypto";

/**
 * LOOP token sets are encrypted at rest (objective 10: token-only auth,
 * encrypted storage). The key is derived from JWT_SECRET, so rotating that
 * secret invalidates stored tokens — users simply re-authorise through LOOP.
 */

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SECRET must be set to at least 16 characters (see .env.example).");
  }
  // hkdfSync returns an ArrayBuffer; wrap it so the cipher gets a Buffer.
  const derived = crypto.hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.alloc(0), Buffer.from("chroma:token:v1"), 32);
  cachedKey = Buffer.from(derived);
  return cachedKey;
}

export function encryptJson(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), enc.toString("base64url"), tag.toString("base64url")].join(".");
}

export function decryptJson<T>(payload: string): T | null {
  try {
    const [ivB64, dataB64, tagB64] = payload.split(".");
    if (!ivB64 || !dataB64 || !tagB64) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]);
    return JSON.parse(dec.toString("utf8")) as T;
  } catch {
    // Wrong key or tampered payload — treat as "no token", forcing re-auth.
    return null;
  }
}
