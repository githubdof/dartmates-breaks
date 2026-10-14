import { hashIp } from "./ip-hash";
import { ipBucket } from "./ip-bucket";

/**
 * The caller's address, hashed, from the request headers; undefined when there is none.
 * Trusts the first `x-forwarded-for` entry: on Vercel that is the client, because Vercel overwrites the header
 * rather than appending to what the client sent. Behind any other proxy, revisit this.
 * `bucket: true` hashes the rate-limit bucket (an IPv6 address by its /64, see ipBucket); otherwise the whole address.
 */
export function requestIpHash(h: { get(name: string): string | null }, opts: { bucket?: boolean } = {}): string | undefined {
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  if (!ip) return undefined;
  return hashIp(opts.bucket ? ipBucket(ip) : ip);
}
