import type { Tx } from "@/db/client";

/**
 * Breaks whose photos the cleanup must keep for now (photos spec §5.6): archive retention and the expiry of a
 * cancelled break's photos skip them. Empty today. The reports plan replaces this body with "break ids with an open
 * report on the break or on anything in it" (platform spec §12).
 */
export async function breaksUnderHold(tx: Tx): Promise<ReadonlySet<string>> {
  void tx; // the reports plan's query reads through it
  return new Set();
}
