import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, openBreakWithLines, lineRows } from "../../../tests/helpers/fixtures";
import { claimLines, claimRandom, claimAllOpen, claimNext, markSent, markPaid, unmarkPaid, releaseLine, recomputeFill, releaseForBuyer, addBonusLine } from "./commands";
import { isOverdue } from "./rules";
import { ledgerByBuyer, globalUnpaidCount } from "./queries";
import { breaks, lines, events } from "@/db/schema";
import { CapExceeded, InvalidInput, LineTaken, NotAuthorized, NotOpen, OwnerChanged } from "@/domain/errors";
import type { Caller } from "@/domain/types";
import type { Tx } from "@/db/client";

const c = (u: { id: string }, role: Caller["role"] = "member"): Caller => ({ id: u.id, role, onboarded: true, banned: false });
const status = async (tx: Tx, id: string) => (await tx.select({ s: breaks.status }).from(breaks).where(sql`${breaks.id} = ${id}`))[0].s;

describe("claimLines", () => {
  it("claims free lines, snapshots price, sets claimed_at, logs one batch event", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 12, linePriceCents: 2000 });
      const batchId = randomUUID();
      const r = await claimLines(tx, c(buyer), { breakId: b.id, numbers: [4, 7, 11], batchId });
      expect(r).toEqual({ got: [4, 7, 11], taken: [] });
      const rows = await lineRows(tx, b.id);
      expect(rows[3].ownerId).toBe(buyer.id); expect(rows[3].priceCents).toBe(2000); expect(rows[3].claimedAt).not.toBeNull();
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${b.id} and ${events.type} = 'line.claimed'`);
      expect(evs).toHaveLength(1); expect(evs[0].payload).toEqual({ numbers: [4, 7, 11] }); expect(evs[0].batchId).toBe(batchId);
    });
  });
  it("succeeds partially and reports taken lines", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const bb = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [7], batchId: randomUUID() });
      const r = await claimLines(tx, c(bb), { breakId: b.id, numbers: [4, 7, 11], batchId: randomUUID() });
      expect(r).toEqual({ got: [4, 11], taken: [7] });
    });
  });
  it("throws LineTaken only when nothing was obtained", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const bb = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [7], batchId: randomUUID() });
      await expect(claimLines(tx, c(bb), { breakId: b.id, numbers: [7], batchId: randomUUID() })).rejects.toBeInstanceOf(LineTaken);
    });
  });
  it("treats a retry with the same batch id as success (double-tap) and logs one event", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      const batchId = randomUUID();
      await claimLines(tx, c(a), { breakId: b.id, numbers: [3, 5], batchId });
      const r = await claimLines(tx, c(a), { breakId: b.id, numbers: [3, 5], batchId });
      expect(r).toEqual({ got: [3, 5], taken: [] });
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${b.id} and ${events.type} = 'line.claimed'`);
      expect(evs).toHaveLength(1);
    });
  });
  it("a same-batch retry after one line was released and re-claimed by someone else reports it taken", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const bb = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      const batchId = randomUUID();
      await claimLines(tx, c(a), { breakId: b.id, numbers: [3, 5], batchId });
      await releaseLine(tx, c(a), { breakId: b.id, number: 5, reason: "withdrawn" });
      await claimLines(tx, c(bb), { breakId: b.id, numbers: [5], batchId: randomUUID() });
      const r = await claimLines(tx, c(a), { breakId: b.id, numbers: [3, 5], batchId });
      expect(r).toEqual({ got: [3], taken: [5] });
    });
  });
  it("rejects claims on a break that is not a main break (minis and free draws are Plan 2)", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await tx.update(breaks).set({ kind: "mini" }).where(sql`${breaks.id} = ${b.id}`);
      await expect(claimLines(tx, c(a), { breakId: b.id, numbers: [1], batchId: randomUUID() })).rejects.toBeInstanceOf(InvalidInput);
    });
  });
  it("rejects claims when the break is not open", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await tx.update(breaks).set({ status: "cancelled" }).where(sql`${breaks.id} = ${b.id}`);
      await expect(claimLines(tx, c(a), { breakId: b.id, numbers: [1], batchId: randomUUID() })).rejects.toBeInstanceOf(NotOpen);
    });
  });
  it("enforces max_lines_per_user and the host self-claim share", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 20 });
      await tx.update(breaks).set({ maxLinesPerUser: 2 }).where(sql`${breaks.id} = ${b.id}`);
      await expect(claimLines(tx, c(a), { breakId: b.id, numbers: [1, 2, 3], batchId: randomUUID() })).rejects.toBeInstanceOf(CapExceeded);
      // host may hold at most 10% of 20 = 2
      await expect(claimLines(tx, c(host, "host"), { breakId: b.id, numbers: [4, 5, 6], batchId: randomUUID() })).rejects.toBeInstanceOf(CapExceeded);
      expect((await claimLines(tx, c(host, "host"), { breakId: b.id, numbers: [4, 5], batchId: randomUUID() })).got).toEqual([4, 5]);
    });
  });
  it("enforces the platform-wide unpaid cap across breaks", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b1 = await openBreakWithLines(tx, { hostId: host.id, lineCount: 30 });
      const b2 = await openBreakWithLines(tx, { hostId: host.id, lineCount: 10 });
      await claimLines(tx, c(a), { breakId: b1.id, numbers: Array.from({ length: 25 }, (_, i) => i + 1), batchId: randomUUID() });
      await expect(claimLines(tx, c(a), { breakId: b2.id, numbers: [1, 2, 3, 4, 5, 6], batchId: randomUUID() })).rejects.toBeInstanceOf(CapExceeded);
      await expect(claimRandom(tx, c(a), { breakId: b2.id, count: 6, batchId: randomUUID() })).rejects.toBeInstanceOf(CapExceeded);
      await expect(claimAllOpen(tx, c(a), { breakId: b2.id, batchId: randomUUID() })).rejects.toBeInstanceOf(CapExceeded);
      expect((await claimLines(tx, c(a), { breakId: b2.id, numbers: [1, 2, 3, 4, 5], batchId: randomUUID() })).got).toEqual([1, 2, 3, 4, 5]);
    });
  });
  it("a retry of lines already held succeeds even if a cap was lowered below what the caller holds", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      const batchId = randomUUID();
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1, 2, 3], batchId });
      await tx.update(breaks).set({ maxLinesPerUser: 2 }).where(sql`${breaks.id} = ${b.id}`);
      expect(await claimLines(tx, c(a), { breakId: b.id, numbers: [1, 2, 3], batchId })).toEqual({ got: [1, 2, 3], taken: [] });
      await expect(claimLines(tx, c(a), { breakId: b.id, numbers: [4], batchId: randomUUID() })).rejects.toBeInstanceOf(CapExceeded);
    });
  });
  it("never claims a line reserved for a mini", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      const mini = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await tx.update(lines).set({ reservedForMiniId: mini.id }).where(sql`${lines.breakId} = ${b.id} and ${lines.number} = 2`);
      const r = await claimLines(tx, c(a), { breakId: b.id, numbers: [1, 2], batchId: randomUUID() });
      expect(r).toEqual({ got: [1], taken: [2] });
    });
  });
});

