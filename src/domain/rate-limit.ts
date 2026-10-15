import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { rateLimits } from "@/db/schema";

/** Fixed-window counter: records this hit and says whether it is within `limit` for the window `now` falls in. */
export async function hitRateLimit(tx: Tx, p: { bucket: string; limit: number; windowSeconds: number; now: Date }): Promise<{ allowed: boolean; hits: number; retryAfter: number }> {
  const windowMs = p.windowSeconds * 1000;
  const start = new Date(Math.floor(p.now.getTime() / windowMs) * windowMs);
  const [r] = await tx.insert(rateLimits).values({ bucket: p.bucket, windowStart: start, hits: 1 })
    .onConflictDoUpdate({ target: [rateLimits.bucket, rateLimits.windowStart], set: { hits: sql`${rateLimits.hits} + 1` } })
    .returning({ hits: rateLimits.hits });
  const retryAfter = Math.max(1, Math.ceil((start.getTime() + windowMs - p.now.getTime()) / 1000));
  return { allowed: r.hits <= p.limit, hits: r.hits, retryAfter };
}

/** Run by the tick job: windows older than a day are of no use to any limit. */
export async function pruneRateLimits(tx: Tx, now: Date): Promise<number> {
  const before = new Date(now.getTime() - 86_400_000).toISOString();
  const rows = await tx.delete(rateLimits).where(sql`${rateLimits.windowStart} < ${before}::timestamptz`).returning({ id: rateLimits.id });
  return rows.length;
}
