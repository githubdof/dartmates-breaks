import type { Tx } from "@/db/client";
import { hitRateLimit } from "@/domain/rate-limit";
import { handleStatus, type HandleState } from "./queries";

/** Per IP hash: enough for typing a handle with a debounce; far too few to walk the handle space. */
export const HANDLE_CHECKS_PER_MINUTE = 30;
/** Per signed-in user, whatever address they come from, so rotating addresses buys nothing past this. */
export const HANDLE_CHECKS_PER_USER_PER_MINUTE = 60;
/** What onboarding says when a submit is refused by the handle limit (a submit answers "taken" too, so it counts). */
export const HANDLE_LIMITED_MESSAGE = "Too many tries. Wait a minute and try again.";

/**
 * Counts one handle lookup against the caller's user id always and their IP hash when there is one. Null when allowed,
 * otherwise how long to wait. Shared by the live check and the onboarding submit, so the two add up.
 */
export async function hitHandleLimit(tx: Tx, p: { callerId: string; ipHash: string | null; now: Date }): Promise<{ retryAfter: number } | null> {
  const user = await hitRateLimit(tx, { bucket: `handle:user:${p.callerId}`, limit: HANDLE_CHECKS_PER_USER_PER_MINUTE, windowSeconds: 60, now: p.now });
  const ip = p.ipHash ? await hitRateLimit(tx, { bucket: `handle:ip:${p.ipHash}`, limit: HANDLE_CHECKS_PER_MINUTE, windowSeconds: 60, now: p.now }) : null;
  const refused = [user, ip].flatMap((l) => (l && !l.allowed ? [l.retryAfter] : []));
  return refused.length > 0 ? { retryAfter: Math.max(...refused) } : null;
}

/** One handle check: counted (hitHandleLimit), then answered. */
export async function checkHandle(tx: Tx, p: { raw: string; callerId: string; ipHash: string | null; now: Date }): Promise<HandleState | { state: "limited"; retryAfter: number }> {
  const limited = await hitHandleLimit(tx, p);
  if (limited) return { state: "limited", retryAfter: limited.retryAfter };
  return handleStatus(tx, p.raw, p.callerId);
}