describe("claimRandom / claimAllOpen", () => {
  it("gives n random open lines, or fails without partial claims", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 5 });
      const r = await claimRandom(tx, c(a), { breakId: b.id, count: 3, batchId: randomUUID() });
      expect(r.got).toHaveLength(3);
      await expect(claimRandom(tx, c(await makeUser(tx)), { breakId: b.id, count: 3, batchId: randomUUID() })).rejects.toBeInstanceOf(LineTaken);
      expect((await lineRows(tx, b.id)).filter((l) => l.ownerId).length).toBe(3);
    });
  });
  it("take-the-rest claims every open line", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const bb = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 5 });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1, 2], batchId: randomUUID() });
      expect((await claimAllOpen(tx, c(bb), { breakId: b.id, batchId: randomUUID() })).got).toEqual([3, 4, 5]);
    });
  });
  it("says every line is taken when a random claim finds none open", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 3 });
      await claimAllOpen(tx, c(a), { breakId: b.id, batchId: randomUUID() });
      await expect(claimRandom(tx, c(await makeUser(tx)), { breakId: b.id, count: 1, batchId: randomUUID() })).rejects.toThrow(/^Every line is taken\.$/);
    });
  });
});

describe("batch retries (same batch id after a lost response)", () => {
  const claimedEvents = async (tx: Tx, breakId: string) =>
    tx.select().from(events).where(sql`${events.breakId} = ${breakId} and ${events.type} = 'line.claimed'`);
  const owned = async (tx: Tx, breakId: string, userId: string) =>
    (await lineRows(tx, breakId)).filter((l) => l.ownerId === userId).map((l) => l.number);

  it("claimRandom returns the same lines and logs one event", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 10 });
      const batchId = randomUUID();
      const first = await claimRandom(tx, c(a), { breakId: b.id, count: 2, batchId });
      const again = await claimRandom(tx, c(a), { breakId: b.id, count: 2, batchId });
      expect(again.got).toEqual([...first.got].sort((x, y) => x - y));
      expect(await owned(tx, b.id, a.id)).toEqual(again.got);
      expect(await claimedEvents(tx, b.id)).toHaveLength(1);
    });
  });
  it("claimNext returns the same lines and logs one event, even after the claim took every line", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 3, claimMode: "straight" });
      const batchId = randomUUID();
      expect(await claimNext(tx, c(a), { breakId: b.id, count: 3, batchId })).toEqual({ got: [1, 2, 3] });
      // No line is open now; the retry still answers with the batch's lines instead of "Every line is taken."
      expect(await claimNext(tx, c(a), { breakId: b.id, count: 3, batchId })).toEqual({ got: [1, 2, 3] });
      expect(await claimedEvents(tx, b.id)).toHaveLength(1);
    });
  });
  it("claimAllOpen returns the same lines and logs one event, with no caps check on the retry", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const bb = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 5 });
      await claimLines(tx, c(bb), { breakId: b.id, numbers: [1], batchId: randomUUID() });
      const batchId = randomUUID();
      expect(await claimAllOpen(tx, c(a), { breakId: b.id, batchId })).toEqual({ got: [2, 3, 4, 5] });
      await tx.update(breaks).set({ maxLinesPerUser: 1 }).where(sql`${breaks.id} = ${b.id}`);
      expect(await claimAllOpen(tx, c(a), { breakId: b.id, batchId })).toEqual({ got: [2, 3, 4, 5] });
      expect(await owned(tx, b.id, a.id)).toEqual([2, 3, 4, 5]);
      expect((await claimedEvents(tx, b.id)).filter((e) => e.batchId === batchId)).toHaveLength(1);
    });
  });
});

