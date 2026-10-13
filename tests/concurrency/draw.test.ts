import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { makeUser, openBreakWithLines, assertInvariants } from "../helpers/fixtures";
import { claimLines, markPaid } from "@/domain/lines/commands";
import { requestDraw, finaliseDraw } from "@/domain/draws/commands";
import { FakeBeacon } from "@/crypto/beacon";
import { encryptSecret } from "@/crypto/secrets";
import { breakSecrets, draws, drawRequests, awards } from "@/db/schema";
import { SYSTEM, type Caller } from "@/domain/types";

const c = (id: string, role: Caller["role"] = "member"): Caller => ({ id, role, onboarded: true, banned: false });

/** A committed, filled 2-line break with its secret stored. */
async function filledBreak() {
  return db.transaction(async (tx) => {
    const host = await makeUser(tx, { role: "host" }); const a = await makeUser(tx);
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 2 });
    const { ciphertext, keyId } = encryptSecret(b.secret, b.id);
    await tx.insert(breakSecrets).values({ breakId: b.id, ciphertext, keyId });
    await claimLines(tx, c(a.id), { breakId: b.id, numbers: [1, 2], batchId: randomUUID() });
    await markPaid(tx, c(host.id, "host"), { breakId: b.id, number: 1, expectedOwnerId: a.id });
    await markPaid(tx, c(host.id, "host"), { breakId: b.id, number: 2, expectedOwnerId: a.id });
    return { host, b };
  });
}

describe("concurrent draw", () => {
  it("two concurrent requestDraw calls create one request", async () => {
    const { host, b } = await filledBreak();
    const results = await Promise.allSettled([
      db.transaction((tx) => requestDraw(tx, c(host.id, "host"), { breakId: b.id })),
      db.transaction((tx) => requestDraw(tx, c(host.id, "host"), { breakId: b.id })),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const ids = results.map((r) => (r as PromiseFulfilledResult<{ requestId: string }>).value.requestId);
    expect(ids[0]).toBe(ids[1]);
    const rows = await db.select().from(drawRequests).where(sql`${drawRequests.breakId} = ${b.id}`);
    expect(rows).toHaveLength(1);
    await db.transaction((tx) => assertInvariants(tx));
  });

  it("two simultaneous finalise calls produce exactly one draw row", async () => {
    const { host, b } = await filledBreak();
    await db.transaction((tx) => requestDraw(tx, c(host.id, "host"), { breakId: b.id }));
    const beacon = new FakeBeacon();
    const results = await Promise.allSettled([
      db.transaction((tx) => finaliseDraw(tx, SYSTEM, { breakId: b.id }, beacon)),
      db.transaction((tx) => finaliseDraw(tx, SYSTEM, { breakId: b.id }, beacon)),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const ids = results.map((r) => (r as PromiseFulfilledResult<{ drawId: string }>).value.drawId);
    expect(ids[0]).toBe(ids[1]);
    const rows = await db.select().from(draws).where(sql`${draws.breakId} = ${b.id}`);
    expect(rows).toHaveLength(1);
    const awardRows = await db.select().from(awards).where(sql`${awards.drawId} = ${rows[0].id}`);
    expect(awardRows).toHaveLength(1); // one prize rank in the fixture, awarded once
    await db.transaction((tx) => assertInvariants(tx));
  });
});
