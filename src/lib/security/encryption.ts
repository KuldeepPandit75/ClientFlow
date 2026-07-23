import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

function getKey() {
  const raw = process.env.DATA_ENCRYPTION_KEY || "";
  if (!raw) return null;
  return createHash("sha256").update(raw).digest();
}

function getLegacyKeys() {
  const raw = (process.env.DATA_ENCRYPTION_KEY_OLD || "").trim();
  if (!raw) return [];
  return raw.split(",").map((item) => item.trim()).filter(Boolean).map((item) => createHash("sha256").update(item).digest());
}

export function getEncryptionKeyVersion() {
  return String(process.env.DATA_ENCRYPTION_KEY_VERSION || "v1");
}

export function encryptSensitive(value: string | null | undefined) {
  if (!value) return null;
  const key = getKey();
  if (!key) return null;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSensitive(payload: string | null | undefined) {
  if (!payload) return null;
  const key = getKey();
  if (!key) return null;

  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);

  const keys = [key, ...getLegacyKeys()];
  for (const k of keys) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", k, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
      return decrypted.toString("utf8");
    } catch {
      continue;
    }
  }
  return null;
}
