import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes, concatBytes } from "@noble/hashes/utils";

export const COMMIT_DOMAIN = utf8ToBytes("breaks-commit-v1");

export function commitment(secret: Uint8Array): string {
  return bytesToHex(sha256(concatBytes(COMMIT_DOMAIN, secret)));
}
