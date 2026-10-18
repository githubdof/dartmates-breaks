import { and, eq, isNull } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, draws } from "@/db/schema";
import { verifyInputs } from "@/crypto/verify";
import { publicInputsOf } from "./public-inputs";

/**
 * The draws.verified_at backfill (migration 0004, scripts/verify-draws.ts): the result page's check over every active
 * draw not yet marked. A draw that fails stays null. Voided draws are immutable and never counted.
 */
export async function verifyStoredDraws(tx: Tx): Promise<{ checked: number; verified: number }> {
  const rows = await tx.select({ draw: draws, seedCommitment: breaks.seedCommitment }).from(draws)
    .innerJoin(breaks, eq(breaks.id, draws.breakId)).where(and(isNull(draws.verifiedAt), isNull(draws.voidedAt)));
  let verified = 0;
  for (const r of rows) {
    if (!verifyInputs(publicInputsOf(r.draw, r.seedCommitment)).ok) continue;
    await tx.update(draws).set({ verifiedAt: new Date() }).where(eq(draws.id, r.draw.id));
    verified += 1;
  }
  return { checked: rows.length, verified };
}