describe("markSent / markPaid / recomputeFill", () => {
  it("fills the break when the last numbered line is paid and un-fills on un-mark", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 3 });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1, 2, 3], batchId: randomUUID() });
      await markSent(tx, c(a), { breakId: b.id, numbers: [1, 2, 3] });
      expect((await markPaid(tx, c(host, "host"), { breakId: b.id, number: 1, expectedOwnerId: a.id })).filled).toBe(false);
      await markPaid(tx, c(host, "host"), { breakId: b.id, number: 2, expectedOwnerId: a.id });
      expect((await markPaid(tx, c(host, "host"), { breakId: b.id, number: 3, expectedOwnerId: a.id })).filled).toBe(true);
      expect(await status(tx, b.id)).toBe("filled");
      await unmarkPaid(tx, c(host, "host"), { breakId: b.id, number: 2 });
      expect(await status(tx, b.id)).toBe("open");
      const [row] = await tx.select({ filledAt: breaks.filledAt }).from(breaks).where(sql`${breaks.id} = ${b.id}`);
      expect(row.filledAt).not.toBeNull(); // first fill is kept
    });
  });
  it("markPaid with a stale owner fails with OwnerChanged and pays nobody", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const bb = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1], batchId: randomUUID() });
      await releaseLine(tx, c(a), { breakId: b.id, number: 1, reason: "withdrawn" });
      await claimLines(tx, c(bb), { breakId: b.id, numbers: [1], batchId: randomUUID() });
      await expect(markPaid(tx, c(host, "host"), { breakId: b.id, number: 1, expectedOwnerId: a.id })).rejects.toBeInstanceOf(OwnerChanged);
      expect((await lineRows(tx, b.id))[0].paidAt).toBeNull();
    });
  });
  it("markPaid is idempotent and host-only", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1], batchId: randomUUID() });
      await markPaid(tx, c(host, "host"), { breakId: b.id, number: 1, expectedOwnerId: a.id });
      await expect(markPaid(tx, c(host, "host"), { breakId: b.id, number: 1, expectedOwnerId: a.id })).resolves.toEqual({ filled: false });
      await expect(markPaid(tx, c(a), { breakId: b.id, number: 1, expectedOwnerId: a.id })).rejects.toBeInstanceOf(NotAuthorized);
    });
  });
  it("does not fill while a numbered line is reserved for a mini and unowned", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 2 });
      const mini = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await tx.update(lines).set({ reservedForMiniId: mini.id }).where(sql`${lines.breakId} = ${b.id} and ${lines.number} = 2`);
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1], batchId: randomUUID() });
      await markPaid(tx, c(host, "host"), { breakId: b.id, number: 1, expectedOwnerId: a.id });
      expect(await status(tx, b.id)).toBe("open");
    });
  });
  it("does not fill when every numbered line is paid but a reserved line is still unowned", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 2 });
      const mini = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      // A paid line must be owned (lines_paid_owned_chk), so the only way to reach "all numbered lines paid,
      // one reserved and unowned" is a reserved line outside 1..line_count (Plan 2 bonus/mini lines).
      await tx.insert(lines).values({ breakId: b.id, number: 3, reservedForMiniId: mini.id });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1, 2], batchId: randomUUID() });
      await markPaid(tx, c(host, "host"), { breakId: b.id, number: 1, expectedOwnerId: a.id });
      expect((await markPaid(tx, c(host, "host"), { breakId: b.id, number: 2, expectedOwnerId: a.id })).filled).toBe(false);
      expect(await status(tx, b.id)).toBe("open");
      await tx.update(lines).set({ reservedForMiniId: null }).where(sql`${lines.breakId} = ${b.id} and ${lines.number} = 3`);
      expect(await recomputeFill(tx, b.id)).toBe(true);
      expect(await status(tx, b.id)).toBe("filled");
    });
  });
});

