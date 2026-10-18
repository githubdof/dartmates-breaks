import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { sql, type SQL } from "drizzle-orm";
import { withTx } from "../../tests/helpers/db";
import { makeUser, makeBreak } from "../../tests/helpers/fixtures";
import { breaks, hostProfiles } from "@/db/schema";
import type { Tx } from "@/db/client";
import { FLIGHT_COLOURS, FLIGHT_SHAPES } from "@/domain/flights";

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

/** A failed statement aborts the transaction, so each attempt runs in its own savepoint. Drizzle wraps the driver error; the constraint name is on `.cause`. */
async function refusal(tx: Tx, q: SQL): Promise<string> {
  const e = await tx.transaction((sp) => sp.execute(q)).then(() => null, (err: unknown) => err);
  return String((e as { cause?: unknown } | null)?.cause ?? e);
}

describe("migration 0004 flights and kits", () => {
  it("gives every new member a random flight from the 32, drawn on the server", async () => {
    await withTx(async (tx) => {
      const rows = await tx.execute<{ flight_colour: string; flight_shape: string; flight_chosen_at: Date | null }>(sql`
        insert into users (id, email) select gen_random_uuid(), 'f' || g || '@example.com' from generate_series(1, 400) g
        returning flight_colour, flight_shape, flight_chosen_at`);
      expect(rows).toHaveLength(400);
      // 400 draws miss one of eight colours with probability about 5e-23: every key shows up.
      expect(new Set(rows.map((r) => r.flight_colour))).toEqual(new Set(Object.keys(FLIGHT_COLOURS)));
      expect(new Set(rows.map((r) => r.flight_shape))).toEqual(new Set(Object.keys(FLIGHT_SHAPES)));
      expect(rows.every((r) => r.flight_chosen_at === null)).toBe(true);
    });
  });

  it("fills each existing row with its own draw when the column is added (the backfill)", async () => {
    const text = readFileSync(new URL("./migrations/0004_flights_kits.sql", import.meta.url), "utf8");
    const add = text.split("--> statement-breakpoint").map((s) => s.trim()).find((s) => s.startsWith('ALTER TABLE "users" ADD COLUMN "flight_colour"'));
    expect(add).toBe(`ALTER TABLE "users" ADD COLUMN "flight_colour" text DEFAULT (array['petrol','blue','plum','yellow','orange','lime','sky','pink'])[1 + floor(random() * 8)::int] NOT NULL;`);
    await withTx(async (tx) => {
      // The migration's own statement against a stand-in table with 64 existing rows: random() runs once per row.
      await tx.execute(sql`create temp table t0004 (n int) on commit drop`);
      await tx.execute(sql`insert into t0004 select generate_series(1, 64)`);
      await tx.execute(sql.raw(add!.replace('ALTER TABLE "users"', "ALTER TABLE t0004")));
      const [r] = await tx.execute<{ kinds: number; missing: number }>(sql`
        select count(distinct flight_colour)::int as kinds, count(*) filter (where flight_colour is null)::int as missing from t0004`);
      expect(r.missing).toBe(0);
      expect(r.kinds).toBeGreaterThan(1);
    });
  });

  it("refuses a flight outside the set, and no flight at all", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      expect(await refusal(tx, sql`update users set flight_colour = 'red' where id = ${u.id}`)).toMatch(/users_flight_colour_chk/);
      expect(await refusal(tx, sql`update users set flight_shape = 'dart' where id = ${u.id}`)).toMatch(/users_flight_shape_chk/);
      expect(await refusal(tx, sql`update users set flight_colour = null where id = ${u.id}`)).toMatch(/null value/);
    });
  });

  it("keeps a kit to one dark and one light colour, or neither", async () => {
    await withTx(async (tx) => {
      const h = await makeUser(tx, { role: "host" });
      const kit = (dark: string | null, light: string | null) => sql`insert into host_profiles (user_id, kit_dark, kit_light) values (${h.id}, ${dark}, ${light})`;
      expect(await refusal(tx, kit("yellow", "pink"))).toMatch(/host_profiles_kit_dark_chk/);
      expect(await refusal(tx, kit("petrol", "blue"))).toMatch(/host_profiles_kit_light_chk/);
      expect(await refusal(tx, kit("petrol", null))).toMatch(/host_profiles_kit_pair_chk/);
      await tx.execute(kit("petrol", "pink"));
      const [row] = await tx.select({ kitDark: hostProfiles.kitDark, kitLight: hostProfiles.kitLight }).from(hostProfiles).where(sql`${hostProfiles.userId} = ${h.id}`);
      expect(row).toEqual({ kitDark: "petrol", kitLight: "pink" });
    });
  });
});
