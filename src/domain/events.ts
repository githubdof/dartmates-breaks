import type { Tx } from "@/db/client";
import { events } from "@/db/schema";

export async function appendEvent(tx: Tx, e: {
  breakId?: string; actorId?: string; type: string; payload?: Record<string, unknown>; batchId?: string; ipHash?: string;
}, opts: { ignoreDuplicateBatch?: boolean; processedAt?: Date } = {}): Promise<string | null> {
  const insert = tx.insert(events).values({
    breakId: e.breakId, actorId: e.actorId, type: e.type, payload: e.payload ?? {}, batchId: e.batchId, ipHash: e.ipHash,
    // Audit-only types are written already processed, so they never sit in the unprocessed index (photos spec §4).
    processedAt: opts.processedAt ?? null,
  });
  // events_batch_uq is a partial unique index, which Drizzle can't target by name; with no target,
  // `on conflict do nothing` lets Postgres use any matching arbiter (here only events_batch_uq can conflict).
  const rows = await (opts.ignoreDuplicateBatch ? insert.onConflictDoNothing() : insert).returning({ id: events.id });
  return rows[0]?.id ?? null;
}
