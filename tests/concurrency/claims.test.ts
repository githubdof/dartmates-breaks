import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { makeUser, openBreakWithLines, assertInvariants } from "../helpers/fixtures";
import { claimLines, claimRandom } from "@/domain/lines/commands";
import { CapExceeded } from "@/domain/errors";
import { GLOBAL_UNPAID_CAP } from "@/domain/breaks/rules";
import { lines } from "@/db/schema";
import type { Caller } from "@/domain/types";

const c = (id: string): Caller => ({ id, role: "member", onboarded: true, banned: false });

describe("concurrent claims", () => {
  it("ten buyers racing for the same 3 lines: each line ends with exactly one owner", async () => {
    const { b, buyers } = await db.transaction(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 12 });
      const buyers = await Promise.all(Array.from({ length: 10 }, () => makeUser(tx)));
      return { b, buyers };
    });
    const results = await Promise.allSettled(buyers.map((u) => db.transaction((tx) => claimLines(tx, c(u.id), { breakId: b.id, numbers: [1, 2, 3], batchId: randomUUID() }))));
    const got = results.flatMap((r) => (r.status === "fulfilled" ? r.value.got : []));
    expect(got.sort((x, y) => x - y)).toEqual([1, 2, 3]);
    const rows = await db.select().from(lines).where(sql`${lines.breakId} = ${b.id} and ${lines.number} <= 3`);
    expect(rows.every((r) => r.ownerId !== null)).toBe(true);
    await db.transaction((tx) => assertInvariants(tx));
  });

  it("random claims never hand out the same line twice and never exceed the open count", async () => {
    const { b, buyers } = await db.transaction(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 10 });
      const buyers = await Promise.all(Array.from({ length: 6 }, () => makeUser(tx)));
      return { b, buyers };
    });
    const results = await Promise.allSettled(buyers.map((u) => db.transaction((tx) => claimRandom(tx, c(u.id), { breakId: b.id, count: 2, batchId: randomUUID() }))));
    const got = results.flatMap((r) => (r.status === "fulfilled" ? r.value.got : []));
    expect(new Set(got).size).toBe(got.length);
    expect(got.length).toBeLessThanOrEqual(10);
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(5); // 10 lines / 2 each
    const owned = await db.select().from(lines).where(sql`${lines.breakId} = ${b.id} and ${lines.ownerId} is not null`);
    expect(owned).toHaveLength(10);
    await db.transaction((tx) => assertInvariants(tx));
  });

  it("parallel claims on two breaks cannot push one buyer past the global unpaid cap", async () => {
    expect(GLOBAL_UNPAID_CAP).toBe(30); // the numbers below assume the 30-line cap
    // The two claims lock different break rows, so only the per-user advisory lock (lockUser) orders them.
    // Without it both would read globalUnpaid = 25 and commit 35. That overlap only shows up when both
    // transactions start on connections that are already open: on a cold pool the second waits for a
    // TCP+SCRAM handshake and the first may commit before it starts, so the test would pass by accident.
    // Hence the pool warm-up before each race and five rounds, each with a fresh buyer and fresh breaks.
    for (let round = 0; round < 5; round++) {
      const { a, bb, buyer } = await db.transaction(async (tx) => {
        const host = await makeUser(tx, { role: "host" });
        // Break A needs room for the 25 pre-held lines plus 5 more, so it has 40.
        const a = await openBreakWithLines(tx, { hostId: host.id, lineCount: 40 });
        const bb = await openBreakWithLines(tx, { hostId: host.id, lineCount: 20 });
        const buyer = await makeUser(tx);
        return { a, bb, buyer };
      });
      // Committed first: the buyer already holds 25 unpaid lines on break A.
      await db.transaction((tx) => claimLines(tx, c(buyer.id), { breakId: a.id, numbers: Array.from({ length: 25 }, (_, i) => i + 1), batchId: randomUUID() }));
      await Promise.all([db.execute(sql`select 1`), db.execute(sql`select 1`), db.execute(sql`select 1`)]);
      const results = await Promise.allSettled([
        db.transaction((tx) => claimRandom(tx, c(buyer.id), { breakId: a.id, count: 5, batchId: randomUUID() })),
        db.transaction((tx) => claimRandom(tx, c(buyer.id), { breakId: bb.id, count: 5, batchId: randomUUID() })),
      ]);
      expect(results.filter((r) => r.status === "fulfilled"), `round ${round}`).toHaveLength(1);
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(rejected, `round ${round}`).toHaveLength(1);
      expect(rejected[0].reason, `round ${round}`).toBeInstanceOf(CapExceeded);
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(lines).where(sql`${lines.ownerId} = ${buyer.id} and ${lines.paidAt} is null`);
      expect(n, `round ${round}`).toBe(30);
    }
    await db.transaction((tx) => assertInvariants(tx));
  });
});
