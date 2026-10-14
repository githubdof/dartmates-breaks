import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { withTx } from "../../tests/helpers/db";
import { makeUser, makeBreak } from "../../tests/helpers/fixtures";
import { breaks } from "@/db/schema";

describe("migration 0001 backfill", () => {
  it("turns breaks that refused random claims into pick-only and leaves the rest", async () => {
    const text = readFileSync(new URL("./migrations/0001_claim_mode.sql", import.meta.url), "utf8");
    const statement = text.split("--> statement-breakpoint").map((s) => s.replace(/^--.*$/gm, "").trim())
      .find((s) => s.startsWith("update breaks set claim_mode"));
    expect(statement).toBe("update breaks set claim_mode = 'pick_only' where allow_random_claims = false;");
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const refused = await makeBreak(tx, { hostId: host.id });
      const allowed = await makeBreak(tx, { hostId: host.id });
      await tx.execute(sql`update breaks set allow_random_claims = false, claim_mode = 'pick_or_random' where id = ${refused.id}`);
      // The migration's own statement, scoped to this test's two drafts.
      await tx.execute(sql.raw(`${statement!.replace(/;$/, "")} and id in ('${refused.id}', '${allowed.id}')`));
      const rows = await tx.select({ id: breaks.id, claimMode: breaks.claimMode }).from(breaks).where(sql`${breaks.id} in (${refused.id}, ${allowed.id})`);
      expect(Object.fromEntries(rows.map((r) => [r.id, r.claimMode]))).toEqual({ [refused.id]: "pick_only", [allowed.id]: "pick_or_random" });
    });
  });
});