describe("markSent", () => {
  it("validates numbers, logs only newly-sent lines, and treats a repeat as a no-op", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const bb = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1, 2], batchId: randomUUID() });
      await expect(markSent(tx, c(a), { breakId: b.id, numbers: [999] })).rejects.toBeInstanceOf(InvalidInput);
      await expect(markSent(tx, c(a), { breakId: b.id, numbers: [] })).rejects.toBeInstanceOf(InvalidInput);
      await markSent(tx, c(a), { breakId: b.id, numbers: [1] });
      await markSent(tx, c(a), { breakId: b.id, numbers: [1, 2] });
      await markSent(tx, c(a), { breakId: b.id, numbers: [1, 2] }); // all already sent: no error, no event
      await expect(markSent(tx, c(bb), { breakId: b.id, numbers: [1] })).rejects.toBeInstanceOf(NotAuthorized);
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${b.id} and ${events.type} = 'line.sent'`)
        .orderBy(sql`jsonb_array_length(${events.payload}->'numbers')`);
      expect(evs.map((e) => e.payload)).toEqual([{ numbers: [1] }, { numbers: [2] }]);
    });
  });
});

describe("ledgerByBuyer", () => {
  it("lists every buyer in ledger order with per-buyer numbers, owed and overdue", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const alice = await makeUser(tx); const dave = await makeUser(tx); const carol = await makeUser(tx);
      const bob = await makeUser(tx); const erin = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 12, linePriceCents: 500 });
      const claim = (u: { id: string }, numbers: number[]) => claimLines(tx, c(u), { breakId: b.id, numbers, batchId: randomUUID() });
      await claim(alice, [2, 5]); await markSent(tx, c(alice), { breakId: b.id, numbers: [2, 5] });
      await claim(dave, [4]);
      await claim(carol, [9]);
      await claim(bob, [7]); await markPaid(tx, c(host, "host"), { breakId: b.id, number: 7, expectedOwnerId: bob.id });
      await claim(erin, [10, 11, 12]);
      await markPaid(tx, c(host, "host"), { breakId: b.id, number: 10, expectedOwnerId: erin.id });
      await markSent(tx, c(erin), { breakId: b.id, numbers: [11] });
      await tx.execute(sql`update lines set claimed_at = now() - interval '30 hours' where break_id = ${b.id} and number = 9`);
      await tx.execute(sql`update lines set claimed_at = now() - interval '29 hours' where break_id = ${b.id} and number = 12`);

      const rows = await ledgerByBuyer(tx, b.id, new Date());
      expect(rows.map((r) => r.ownerId)).toEqual([alice.id, dave.id, carol.id, erin.id, bob.id]);
      const by = Object.fromEntries(rows.map((r) => [r.ownerId, r]));
      expect(by[alice.id]).toMatchObject({ status: "sent", handle: alice.handle, unpaid: [2, 5], sent: [2, 5], overdue: [], paid: [], owedCents: 1000, overdueSince: null });
      expect(by[dave.id]).toMatchObject({ status: "unpaid", unpaid: [4], owedCents: 500 });
      expect(by[carol.id]).toMatchObject({ status: "overdue", overdue: [9], owedCents: 500 });
      expect(by[carol.id].overdueSince).toBeInstanceOf(Date);
      // Review Focus 4: one paid, one sent, one overdue line.
      expect(by[erin.id]).toMatchObject({ status: "overdue", numbers: [10, 11, 12], paid: [10], sent: [11], overdue: [12], unpaid: [11, 12], owedCents: 1000 });
      expect(by[bob.id]).toMatchObject({ status: "paid", paid: [7], unpaid: [], owedCents: 0 });
    });
  });
  it("is empty for a break nobody has claimed in", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id });
      expect(await ledgerByBuyer(tx, b.id, new Date())).toEqual([]);
    });
  });
});

describe("releaseForBuyer", () => {
  it("releases a buyer's lines in one call and logs one event per line", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [3, 4, 6], batchId: randomUUID() });
      expect(await releaseForBuyer(tx, c(host, "host"), { breakId: b.id, ownerId: a.id, numbers: [6, 3], reason: "host_dropped" })).toEqual({ released: [3, 6] });
      const rows = await lineRows(tx, b.id);
      expect([rows[2].ownerId, rows[3].ownerId, rows[5].ownerId]).toEqual([null, a.id, null]);
      expect(rows[2].claimedAt).toBeNull(); expect(rows[2].priceCents).toBeNull();
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${b.id} and ${events.type} = 'line.released'`)
        .orderBy(sql`(${events.payload}->>'number')::int`);
      expect(evs.map((e) => e.payload)).toEqual([{ number: 3, reason: "host_dropped" }, { number: 6, reason: "host_dropped" }]);
    });
  });
  it("releases nothing if one line changed hands or is paid", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const bb = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1, 3], batchId: randomUUID() });
      await claimLines(tx, c(bb), { breakId: b.id, numbers: [2], batchId: randomUUID() });
      await expect(releaseForBuyer(tx, c(host, "host"), { breakId: b.id, ownerId: a.id, numbers: [1, 2], reason: "host_dropped" })).rejects.toBeInstanceOf(OwnerChanged);
      expect((await lineRows(tx, b.id))[0].ownerId).toBe(a.id);
      await markPaid(tx, c(host, "host"), { breakId: b.id, number: 3, expectedOwnerId: a.id });
      await expect(releaseForBuyer(tx, c(host, "host"), { breakId: b.id, ownerId: a.id, numbers: [1, 3], reason: "host_dropped" })).rejects.toThrow(/paid/);
      expect((await lineRows(tx, b.id))[0].ownerId).toBe(a.id);
    });
  });
  it("needs every line overdue for the overdue reason, and only the host may release", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const other = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1, 2], batchId: randomUUID() });
      await tx.execute(sql`update lines set claimed_at = now() - interval '25 hours' where break_id = ${b.id} and number = 1`);
      await expect(releaseForBuyer(tx, c(host, "host"), { breakId: b.id, ownerId: a.id, numbers: [1, 2], reason: "overdue" })).rejects.toThrow(/not overdue yet/);
      await expect(releaseForBuyer(tx, c(other), { breakId: b.id, ownerId: a.id, numbers: [1], reason: "overdue" })).rejects.toBeInstanceOf(NotAuthorized);
      expect(await releaseForBuyer(tx, c(host, "host"), { breakId: b.id, ownerId: a.id, numbers: [1], reason: "overdue" })).toEqual({ released: [1] });
    });
  });
});

