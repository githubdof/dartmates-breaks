import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { makeUser, openBreakWithLines, makePhoto, makeTicket, newPrefix, assertInvariants } from "../helpers/fixtures";
import { breakPhotos, breaks, breakSecrets, photoUploads } from "@/db/schema";
import { encryptSecret } from "@/crypto/secrets";
import { claimLines, markPaid } from "@/domain/lines/commands";
import { requestDraw } from "@/domain/draws/commands";
import { InvalidInput, NotOpen, notOpenMessage } from "@/domain/errors";
import type { Caller } from "@/domain/types";
import { issueUploadTicket, recordProcessedPhoto, removePhoto, reorderPhotos } from "@/domain/photos/commands";

const c = (id: string, role: Caller["role"] = "member"): Caller => ({ id, role, onboarded: true, banned: false });
const ROUNDS = 10;
const livePositions = async (breakId: string) => (await db.select({ p: breakPhotos.position }).from(breakPhotos)
  .where(sql`${breakPhotos.breakId} = ${breakId} and ${breakPhotos.removedAt} is null and ${breakPhotos.hiddenAt} is null`)
  .orderBy(breakPhotos.position)).map((r) => r.p);
const record = (hostId: string, breakId: string, ticketId: string) => (tx: Tx) => recordProcessedPhoto(tx, c(hostId, "host"),
  { ticketId, prefix: newPrefix(breakId), width: 1600, height: 1200, slot: null, alt: "Darts", location: "photos", now: new Date() });
/** Resolves once some backend waits on a row lock: the second transaction is queued behind the first. */
async function blockedOnLock(): Promise<void> {
  for (let i = 0; i < 300; i++) {
    const [r] = await db.execute<{ n: number }>(sql`select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`);
    if (r.n > 0) return;
    await new Promise((res) => setTimeout(res, 10));
  }
  throw new Error("the second transaction never waited on the break lock");
}
/** Runs `first` in a transaction that holds its locks until `release()`; `held` resolves once `first` returned. */
function gated<T>(first: (tx: Tx) => Promise<T>) {
  let release!: () => void; let held!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const ready = new Promise<void>((r) => (held = r));
  const done = db.transaction(async (tx) => { const v = await first(tx); held(); await gate; return v; });
  return { done, ready, release };
}
/** A committed, filled 2-line break and one ticket issued while filled. */
async function filledWithTicket() {
  return db.transaction(async (tx) => {
    const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 2 });
    const { ciphertext, keyId } = encryptSecret(b.secret, b.id);
    await tx.insert(breakSecrets).values({ breakId: b.id, ciphertext, keyId });
    await claimLines(tx, c(a.id), { breakId: b.id, numbers: [1, 2], batchId: randomUUID() });
    await markPaid(tx, c(host.id, "host"), { breakId: b.id, number: 1, expectedOwnerId: a.id });
    await markPaid(tx, c(host.id, "host"), { breakId: b.id, number: 2, expectedOwnerId: a.id });
    const { ticketId } = await issueUploadTicket(tx, c(host.id, "host"), { breakId: b.id, now: new Date() });
    return { host, b, ticketId };
  });
}

