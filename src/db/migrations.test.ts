import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { sql, eq, type SQL } from "drizzle-orm";
import { withTx } from "../../tests/helpers/db";
import { makeUser, makeBreak, openBreakWithLines } from "../../tests/helpers/fixtures";
import { breaks, hostProfiles, prizes, events } from "@/db/schema";
import { allowPhotoModeration } from "@/db/photo-moderation";
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

describe("migration 0005 photos", () => {
  const text = () => readFileSync(new URL("./migrations/0005_photos.sql", import.meta.url), "utf8");
  const statement = (start: string) => text().split("--> statement-breakpoint").map((s) => s.replace(/^--.*$/gm, "").trim()).find((s) => s.startsWith(start));
  const slug = () => randomBytes(16).toString("base64url"); // 22 url-safe characters, 128 bits
  type B = { id: string; hostId: string };
  const insertPhoto = (b: B, o: { position: number; bucket?: string; slot?: string | null; alt?: string; path?: string | null }) => sql`
    insert into break_photos (break_id, position, prize_slot, path, bucket, width, height, alt, created_by)
    values (${b.id}, ${o.position}, ${o.slot ?? null}, ${o.path === undefined ? `${b.id}/${slug()}` : o.path},
      ${o.bucket ?? "photos-draft"}, 1600, 1200, ${o.alt ?? "Darts"}, ${b.hostId}) returning id`;
  const addPhoto = async (tx: Tx, b: B, o: Parameters<typeof insertPhoto>[1]) => (await tx.execute<{ id: string }>(insertPhoto(b, o)))[0].id;
  const setStatus = (tx: Tx, id: string, status: string) => tx.execute(sql`update breaks set status = ${status} where id = ${id}`);

  it("caps a break at 8 live photos, one per position, and lets removed rows keep their old place", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      for (let p = 0; p < 8; p++) await addPhoto(tx, b, { position: p });
      expect(await refusal(tx, insertPhoto(b, { position: 7 }))).toMatch(/at most 8 photos/);
      await tx.execute(sql`update break_photos set removed_at = now() where break_id = ${b.id} and position = 7`);
      await addPhoto(tx, b, { position: 7 }); // a removed row at 7 does not hold the place
      await tx.execute(sql`update break_photos set removed_at = now() where break_id = ${b.id} and position = 6 and removed_at is null`);
      expect(await refusal(tx, insertPhoto(b, { position: 7 }))).toMatch(/break_photos_live_position_uq/);
      expect(await refusal(tx, insertPhoto(b, { position: 8 }))).toMatch(/break_photos_position_chk/);
    });
  });

  it("refuses an alt outside 1–120 characters, a path outside the break's folder, an unknown bucket, and a null path outside photo-archive", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const open = await openBreakWithLines(tx, { hostId: host.id });
      expect(await refusal(tx, insertPhoto(b, { position: 0, alt: "" }))).toMatch(/break_photos_alt_chk/);
      expect(await refusal(tx, insertPhoto(b, { position: 0, alt: "x".repeat(121) }))).toMatch(/break_photos_alt_chk/);
      expect(await refusal(tx, insertPhoto(b, { position: 0, path: `${randomUUID()}/${slug()}` }))).toMatch(/break_photos_path_chk/);
      expect(await refusal(tx, insertPhoto(b, { position: 0, path: `${b.id}/../${slug()}` }))).toMatch(/break_photos_path_chk/);
      expect(await refusal(tx, insertPhoto(open, { position: 0, bucket: "public" }))).toMatch(/break_photos_bucket_chk/);
      expect(await refusal(tx, insertPhoto(b, { position: 0, path: null }))).toMatch(/break_photos_gone_chk/);
      const id = await addPhoto(tx, b, { position: 0, alt: "x".repeat(120) });
      expect(await refusal(tx, sql`update break_photos set path = null where id = ${id}`)).toMatch(/break_photos_gone_chk/);
      const [row] = await tx.execute<{ alt: string; path: string | null }>(sql`select alt, path from break_photos where id = ${id}`);
      expect(row.alt).toHaveLength(120);
      expect(row.path).toMatch(new RegExp(`^${b.id}/[A-Za-z0-9_-]{22}$`));
    });
  });

  it("lets a path go null only in photo-archive, on any row, so a cancelled break's live rows can expire there (ruling 26)", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const open = await openBreakWithLines(tx, { hostId: host.id });
      const removed = await addPhoto(tx, open, { position: 0, bucket: "photos" });
      const kept = await addPhoto(tx, open, { position: 1, bucket: "photos" });
      // A removed row still in photos cannot drop its path; once in the archive it can.
      await tx.execute(sql`update break_photos set removed_at = now() where id = ${removed}`);
      await tx.execute(sql`update break_photos set position = 0 where id = ${kept}`);
      expect(await refusal(tx, sql`update break_photos set path = null where id = ${removed}`)).toMatch(/break_photos_gone_chk/);
      await tx.execute(sql`update break_photos set bucket = 'photo-archive', path = null where id = ${removed}`);
      // Retention on a cancelled break (Task 11 rule 4): the live row moves to the archive with no path, under moderation.
      await setStatus(tx, open.id, "cancelled");
      expect(await refusal(tx, sql`update break_photos set bucket = 'photo-archive', path = null where id = ${kept}`)).toMatch(/frozen/);
      await allowPhotoModeration(tx);
      expect(await refusal(tx, sql`update break_photos set path = null where id = ${kept}`)).toMatch(/break_photos_gone_chk/);
      await tx.execute(sql`update break_photos set bucket = 'photo-archive', path = null where id = ${kept}`);
      await tx.execute(sql`set constraints break_photos_shape immediate`); // positions untouched: still 0..n-1
      const rows = await tx.execute<{ id: string; bucket: string; path: string | null; live: boolean }>(
        sql`select id, bucket, path, (removed_at is null and hidden_at is null) as live from break_photos where break_id = ${open.id} order by (removed_at is null and hidden_at is null)`);
      expect(rows.map((r) => [r.bucket, r.path, r.live])).toEqual([["photo-archive", null, false], ["photo-archive", null, true]]);
      // An insert never lands in the archive, even with a path.
      const draft = await makeBreak(tx, { hostId: host.id });
      expect(await refusal(tx, insertPhoto(draft, { position: 0, bucket: "photo-archive" }))).toMatch(/photos-draft/);
    });
  });

  it("puts a draft's photos in photos-draft and an open break's in photos", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const draft = await makeBreak(tx, { hostId: host.id });
      const open = await openBreakWithLines(tx, { hostId: host.id });
      expect(await refusal(tx, insertPhoto(draft, { position: 0, bucket: "photos" }))).toMatch(/photos-draft/);
      expect(await refusal(tx, insertPhoto(open, { position: 0, bucket: "photos-draft" }))).toMatch(/photos-draft/);
      await addPhoto(tx, draft, { position: 0, bucket: "photos-draft" });
      await addPhoto(tx, open, { position: 0, bucket: "photos" });
      expect(await refusal(tx, sql`insert into break_photos (break_id, position, path, bucket, width, height, alt, created_by, removed_at)
        values (${open.id}, 1, ${`${open.id}/${slug()}`}, 'photos', 10, 10, 'x', ${host.id}, now())`)).toMatch(/added live/);
    });
  });

  it("keeps identity, size and dates fixed, sets removed_at and hidden_at once, and never brings a dropped path back", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const other = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const id = await addPhoto(tx, b, { position: 0 });
      for (const set of [sql`width = 10`, sql`created_by = ${other.id}`, sql`created_at = now() - interval '1 day'`, sql`break_id = ${(await makeBreak(tx, { hostId: host.id })).id}`]) {
        expect(await refusal(tx, sql`update break_photos set ${set} where id = ${id}`)).toMatch(/are fixed/);
      }
      await tx.execute(sql`update break_photos set removed_at = now() - interval '1 hour' where id = ${id}`);
      expect(await refusal(tx, sql`update break_photos set removed_at = now() where id = ${id}`)).toMatch(/set once/);
      expect(await refusal(tx, sql`update break_photos set removed_at = null where id = ${id}`)).toMatch(/set once/);
      await tx.execute(sql`update break_photos set hidden_at = now(), bucket = 'photo-archive' where id = ${id}`); // a removed photo can still be hidden
      expect(await refusal(tx, sql`update break_photos set hidden_at = null where id = ${id}`)).toMatch(/set once/);
      await tx.execute(sql`update break_photos set path = null where id = ${id}`);
      expect(await refusal(tx, sql`update break_photos set path = ${`${b.id}/${slug()}`} where id = ${id}`)).toMatch(/only ever changes to null/);
    });
  });

  it("closes live positions to 0..n-1 by commit, so a renumber may park rows below zero in between", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const [a, c] = [await addPhoto(tx, b, { position: 0 }), await addPhoto(tx, b, { position: 1 })];
      // Swap the two in two statements (ruling 5): park at -(position + 1), then set.
      await tx.execute(sql`update break_photos set position = -(position + 1) where break_id = ${b.id} and removed_at is null and hidden_at is null`);
      await tx.execute(sql`update break_photos set position = case id when ${a} then 1 when ${c} then 0 end where break_id = ${b.id} and removed_at is null and hidden_at is null`);
      await tx.execute(sql`set constraints break_photos_shape immediate`); // fires the pending checks now: they pass
      expect(await refusal(tx, sql`update break_photos set position = 2 where id = ${a}`)).toMatch(/without gaps/);
      expect(await refusal(tx, sql`update break_photos set removed_at = now() where id = ${c}`)).toMatch(/without gaps/); // the lead leaves a hole unless the rest move up
    });
  });

  it("freezes photos from the draw request on, and once cancelled", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      for (const frozen of ["drawing", "drawn", "cancelled"]) {
        const b = await openBreakWithLines(tx, { hostId: host.id });
        const id = await addPhoto(tx, b, { position: 0, bucket: "photos" });
        await setStatus(tx, b.id, frozen);
        expect(await refusal(tx, insertPhoto(b, { position: 1, bucket: "photos" }))).toMatch(/frozen once the draw is requested/);
        expect(await refusal(tx, sql`update break_photos set alt = 'New' where id = ${id}`)).toMatch(/frozen/);
        expect(await refusal(tx, sql`update break_photos set removed_at = now() where id = ${id}`)).toMatch(/frozen/);
        expect(await refusal(tx, sql`delete from break_photos where id = ${id}`)).toMatch(/frozen/);
        expect(await refusal(tx, sql`update break_photos set hidden_at = now(), bucket = 'photo-archive' where id = ${id}`)).toMatch(/frozen/);
      }
    });
  });

  it("lets moderation hide a photo and close the gap in a frozen break, and nothing else (spec §10)", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id });
      const lead = await addPhoto(tx, b, { position: 0, bucket: "photos" });
      const next = await addPhoto(tx, b, { position: 1, bucket: "photos" });
      await setStatus(tx, b.id, "drawn");
      await allowPhotoModeration(tx);
      await tx.execute(sql`update break_photos set hidden_at = now(), bucket = 'photo-archive' where id = ${lead}`);
      await tx.execute(sql`update break_photos set position = 0 where id = ${next}`);
      await tx.execute(sql`update break_photos set path = null where id = ${lead}`);
      await tx.execute(sql`set constraints break_photos_shape immediate`);
      expect(await refusal(tx, sql`update break_photos set alt = 'Swapped' where id = ${next}`)).toMatch(/frozen/);
      expect(await refusal(tx, sql`update break_photos set prize_slot = null, removed_at = now() where id = ${next}`)).toMatch(/frozen/);
      expect(await refusal(tx, sql`delete from break_photos where id = ${next}`)).toMatch(/frozen/);
      expect(await refusal(tx, insertPhoto(b, { position: 1, bucket: "photos" }))).toMatch(/frozen/);
    });
  });

  it("gives every prize its own slot key, unique per break, and backfills existing prizes one key each", async () => {
    const add = statement('ALTER TABLE "prizes" ADD COLUMN "slot_key"');
    expect(add).toBe(`ALTER TABLE "prizes" ADD COLUMN "slot_key" uuid DEFAULT gen_random_uuid() NOT NULL;`);
    await withTx(async (tx) => {
      await tx.execute(sql`create temp table t0005 (n int) on commit drop`);
      await tx.execute(sql`insert into t0005 select generate_series(1, 32)`);
      await tx.execute(sql.raw(add!.replace('ALTER TABLE "prizes"', "ALTER TABLE t0005")));
      const [r] = await tx.execute<{ keys: number }>(sql`select count(distinct slot_key)::int as keys from t0005`);
      expect(r.keys).toBe(32);
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const [p] = await tx.select().from(prizes).where(eq(prizes.breakId, b.id));
      expect(p.slotKey).toMatch(/^[0-9a-f-]{36}$/);
      const [item] = await tx.execute<{ id: string }>(sql`insert into break_items (break_id, name) values (${b.id}, 'Phantom') returning id`);
      expect(await refusal(tx, sql`insert into prizes (break_id, rank, item_id, slot_key) values (${b.id}, 1, ${item.id}, ${p.slotKey})`)).toMatch(/prizes_slot_uq/);
      const other = await makeBreak(tx, { hostId: host.id });
      const [item2] = await tx.execute<{ id: string }>(sql`insert into break_items (break_id, name) values (${other.id}, 'Phantom') returning id`);
      await tx.execute(sql`insert into prizes (break_id, rank, item_id, slot_key) values (${other.id}, 1, ${item2.id}, ${p.slotKey})`); // another break may reuse it
      const [reused] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from prizes where slot_key = ${p.slotKey}`);
      expect(reused.n).toBe(2);
    });
  });

  it("ties a tag to a prize of the same break, and clears it when that prize goes", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const other = await makeBreak(tx, { hostId: host.id });
      const [mine] = await tx.select().from(prizes).where(eq(prizes.breakId, b.id));
      const [theirs] = await tx.select().from(prizes).where(eq(prizes.breakId, other.id));
      expect(await refusal(tx, insertPhoto(b, { position: 0, slot: randomUUID() }))).toMatch(/break_photos_prize_slot_fk/);
      expect(await refusal(tx, insertPhoto(b, { position: 0, slot: theirs.slotKey }))).toMatch(/break_photos_prize_slot_fk/);
      const id = await addPhoto(tx, b, { position: 0, slot: mine.slotKey });
      await tx.delete(prizes).where(eq(prizes.id, mine.id)); // a draft re-save that drops the prize (spec §4.1)
      const [row] = await tx.execute<{ prize_slot: string | null }>(sql`select prize_slot from break_photos where id = ${id}`);
      expect(row.prize_slot).toBeNull();
    });
  });

  it("drops break_items.photo_paths and keeps condition to the three values or none", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      expect(await refusal(tx, sql`select photo_paths from break_items`)).toMatch(/photo_paths" does not exist/);
      expect(await refusal(tx, sql`insert into break_items (break_id, name, condition) values (${b.id}, 'x', 'mint')`)).toMatch(/break_items_condition_chk/);
      for (const c of ["new_in_box", "new_opened", "used", null]) await tx.execute(sql`insert into break_items (break_id, name, condition) values (${b.id}, 'x', ${c})`);
      const kept = await tx.execute<{ condition: string | null }>(sql`select condition from break_items where break_id = ${b.id} and name = 'x' order by condition nulls last`);
      expect(kept.map((r) => r.condition)).toEqual(["new_in_box", "new_opened", "used", null]);
    });
  });

  it("sets first_claimed_at once, ties the photo notice to it, and keeps a deleted draft deleted", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id });
      expect(await refusal(tx, sql`update breaks set photos_updated_at = now(), photos_updated_note = 'Lead photo replaced' where id = ${b.id}`)).toMatch(/breaks_photos_note_claimed_chk/);
      await tx.execute(sql`update breaks set first_claimed_at = now() where id = ${b.id}`);
      expect(await refusal(tx, sql`update breaks set first_claimed_at = now() + interval '1 minute' where id = ${b.id}`)).toMatch(/first_claimed_at is set once/);
      expect(await refusal(tx, sql`update breaks set first_claimed_at = null where id = ${b.id}`)).toMatch(/first_claimed_at is set once/);
      expect(await refusal(tx, sql`update breaks set photos_updated_at = now() where id = ${b.id}`)).toMatch(/breaks_photos_note_chk/);
      expect(await refusal(tx, sql`update breaks set photos_updated_at = now(), photos_updated_note = '' where id = ${b.id}`)).toMatch(/breaks_photos_note_chk/);
      await tx.execute(sql`update breaks set photos_updated_at = now(), photos_updated_note = 'Lead photo replaced' where id = ${b.id}`);
      expect(await refusal(tx, sql`update breaks set deleted_at = now() where id = ${b.id}`)).toMatch(/only a draft can be deleted/);
      const d = await makeBreak(tx, { hostId: host.id });
      await tx.execute(sql`update breaks set deleted_at = now() where id = ${d.id}`);
      expect(await refusal(tx, sql`update breaks set status = 'open' where id = ${d.id}`)).toMatch(/a deleted draft stays deleted/);
      expect(await refusal(tx, sql`update breaks set deleted_at = null where id = ${d.id}`)).toMatch(/a deleted draft stays deleted/);
    });
  });

  it("keeps photo upload names unique and one notice row per member and break", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const ticket = sql`insert into photo_uploads (host_id, break_id, incoming_name, expires_at) values (${host.id}, ${b.id}, ${`${b.id}/a.jpg`}, now() + interval '5 minutes')`;
      await tx.execute(ticket);
      expect(await refusal(tx, ticket)).toMatch(/photo_uploads_incoming_name_unique/);
      const seen = sql`insert into photo_notices_seen (user_id, break_id, seen_at) values (${host.id}, ${b.id}, now())`;
      await tx.execute(seen);
      expect(await refusal(tx, seen)).toMatch(/photo_notices_seen_user_id_break_id_pk/);
    });
  });

  it("backfills first_claimed_at from the earliest claim on record, and leaves never-claimed breaks empty", async () => {
    const backfill = statement("update breaks b set first_claimed_at");
    expect(backfill).toBeDefined();
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const buyer = await makeUser(tx);
      const t = (iso: string) => new Date(iso);
      const own = (id: string, n: number, at: Date) => tx.execute(sql`update lines set owner_id = ${buyer.id}, claimed_at = ${at.toISOString()}, price_cents = 2000 where break_id = ${id} and number = ${n}`);
      const ev = (id: string, type: string, at: Date) => tx.insert(events).values({ breakId: id, actorId: buyer.id, type, payload: {}, createdAt: at });
      // A: a claim event at 10:00, the line held since a later claim at 11:00.
      const a = await openBreakWithLines(tx, { hostId: host.id });
      await ev(a.id, "line.claimed", t("2026-03-01T10:00:00Z"));
      await own(a.id, 1, t("2026-03-01T11:00:00Z"));
      // B: claimed and released, no owner left: only the events remember.
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await ev(b.id, "line.claimed", t("2026-03-01T09:00:00Z"));
      await ev(b.id, "line.released", t("2026-03-01T09:30:00Z"));
      // C: an owned line and no events (made outside the commands).
      const c = await openBreakWithLines(tx, { hostId: host.id });
      await own(c.id, 2, t("2026-03-01T12:00:00Z"));
      // D: open, never claimed. E: already set, kept.
      const d = await openBreakWithLines(tx, { hostId: host.id });
      const e = await openBreakWithLines(tx, { hostId: host.id });
      await tx.execute(sql`update breaks set first_claimed_at = ${"2026-02-01T00:00:00Z"} where id = ${e.id}`);
      await own(e.id, 1, t("2026-03-01T08:00:00Z"));
      await tx.execute(sql.raw(backfill!));
      const rows = await tx.select({ id: breaks.id, at: breaks.firstClaimedAt }).from(breaks).where(sql`${breaks.id} in (${a.id}, ${b.id}, ${c.id}, ${d.id}, ${e.id})`);
      const at = Object.fromEntries(rows.map((r) => [r.id, r.at?.toISOString() ?? null]));
      expect([at[a.id], at[b.id], at[c.id], at[d.id], at[e.id]]).toEqual([
        "2026-03-01T10:00:00.000Z", "2026-03-01T09:00:00.000Z", "2026-03-01T12:00:00.000Z", null, "2026-02-01T00:00:00.000Z",
      ]);
    });
  });
});
