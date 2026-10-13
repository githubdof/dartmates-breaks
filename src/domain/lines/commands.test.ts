import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, openBreakWithLines, lineRows } from "../../../tests/helpers/fixtures";
import { claimLines, claimRandom, claimAllOpen, markSent, markPaid, unmarkPaid, releaseLine, recomputeFill } from "./commands";
import { isOverdue } from "./rules";
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
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${b.id} and ${events.type} = 'line.released'`);
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
