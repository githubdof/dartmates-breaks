import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, drawnBreak } from "../../../tests/helpers/fixtures";
import { breaks, draws, drawRequests } from "@/db/schema";
import type { Tx } from "@/db/client";
import { verifyInputs } from "@/crypto/verify";
import { publicInputsOf } from "./public-inputs";
import { verifyStoredDraws } from "./verify-stored";

/**
 * A ran break whose active draw predates migration 0004: the fixture's draw is voided and recorded again without
 * verified_at (a new request, the same secret, so the commitment guard passes). `tamper` reverses its ranking.
 */
async function unverifiedDraw(tx: Tx, o: { tamper?: boolean } = {}) {
  const host = await makeUser(tx, { role: "host" });
  const buyer = await makeUser(tx);
  const b = await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id] });
  const [d] = await tx.select().from(draws).where(eq(draws.id, b.drawId));
  await tx.update(draws).set({ voidedAt: new Date(), voidedBy: host.id, voidReason: "recorded again for the 0004 backfill test" }).where(eq(draws.id, d.id));
  const [req] = await tx.insert(drawRequests).values({ breakId: b.id, attempt: 2, requestedBy: host.id, beaconRound: d.beaconRound, status: "done" }).returning({ id: drawRequests.id });
  const [again] = await tx.insert(draws).values({
    breakId: d.breakId, requestId: req.id, secret: d.secret, beaconRound: d.beaconRound, beaconRandomness: d.beaconRandomness,
    beaconSignature: d.beaconSignature, seed: d.seed, algorithmVersion: d.algorithmVersion, entriesSnapshot: d.entriesSnapshot,
    ranking: o.tamper ? [...d.ranking].reverse() : d.ranking, resultHash: d.resultHash, runBy: d.runBy,
  }).returning();
  return again;
}

describe("draws.verified_at", () => {
  it("is set when finaliseDraw records a draw that checks out", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const buyer = await makeUser(tx);
      const b = await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id] });
      const [d] = await tx.select().from(draws).where(eq(draws.id, b.drawId));
      // The fixture's returned row predates openBreakWithLines' commitment update, so read the commitment back.
      const [{ seedCommitment }] = await tx.select({ seedCommitment: breaks.seedCommitment }).from(breaks).where(eq(breaks.id, b.id));
      expect(d.verifiedAt).toBeInstanceOf(Date);
      expect(verifyInputs(publicInputsOf(d, seedCommitment)).ok).toBe(true);
    });
  });
  it("is backfilled for a genuine draw and left empty for a tampered one", async () => {
    await withTx(async (tx) => {
      const genuine = await unverifiedDraw(tx);
      const tampered = await unverifiedDraw(tx, { tamper: true });
      expect([genuine.verifiedAt, tampered.verifiedAt]).toEqual([null, null]);
      const r = await verifyStoredDraws(tx);
      expect(r.checked).toBeGreaterThanOrEqual(2);
      expect(r.verified).toBeGreaterThanOrEqual(1);
      const [g] = await tx.select().from(draws).where(eq(draws.id, genuine.id));
      const [t] = await tx.select().from(draws).where(eq(draws.id, tampered.id));
      expect(g.verifiedAt).toBeInstanceOf(Date);
      expect(t.verifiedAt).toBeNull();
      // A second run never touches a draw it already marked.
      await verifyStoredDraws(tx);
      const [g2] = await tx.select().from(draws).where(eq(draws.id, genuine.id));
      expect(g2.verifiedAt).toEqual(g.verifiedAt);
    });
  });
});
