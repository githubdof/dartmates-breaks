import { describe, it, expect, beforeAll } from "vitest";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

const ZERO_SECRET = Buffer.alloc(32).toString("base64"); // base64 of 32 zero bytes
const OTHER_SECRET = Buffer.alloc(32, 1).toString("base64");

describe("schema constraints", () => {
  let hostId: string;
  let breakId: string;
  let drawnBreakId: string;
  let requestId: string;
  beforeAll(async () => {
    hostId = (await sql`insert into users (id, email, role) values (gen_random_uuid(), 'h@example.com', 'host') returning id`)[0].id;
    breakId = (await sql`insert into breaks (host_id, title, line_count, line_price_cents, status) values (${hostId}, 't', 10, 2000, 'open') returning id`)[0].id;
    drawnBreakId = (await sql`insert into breaks (host_id, title, line_count, line_price_cents, status, seed_commitment)
      values (${hostId}, 'c', 2, 2000, 'drawing', encode(sha256('breaks-commit-v1'::bytea || decode(${ZERO_SECRET}, 'base64')), 'hex')) returning id`)[0].id;
    requestId = (await sql`insert into draw_requests (break_id, attempt, requested_by, beacon_round) values (${drawnBreakId}, 1, ${hostId}, 1) returning id`)[0].id;
  });

  const insertDraw = (secret: string) => sql`insert into draws (break_id, request_id, secret, beacon_round, beacon_randomness, beacon_signature, seed, algorithm_version, entries_snapshot, ranking, result_hash, run_by)
    values (${drawnBreakId}, ${requestId}, ${secret}, 1, 'aa', 'bb', 'cc', 1, '[]'::jsonb, '[1,2]'::jsonb, 'dd', ${hostId}) returning id`;

  it("connects as a role with BYPASSRLS", async () => {
    const [r] = await sql`select rolbypassrls from pg_roles where rolname = current_user`;
    expect(r.rolbypassrls).toBe(true);
  });

  it("rejects a draw whose secret does not match the commitment", async () => {
    await expect(insertDraw(OTHER_SECRET)).rejects.toThrow(/commitment/);
  });

  it("lets a draw be voided but not otherwise changed", async () => {
    const [d] = await insertDraw(ZERO_SECRET);
    await expect(sql`update draws set ranking = '[2,1]'::jsonb where id = ${d.id}`).rejects.toThrow(/voided/);
    await expect(sql`update draws set voided_at = now(), void_reason = 'test' where id = ${d.id}`).resolves.toBeDefined();
  });

  it("lets a draw request only move pending -> done", async () => {
    await expect(sql`update draw_requests set requested_by = gen_random_uuid() where id = ${requestId}`).rejects.toThrow(/pending -> done/);
    await expect(sql`update draw_requests set status = 'done' where id = ${requestId}`).resolves.toBeDefined();
  });

  it("refuses to delete events", async () => {
    const [e] = await sql`insert into events (type) values ('test.delete') returning id`;
    await expect(sql`delete from events where id = ${e.id}`).rejects.toThrow(/cannot be deleted/);
  });

  it("rejects a paid line with no owner", async () => {
    await expect(sql`insert into lines (break_id, number, paid_at) values (${breakId}, 1, now())`).rejects.toThrow(/lines_paid_owned_chk/);
  });

  it("rejects changing line_count after open", async () => {
    await expect(sql`update breaks set line_count = 11 where id = ${breakId}`).rejects.toThrow(/frozen/);
  });

  it("rejects moving a break back to draft after open", async () => {
    await expect(sql`update breaks set status = 'draft' where id = ${breakId}`).rejects.toThrow(/draft/);
  });

  it("rejects an unknown claim mode", async () => {
    await expect(sql`insert into breaks (host_id, title, line_count, line_price_cents, claim_mode) values (${hostId}, 'm', 4, 500, 'random_only')`).rejects.toThrow(/breaks_claim_mode_chk/);
  });

  it("defaults the claim mode and lets a draft change it", async () => {
    const [d] = await sql`insert into breaks (host_id, title, line_count, line_price_cents) values (${hostId}, 'd', 4, 500) returning id, claim_mode`;
    expect(d.claim_mode).toBe("pick_or_random");
    await expect(sql`update breaks set claim_mode = 'pick_only' where id = ${d.id}`).resolves.toBeDefined();
  });

  it("freezes claim_mode after open", async () => {
    await expect(sql`update breaks set claim_mode = 'straight' where id = ${breakId}`).rejects.toThrow(/claim_mode is frozen/);
  });

  // A fresh drawing break with one pending request, so the guards are reached via an otherwise-legal update.
  const freshRequest = async () => {
    const [b] = await sql`insert into breaks (host_id, title, line_count, line_price_cents, status, seed_commitment)
      values (${hostId}, 'f', 2, 2000, 'drawing', encode(sha256('breaks-commit-v1'::bytea || decode(${ZERO_SECRET}, 'base64')), 'hex')) returning id`;
    const [r] = await sql`insert into draw_requests (break_id, attempt, requested_by, beacon_round) values (${b.id}, 1, ${hostId}, 1) returning id`;
    return { breakId: b.id as string, requestId: r.id as string };
  };

  it("freezes draw_requests.id and created_at even on pending -> done", async () => {
    const r = await freshRequest();
    await expect(sql`update draw_requests set status = 'done', id = gen_random_uuid() where id = ${r.requestId}`).rejects.toThrow(/pending -> done/);
    await expect(sql`update draw_requests set status = 'done', created_at = now() - interval '1 day' where id = ${r.requestId}`).rejects.toThrow(/pending -> done/);
  });

  it("freezes draws.id even when voiding", async () => {
    const r = await freshRequest();
    const [d] = await sql`insert into draws (break_id, request_id, secret, beacon_round, beacon_randomness, beacon_signature, seed, algorithm_version, entries_snapshot, ranking, result_hash, run_by)
      values (${r.breakId}, ${r.requestId}, ${ZERO_SECRET}, 1, 'aa', 'bb', 'cc', 1, '[]'::jsonb, '[1,2]'::jsonb, 'dd', ${hostId}) returning id`;
    await expect(sql`update draws set voided_at = now(), id = gen_random_uuid() where id = ${d.id}`).rejects.toThrow(/may only be voided/);
  });

  it("freezes events.id, batch_id and ip_hash", async () => {
    const [e] = await sql`insert into events (type) values ('test.freeze') returning id`;
    await expect(sql`update events set batch_id = gen_random_uuid() where id = ${e.id}`).rejects.toThrow(/append-only/);
    await expect(sql`update events set ip_hash = 'x' where id = ${e.id}`).rejects.toThrow(/append-only/);
    await expect(sql`update events set id = gen_random_uuid() where id = ${e.id}`).rejects.toThrow(/append-only/);
    await expect(sql`update events set processed_at = now() where id = ${e.id}`).resolves.toBeDefined();
  });

  it("rejects moving an item out of a break with a paid line", async () => {
    const [paidBreak] = await sql`insert into breaks (host_id, title, line_count, line_price_cents, status) values (${hostId}, 'p', 2, 2000, 'open') returning id`;
    const [draftBreak] = await sql`insert into breaks (host_id, title, line_count, line_price_cents) values (${hostId}, 'd', 2, 2000) returning id`;
    const [item] = await sql`insert into break_items (break_id, name) values (${paidBreak.id}, 'card') returning id`;
    await sql`insert into lines (break_id, number, owner_id, claimed_at, paid_at) values (${paidBreak.id}, 1, ${hostId}, now(), now())`;
    await expect(sql`update break_items set break_id = ${draftBreak.id} where id = ${item.id}`).rejects.toThrow(/cannot move between breaks/);
  });

  it("has RLS forced on every public table", async () => {
    const rows = await sql`select tablename from pg_tables t where schemaname='public' and not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public' where c.relname = t.tablename and c.relrowsecurity and c.relforcerowsecurity)`;
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });

  it("has no permissive policies", async () => {
    const rows = await sql`select policyname from pg_policies where schemaname='public'`;
    expect(rows).toHaveLength(0);
  });
});
