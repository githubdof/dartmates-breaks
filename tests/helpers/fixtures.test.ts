import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { withTx } from "./db";
import { makeUser, openBreakWithLines, lineRows, assertInvariants } from "./fixtures";

const countUsers = async () => Number((await db.execute<{ n: string }>(sql`select count(*) as n from users`))[0].n);

describe("fixtures", () => {
  it("creates an open break with N unowned lines and rolls back", async () => {
    const before = await countUsers();
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 5 });
      const rows = await lineRows(tx, b.id);
      expect(rows.map((r) => r.number)).toEqual([1, 2, 3, 4, 5]);
      expect(rows.every((r) => r.ownerId === null)).toBe(true);
    });
    expect(await countUsers()).toBe(before);
  });

  it("assertInvariants passes on a clean break and throws naming a broken one", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 3 });
      await assertInvariants(tx);
      await tx.execute(sql`update breaks set status = 'filled' where id = ${b.id}`);
      await expect(assertInvariants(tx)).rejects.toThrow(b.id);
    });
  });
});
