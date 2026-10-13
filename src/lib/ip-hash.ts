import { createHmac } from "node:crypto";
import { env } from "@/lib/env";

/** Keyed hash of an IP address (hex HMAC-SHA256, 32 chars), so stored hashes can't be reversed by brute force over the IPv4 space. */
export function hashIp(ip: string, key: string = env().IP_HASH_KEY): string {
  return createHmac("sha256", Buffer.from(key, "base64")).update(ip).digest("hex").slice(0, 32);
}
