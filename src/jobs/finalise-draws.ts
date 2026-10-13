import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { drawRequests } from "@/db/schema";
import { finaliseDraw } from "@/domain/draws/commands";
import { BeaconUnavailable } from "@/domain/errors";
import { SYSTEM } from "@/domain/types";
import type { BeaconSource } from "@/crypto/beacon";

/** Finalises every pending request whose beacon round ≤ currentRound. Returns ids finalised and ids skipped (round not reached or beacon unavailable). */
export async function finalisePendingDraws(tx: Tx, beacon: BeaconSource, currentRound: number): Promise<{ finalised: string[]; skipped: string[] }> {
  const pending = await tx.select({ breakId: drawRequests.breakId, round: drawRequests.beaconRound }).from(drawRequests).where(sql`${drawRequests.status} = 'pending'`);
  const finalised: string[] = [], skipped: string[] = [];
  for (const p of pending) {
    if (p.round > currentRound) { skipped.push(p.breakId); continue; }
    try {
      await tx.transaction(async (sp) => { await finaliseDraw(sp, SYSTEM, { breakId: p.breakId }, beacon); });
      finalised.push(p.breakId);
    } catch (e) {
      if (e instanceof BeaconUnavailable) skipped.push(p.breakId); else throw e;
    }
  }
  return { finalised, skipped };
}