describe("addBonusLine", () => {
  it("adds the next number above N as a paid bonus line, within 10% of N", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 12 });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [5], batchId: randomUUID() });
      expect(await addBonusLine(tx, c(host, "host"), { breakId: b.id, ownerId: a.id })).toEqual({ number: 13 });
      const [l] = (await lineRows(tx, b.id)).filter((r) => r.number === 13);
      expect(l).toMatchObject({ ownerId: a.id, isBonus: true, priceCents: 0 });
      expect(l.paidAt).not.toBeNull(); expect(l.claimedAt).not.toBeNull();
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${b.id} and ${events.type} = 'line.bonus_added'`);
      expect(evs.map((e) => e.payload)).toEqual([{ number: 13, ownerId: a.id }]);
      await expect(addBonusLine(tx, c(host, "host"), { breakId: b.id, ownerId: a.id })).rejects.toBeInstanceOf(CapExceeded);
      expect(await status(tx, b.id)).toBe("open");
    });
  });
  it("cannot be un-marked paid", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 12 });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [5], batchId: randomUUID() });
      const { number } = await addBonusLine(tx, c(host, "host"), { breakId: b.id, ownerId: a.id });
      await expect(unmarkPaid(tx, c(host, "host"), { breakId: b.id, number })).rejects.toThrow(/not marked paid/);
      const [l] = (await lineRows(tx, b.id)).filter((r) => r.number === number);
      expect(l.paidAt).not.toBeNull();
    });
  });
  it("only goes to someone holding a line, and only the host may add it", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const stranger = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 20 });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1], batchId: randomUUID() });
      await expect(addBonusLine(tx, c(host, "host"), { breakId: b.id, ownerId: stranger.id })).rejects.toThrow(/holds a line/);
      await expect(addBonusLine(tx, c(a), { breakId: b.id, ownerId: a.id })).rejects.toBeInstanceOf(NotAuthorized);
    });
  });
  it("never goes to the host, even when the host holds a line", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 20 });
      await claimLines(tx, c(host, "host"), { breakId: b.id, numbers: [1], batchId: randomUUID() });
      const p = addBonusLine(tx, c(host, "host"), { breakId: b.id, ownerId: host.id });
      await expect(p).rejects.toBeInstanceOf(InvalidInput);
      await expect(p).rejects.toThrow("Bonus lines go to buyers, not the host");
      expect((await lineRows(tx, b.id)).filter((l) => l.isBonus)).toHaveLength(0);
    });
  });
  it("allows one bonus line below 10 lines", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 6 });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [2], batchId: randomUUID() });
      expect(await addBonusLine(tx, c(host, "host"), { breakId: b.id, ownerId: a.id })).toEqual({ number: 7 });
      await expect(addBonusLine(tx, c(host, "host"), { breakId: b.id, ownerId: a.id })).rejects.toBeInstanceOf(CapExceeded);
    });
  });
  it("numbers the second bonus line N+2", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const bb = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 20 });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [3], batchId: randomUUID() });
      await claimLines(tx, c(bb), { breakId: b.id, numbers: [4], batchId: randomUUID() });
      expect(await addBonusLine(tx, c(host, "host"), { breakId: b.id, ownerId: a.id })).toEqual({ number: 21 });
      expect(await addBonusLine(tx, c(host, "host"), { breakId: b.id, ownerId: bb.id })).toEqual({ number: 22 });
    });
  });
  it("refuses minis and breaks that are neither open nor closed", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 20 });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [3], batchId: randomUUID() });
      await tx.update(breaks).set({ kind: "mini" }).where(sql`${breaks.id} = ${b.id}`);
      await expect(addBonusLine(tx, c(host, "host"), { breakId: b.id, ownerId: a.id })).rejects.toThrow(/main breaks only/);
      await tx.update(breaks).set({ kind: "main", status: "cancelled" }).where(sql`${breaks.id} = ${b.id}`);
      await expect(addBonusLine(tx, c(host, "host"), { breakId: b.id, ownerId: a.id })).rejects.toBeInstanceOf(NotOpen);
      expect((await lineRows(tx, b.id)).filter((l) => l.isBonus)).toHaveLength(0);
    });
  });
});

describe("releaseLine", () => {
  it("host releases an unpaid claim; buyer can withdraw; paid lines cannot be released", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1, 2, 3], batchId: randomUUID() });
      await releaseLine(tx, c(host, "host"), { breakId: b.id, number: 1, reason: "host_dropped" });
      await releaseLine(tx, c(a), { breakId: b.id, number: 2, reason: "withdrawn" });
      await markPaid(tx, c(host, "host"), { breakId: b.id, number: 3, expectedOwnerId: a.id });
      await expect(releaseLine(tx, c(host, "host"), { breakId: b.id, number: 3, reason: "host_dropped" })).rejects.toThrow(/paid/);
      const rows = await lineRows(tx, b.id);
      expect(rows[0].ownerId).toBeNull(); expect(rows[0].claimedAt).toBeNull(); expect(rows[0].priceCents).toBeNull();
      // events.id is a random uuid and created_at = now() is identical within one tx, so order by the released number.
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${b.id} and ${events.type} = 'line.released'`)
        .orderBy(sql`(${events.payload}->>'number')::int`);
      expect(evs.map((e) => e.payload)).toEqual([{ number: 1, reason: "host_dropped" }, { number: 2, reason: "withdrawn" }]);
    });
  });
  it("a buyer cannot release someone else's line", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const bb = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1], batchId: randomUUID() });
      await expect(releaseLine(tx, c(bb), { breakId: b.id, number: 1, reason: "withdrawn" })).rejects.toBeInstanceOf(NotAuthorized);
    });
  });
  it("releasing as overdue requires the claim to actually be overdue", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await claimLines(tx, c(a), { breakId: b.id, numbers: [1], batchId: randomUUID() });
      await expect(releaseLine(tx, c(host, "host"), { breakId: b.id, number: 1, reason: "overdue" })).rejects.toThrow(/not overdue yet/);
      await tx.execute(sql`update lines set claimed_at = now() - interval '25 hours' where break_id = ${b.id} and number = 1`);
      await releaseLine(tx, c(host, "host"), { breakId: b.id, number: 1, reason: "overdue" });
      expect((await lineRows(tx, b.id))[0].ownerId).toBeNull();
    });
  });
});