describe("photo races", () => {
  it("two finalises racing for the 8th place: exactly one wins", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { host, b, t1, t2 } = await db.transaction(async (tx) => {
        const host = await makeUser(tx, { role: "host" });
        const b = await openBreakWithLines(tx, { hostId: host.id });
        for (let i = 0; i < 7; i++) await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: i });
        // Two valid tickets for one place: issuing would refuse the second; this is the lock's own guarantee under test.
        const exp = new Date(Date.now() + 300_000);
        return { host, b, t1: await makeTicket(tx, { hostId: host.id, breakId: b.id, expiresAt: exp }), t2: await makeTicket(tx, { hostId: host.id, breakId: b.id, expiresAt: exp }) };
      });
      const results = await Promise.allSettled([db.transaction(record(host.id, b.id, t1.id)), db.transaction(record(host.id, b.id, t2.id))]);
      expect(results.filter((r) => r.status === "fulfilled"), `round ${round}`).toHaveLength(1);
      const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected")!;
      expect(rejected.reason, `round ${round}`).toBeInstanceOf(InvalidInput); // the cap, not a unique-index violation
      expect(rejected.reason.message).toBe("A break can have up to 8 photos.");
      expect(await livePositions(b.id), `round ${round}`).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      const consumed = await db.select().from(photoUploads).where(sql`${photoUploads.breakId} = ${b.id} and ${photoUploads.consumedAt} is not null`);
      expect(consumed, `round ${round}`).toHaveLength(1);
    }
  });

  it("a draw requested first: the finalise queued behind it is refused and adds nothing", async () => {
    const { host, b, ticketId } = await filledWithTicket();
    const draw = gated((tx) => requestDraw(tx, c(host.id, "host"), { breakId: b.id }));
    await draw.ready;
    const rec = db.transaction(record(host.id, b.id, ticketId));
    await blockedOnLock();
    draw.release();
    await expect(draw.done).resolves.toBeTruthy();
    await expect(rec).rejects.toBeInstanceOf(NotOpen);
    await expect(db.transaction(record(host.id, b.id, ticketId))).rejects.toThrow(notOpenMessage("drawing"));
    expect(await livePositions(b.id)).toEqual([]);
  });

  it("a finalise first: the draw waits for it, and the photo is there before drawing", async () => {
    const { host, b, ticketId } = await filledWithTicket();
    const rec = gated(record(host.id, b.id, ticketId));
    await rec.ready;
    const draw = db.transaction((tx) => requestDraw(tx, c(host.id, "host"), { breakId: b.id }));
    await blockedOnLock();
    rec.release();
    await expect(rec.done).resolves.toMatchObject({ location: "photos" });
    await expect(draw).resolves.toBeTruthy();
    expect(await livePositions(b.id)).toEqual([0]);
    const [row] = await db.select({ status: breaks.status }).from(breaks).where(sql`${breaks.id} = ${b.id}`);
    expect(row.status).toBe("drawing");
  });

  it("finalise against requestDraw, unordered: the draw always lands; the photo lands or is refused as NotOpen", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { host, b, ticketId } = await filledWithTicket();
      const [rec, draw] = await Promise.allSettled([db.transaction(record(host.id, b.id, ticketId)), db.transaction((tx) => requestDraw(tx, c(host.id, "host"), { breakId: b.id }))]);
      expect(draw.status, `round ${round}`).toBe("fulfilled");
      if (rec.status === "rejected") expect(rec.reason, `round ${round}`).toBeInstanceOf(NotOpen);
      expect(await livePositions(b.id), `round ${round}`).toEqual(rec.status === "fulfilled" ? [0] : []);
    }
    await db.transaction((tx) => assertInvariants(tx));
  });

  it("reorder racing remove: positions stay 0..n−1", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { host, b, ids } = await db.transaction(async (tx) => {
        const host = await makeUser(tx, { role: "host" });
        const b = await openBreakWithLines(tx, { hostId: host.id });
        const ids: string[] = [];
        for (let i = 0; i < 4; i++) ids.push((await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: i })).id);
        return { host, b, ids };
      });
      const [reorder, remove] = await Promise.allSettled([
        db.transaction((tx) => reorderPhotos(tx, c(host.id, "host"), { breakId: b.id, order: [...ids].reverse(), now: new Date() })),
        db.transaction((tx) => removePhoto(tx, c(host.id, "host"), { photoId: ids[1], now: new Date() })),
      ]);
      expect(remove.status, `round ${round}`).toBe("fulfilled");
      if (reorder.status === "rejected") expect(reorder.reason.message, `round ${round}`).toBe("The photos just changed. Try again.");
      expect(await livePositions(b.id), `round ${round}`).toEqual([0, 1, 2]);
    }
  });
});
