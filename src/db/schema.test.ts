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

  it("has RLS forced on every public table", async () => {
    const rows = await sql`select tablename from pg_tables t where schemaname='public' and not exists (select 1 from pg_class c where c.relname = t.tablename and c.relrowsecurity and c.relforcerowsecurity)`;
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });

  it("has no permissive policies", async () => {
    const rows = await sql`select policyname from pg_policies where schemaname='public'`;
    expect(rows).toHaveLength(0);
  });
});