describe("isOverdue", () => {
  const b = { paymentWindowHours: 24 };
  const now = new Date("2026-10-13T12:00:00Z");
  it("is overdue when claimed > window ago, unpaid and not sent", () => {
    expect(isOverdue({ claimedAt: new Date("2026-10-12T11:00:00Z"), sentAt: null, paidAt: null, ownerId: "x" }, b, now)).toBe(true);
    expect(isOverdue({ claimedAt: new Date("2026-10-12T11:00:00Z"), sentAt: new Date(), paidAt: null, ownerId: "x" }, b, now)).toBe(false);
    expect(isOverdue({ claimedAt: new Date("2026-10-13T11:00:00Z"), sentAt: null, paidAt: null, ownerId: "x" }, b, now)).toBe(false);
  });
});

describe("picking modes", () => {
  it("straight fill rejects picks and randoms; claimNext hands out the lowest open numbers", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx); const bb = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 6, claimMode: "straight" });
      await expect(claimLines(tx, c(a), { breakId: b.id, numbers: [3], batchId: randomUUID() })).rejects.toThrow(/fills in order/);
      await expect(claimRandom(tx, c(a), { breakId: b.id, count: 1, batchId: randomUUID() })).rejects.toThrow(/random/);
      expect(await claimNext(tx, c(a), { breakId: b.id, count: 2, batchId: randomUUID() })).toEqual({ got: [1, 2] });
      expect(await claimNext(tx, c(bb), { breakId: b.id, count: 3, batchId: randomUUID() })).toEqual({ got: [3, 4, 5] });
      await expect(claimNext(tx, c(a), { breakId: b.id, count: 2, batchId: randomUUID() })).rejects.toThrow(/Only 1 line is open/);
      expect((await claimAllOpen(tx, c(a), { breakId: b.id, batchId: randomUUID() })).got).toEqual([6]);
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${b.id} and ${events.type} = 'line.claimed'`);
      expect(evs).toHaveLength(3);
    });
  });
  it("pick only rejects randoms and claimNext but allows picks and take-the-rest", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4, claimMode: "pick_only" });
      await expect(claimRandom(tx, c(a), { breakId: b.id, count: 1, batchId: randomUUID() })).rejects.toBeInstanceOf(InvalidInput);
      await expect(claimNext(tx, c(a), { breakId: b.id, count: 1, batchId: randomUUID() })).rejects.toBeInstanceOf(InvalidInput);
      expect(await claimLines(tx, c(a), { breakId: b.id, numbers: [2], batchId: randomUUID() })).toEqual({ got: [2], taken: [] });
      expect((await claimAllOpen(tx, c(a), { breakId: b.id, batchId: randomUUID() })).got).toEqual([1, 3, 4]);
    });
  });
  it("claimNext respects the per-person cap", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 6, claimMode: "straight" });
      await tx.update(breaks).set({ maxLinesPerUser: 2 }).where(sql`${breaks.id} = ${b.id}`);
      await expect(claimNext(tx, c(a), { breakId: b.id, count: 3, batchId: randomUUID() })).rejects.toBeInstanceOf(CapExceeded);
      expect((await lineRows(tx, b.id)).filter((l) => l.ownerId).length).toBe(0);
    });
  });
});

describe("globalUnpaidCount", () => {
  it("counts a buyer's unpaid lines across breaks", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
      const b1 = await openBreakWithLines(tx, { hostId: host.id }); const b2 = await openBreakWithLines(tx, { hostId: host.id });
      await claimLines(tx, c(a), { breakId: b1.id, numbers: [1, 2], batchId: randomUUID() });
      await claimLines(tx, c(a), { breakId: b2.id, numbers: [3], batchId: randomUUID() });
      await markPaid(tx, c(host, "host"), { breakId: b1.id, number: 1, expectedOwnerId: a.id });
      expect(await globalUnpaidCount(tx, a.id)).toBe(2);
    });
  });
});
