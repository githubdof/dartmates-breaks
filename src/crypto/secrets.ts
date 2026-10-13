import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const KEYS: Record<string, () => Buffer> = { v1: () => Buffer.from(env().DRAW_KEY_V1, "base64") };
export const CURRENT_KEY_ID = "v1";

export function newSecret(): Uint8Array { return new Uint8Array(randomBytes(32)); }

export function encryptSecret(secret: Uint8Array, breakId: string): { ciphertext: string; keyId: string } {
  const key = KEYS[CURRENT_KEY_ID]();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(breakId, "utf8"));
  const data = Buffer.concat([cipher.update(Buffer.from(secret)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([iv, tag, data]).toString("base64"), keyId: CURRENT_KEY_ID };
}

export function decryptSecret(ciphertext: string, keyId: string, breakId: string): Uint8Array {
  const getKey = KEYS[keyId];
  if (!getKey) throw new Error(`unknown key id ${keyId}`);
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAAD(Buffer.from(breakId, "utf8"));
  decipher.setAuthTag(tag);
  return new Uint8Array(Buffer.concat([decipher.update(data), decipher.final()]));
}
