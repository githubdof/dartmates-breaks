import { describe, it, expect, afterAll } from "vitest";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
afterAll(() => sql.end());

describe("security posture", () => {
  it("every public table has RLS enabled and forced, with zero policies", async () => {
    const bad = await sql`select tablename from pg_tables t where schemaname='public' and not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=t.tablename and c.relrowsecurity and c.relforcerowsecurity)`;
    expect(bad).toHaveLength(0);
    expect(await sql`select 1 from pg_policies where schemaname='public'`).toHaveLength(0);
  });

  it("an anon-role session reads no rows from lines even when a line exists", async () => {
    const ROLLBACK = new Error("rollback");
    let owner = -1;
    let anon = -1;
    await sql
      .begin(async (tx) => {
        await tx`do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$`;
        await tx`grant usage on schema public to anon`;
        await tx`grant select on all tables in schema public to anon`;
        const [u] = await tx`insert into users (id, email) values (gen_random_uuid(), 'rls-check@example.test') returning id`;
        const [b] = await tx`insert into breaks (host_id, title, line_count, line_price_cents) values (${u.id}, 'rls check', 2, 100) returning id`;
        await tx`insert into lines (break_id, number) values (${b.id}, 1)`;
        owner = (await tx`select 1 from lines`).length; // superuser sees the row
        await tx`set local role anon`;
        anon = (await tx`select * from lines`).length;
        throw ROLLBACK; // keep CI database clean
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
    expect(owner).toBeGreaterThan(0);
    expect(anon).toBe(0);
  });
});
