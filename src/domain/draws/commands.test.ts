import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, openBreakWithLines } from "../../../tests/helpers/fixtures";
import { claimLines, markPaid } from "@/domain/lines/commands";
import { requestDraw, finaliseDraw, assignAwards } from "./commands";
import { getDrawResult } from "./queries";
import { FakeBeacon, type BeaconSource } from "@/crypto/beacon";
import { computeRanking, ALGORITHM_VERSION } from "@/crypto/draw";
import { breaks, breakSecrets, draws, awards, lines } from "@/db/schema";
import type { Tx } from "@/db/client";
import { AlreadyDrawn, BeaconUnavailable, InvalidInput, NotAuthorized, NotFilled } from "@/domain/errors";
import { SYSTEM, type Caller } from "@/domain/types";
import { encryptSecret } from "@/crypto/secrets";

const c = (u: { id: string }, role: Caller["role"] = "member"): Caller => ({ id: u.id, role, onboarded: true, banned: false });

/** Opens a 4-line break, two buyers, all paid → filled. Stores the fixture's secret so the test can recompute. */
async function filledBreak(tx: Tx) {
  const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const b2 = await makeUser(tx);
  const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
  const { ciphertext, keyId } = encryptSecret(b.secret, b.id);
  await tx.insert(breakSecrets).values({ breakId: b.id, ciphertext, keyId });
  await claimLines(tx, c(a), { breakId: b.id, numbers: [1, 2], batchId: randomUUID() });
  await claimLines(tx, c(b2), { breakId: b.id, numbers: [3, 4], batchId: randomUUID() });
  for (const n of [1, 2]) await markPaid(tx, c(host, "host"), { breakId: b.id, number: n, expectedOwnerId: a.id });
  for (const n of [3, 4]) await markPaid(tx, c(host, "host"), { breakId: b.id, number: n, expectedOwnerId: b2.id });
  return { host, a, b2, b };
}

describe("requestDraw", () => {
  it("records a request, a beacon round ≥ 60s out, and moves to drawing; idempotent", async () => {
    await withTx(async (tx) => {
      const { host, b } = await filledBreak(tx);
      const r1 = await requestDraw(tx, c(host, "host"), { breakId: b.id });
      const [row] = await tx.select().from(breaks).where(sql`${breaks.id} = ${b.id}`);
      expect(row.status).toBe("drawing");
      expect(r1.beaconRound).toBeGreaterThan(new FakeBeacon().roundAt(new Date()) + 19);
      const r2 = await requestDraw(tx, c(host, "host"), { breakId: b.id });
      expect(r2.requestId).toBe(r1.requestId);
    });
  });
  it("refuses when not filled", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 2 });
      await expect(requestDraw(tx, c(host, "host"), { breakId: b.id })).rejects.toBeInstanceOf(NotFilled);
    });
  });
  it("admin on behalf of the host needs a note; refuses once drawn", async () => {
    await withTx(async (tx) => {
      const { b } = await filledBreak(tx);
      const admin = await makeUser(tx, { role: "admin" });
      await expect(requestDraw(tx, c(admin, "admin"), { breakId: b.id })).rejects.toBeInstanceOf(InvalidInput);
      await requestDraw(tx, c(admin, "admin"), { breakId: b.id, onBehalfNote: "host asked by DM" });
      await finaliseDraw(tx, SYSTEM, { breakId: b.id }, new FakeBeacon());
      await expect(requestDraw(tx, c(admin, "admin"), { breakId: b.id, onBehalfNote: "again" })).rejects.toBeInstanceOf(AlreadyDrawn);
    });
  });
  it("freezes lines: un-mark paid is refused while drawing", async () => {
    await withTx(async (tx) => {
      const { host, b, a } = await filledBreak(tx);
      await requestDraw(tx, c(host, "host"), { breakId: b.id });
      const { unmarkPaid } = await import("@/domain/lines/commands");
      await expect(unmarkPaid(tx, c(host, "host"), { breakId: b.id, number: 1 })).rejects.toThrow(/The draw is running/);
      void a;
    });
  });
});

