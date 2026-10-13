import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { drawRequests } from "@/db/schema";
import { finaliseDraw } from "@/domain/draws/commands";
import { BeaconUnavailable, DomainError } from "@/domain/errors";
import { SYSTEM } from "@/domain/types";
import type { BeaconSource } from "@/crypto/beacon";

export type FinaliseResult = { finalised: string[]; skipped: string[]; failed: { breakId: string; code: string }[] };

/** Finalises every pending request whose beacon round ≤ currentRound. Returns ids finalised, ids skipped (round not reached or beacon unavailable) and per-break failures. */
export async function finalisePendingDraws(tx: Tx, beacon: BeaconSource, currentRound: number): Promise<FinaliseResult> {
  const pending = await tx.select({ breakId: drawRequests.breakId, round: drawRequests.beaconRound }).from(drawRequests).where(sql`${drawRequests.status} = 'pending'`);
  const finalised: string[] = [], skipped: string[] = [];
  const failed: { breakId: string; code: string }[] = [];
  for (const p of pending) {
    if (p.round > currentRound) { skipped.push(p.breakId); continue; }
    try {
      await tx.transaction(async (sp) => { await finaliseDraw(sp, SYSTEM, { breakId: p.breakId }, beacon); });
      finalised.push(p.breakId);
    } catch (e) {
      if (e instanceof BeaconUnavailable) { skipped.push(p.breakId); continue; }
      // One bad break must not abort the sweep: record it and carry on.
      failed.push({ breakId: p.breakId, code: e instanceof DomainError ? e.code : "INTERNAL" });
      console.error(JSON.stringify({ job: "finalise-draws", breakId: p.breakId, error: String(e) }));
    }
  }
  return { finalised, skipped, failed };
}
