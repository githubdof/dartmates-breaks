import type { Tx } from "@/db/client";
import { hitRateLimit } from "@/domain/rate-limit";
import { handleStatus, type HandleState } from "./queries";

/** Per IP hash: enough for typing a handle with a debounce; far too few to walk the handle space. */
export const HANDLE_CHECKS_PER_MINUTE = 30;
/** Per signed-in user, whatever address they come from, so rotating addresses buys nothing past this. */
export const HANDLE_CHECKS_PER_USER_PER_MINUTE = 60;

/** One handle check: counted against the caller's user id always and their IP hash when there is one, then answered. */
export async function checkHandle(tx: Tx, p: { raw: string; callerId: string; ipHash: string | null; now: Date }): Promise<HandleState | { state: "limited"; retryAfter: number }> {
  const user = await hitRateLimit(tx, { bucket: `handle:user:${p.callerId}`, limit: HANDLE_CHECKS_PER_USER_PER_MINUTE, windowSeconds: 60, now: p.now });
  const ip = p.ipHash ? await hitRateLimit(tx, { bucket: `handle:ip:${p.ipHash}`, limit: HANDLE_CHECKS_PER_MINUTE, windowSeconds: 60, now: p.now }) : null;
  const refused = [user, ip].flatMap((l) => (l && !l.allowed ? [l.retryAfter] : []));
  if (refused.length > 0) return { state: "limited", retryAfter: Math.max(...refused) };
  return handleStatus(tx, p.raw, p.callerId);
}