describe("finaliseDraw", () => {
  it("produces the same ranking as the shared crypto module and creates awards", async () => {
    await withTx(async (tx) => {
      const { host, a, b2, b } = await filledBreak(tx);
      const { beaconRound } = await requestDraw(tx, c(host, "host"), { breakId: b.id });
      const beacon = new FakeBeacon();
      const r = await finaliseDraw(tx, SYSTEM, { breakId: b.id }, beacon);
      const bv = await beacon.fetch(beaconRound);
      const expected = computeRanking({ version: ALGORITHM_VERSION, secret: b.secret, beacon: bv!.randomness, breakId: b.id,
        entries: [{ number: 1, ownerId: a.id }, { number: 2, ownerId: a.id }, { number: 3, ownerId: b2.id }, { number: 4, ownerId: b2.id }] });
      expect(r.ranking).toEqual(expected.ranking);
      const [d] = await tx.select().from(draws).where(sql`${draws.id} = ${r.drawId}`);
      expect(d.resultHash).toBe(expected.resultHash);
      expect(d.beaconRound).toBe(beaconRound);
      const aw = await tx.select().from(awards).where(sql`${awards.breakId} = ${b.id}`);
      expect(aw).toHaveLength(1); expect(aw[0].rank).toBe(1);
      const winnerLine = expected.ranking[0];
      expect(aw[0].winnerId).toBe(winnerLine <= 2 ? a.id : b2.id);
      expect(aw[0].pickedAt).not.toBeNull();
      expect(await tx.select().from(breakSecrets).where(sql`${breakSecrets.breakId} = ${b.id}`)).toHaveLength(0);
      const [row] = await tx.select().from(breaks).where(sql`${breaks.id} = ${b.id}`);
      expect(row.status).toBe("drawn");
    });
  });
  it("throws BeaconUnavailable when the beacon can't be fetched and leaves the break drawing", async () => {
    await withTx(async (tx) => {
      const { host, b } = await filledBreak(tx);
      await requestDraw(tx, c(host, "host"), { breakId: b.id });
      const down: BeaconSource = { roundAt: (t) => new FakeBeacon().roundAt(t), fetch: async () => null };
      await expect(finaliseDraw(tx, SYSTEM, { breakId: b.id }, down)).rejects.toBeInstanceOf(BeaconUnavailable);
      const [row] = await tx.select().from(breaks).where(sql`${breaks.id} = ${b.id}`);
      expect(row.status).toBe("drawing");
    });
  });
  it("refuses a non-participant but lets a participant finalise", async () => {
    await withTx(async (tx) => {
      const { host, a, b } = await filledBreak(tx);
      const stranger = await makeUser(tx);
      await requestDraw(tx, c(host, "host"), { breakId: b.id });
      await expect(finaliseDraw(tx, c(stranger), { breakId: b.id }, new FakeBeacon())).rejects.toBeInstanceOf(NotAuthorized);
      const r = await finaliseDraw(tx, c(a), { breakId: b.id }, new FakeBeacon());
      expect(r.ranking).toHaveLength(4);
    });
  });
  it("is idempotent once drawn", async () => {
    await withTx(async (tx) => {
      const { host, b } = await filledBreak(tx);
      await requestDraw(tx, c(host, "host"), { breakId: b.id });
      const r1 = await finaliseDraw(tx, SYSTEM, { breakId: b.id }, new FakeBeacon());
      const r2 = await finaliseDraw(tx, SYSTEM, { breakId: b.id }, new FakeBeacon());
      expect(r2.drawId).toBe(r1.drawId);
    });
  });
  it("recomputes byte-identically after a crash mid-finalise (transaction rolled back)", async () => {
    // Run finalise in a nested savepoint that throws after the draws insert, then run it again for real.
    await withTx(async (tx) => {
      const { host, b } = await filledBreak(tx);
      await requestDraw(tx, c(host, "host"), { breakId: b.id });
      const beacon = new FakeBeacon();
      let first: typeof draws.$inferSelect | undefined;
      await expect(tx.transaction(async (sp) => {
        const r = await finaliseDraw(sp, SYSTEM, { breakId: b.id }, beacon);
        [first] = await sp.select().from(draws).where(sql`${draws.id} = ${r.drawId}`);
        throw new Error("simulated crash after insert");
      })).rejects.toThrow(/simulated/);
      expect(await tx.select().from(draws).where(sql`${draws.breakId} = ${b.id}`)).toHaveLength(0);
      const again = await finaliseDraw(tx, SYSTEM, { breakId: b.id }, beacon);
      const [d] = await tx.select().from(draws).where(sql`${draws.id} = ${again.drawId}`);
      expect(d.ranking).toEqual(first!.ranking);
      expect(d.seed).toBe(first!.seed);
      expect(d.resultHash).toBe(first!.resultHash);
      expect(d.entriesSnapshot).toEqual(first!.entriesSnapshot);
    });
  });
  it("includes bonus lines in the entries and the result page data", async () => {
    await withTx(async (tx) => {
      const { host, b, a } = await filledBreak(tx);
      await tx.insert(lines).values({ breakId: b.id, number: 5, ownerId: a.id, claimedAt: new Date(), paidAt: new Date(), priceCents: 0, isBonus: true });
      await requestDraw(tx, c(host, "host"), { breakId: b.id });
      await finaliseDraw(tx, SYSTEM, { breakId: b.id }, new FakeBeacon());
      const res = (await getDrawResult(tx, b.id))!;
      expect(res.entries.map((e) => e.number)).toEqual([1, 2, 3, 4, 5]);
      expect(res.entries[4].isBonus).toBe(true);
      expect(res.ranking).toHaveLength(5);
    });
  });
});

describe("assignAwards", () => {
  const entries = [{ number: 1, ownerId: "A" }, { number: 2, ownerId: "A" }, { number: 3, ownerId: "B" }];
  const prizeRows = [{ rank: 1, itemId: "i1" }, { rank: 2, itemId: "i2" }];
  it("per-line by default: the same person can win twice", () => {
    expect(assignAwards([2, 1, 3], entries, prizeRows, false)).toEqual([{ rank: 1, winnerId: "A", itemId: "i1" }, { rank: 2, winnerId: "A", itemId: "i2" }]);
  });
  it("one prize per person skips to the next distinct winner", () => {
    expect(assignAwards([2, 1, 3], entries, prizeRows, true)).toEqual([{ rank: 1, winnerId: "A", itemId: "i1" }, { rank: 2, winnerId: "B", itemId: "i2" }]);
  });
  it("a choice set (several items at one rank) yields one award with itemId null", () => {
    expect(assignAwards([3, 1, 2], entries, [{ rank: 1, itemId: "x" }, { rank: 1, itemId: "y" }], false)).toEqual([{ rank: 1, winnerId: "B", itemId: null }]);
  });
});
