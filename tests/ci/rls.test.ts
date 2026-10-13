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

  it("an anon-role session reads no rows from lines", async () => {
    await sql`do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$`;
    await sql`grant usage on schema public to anon`;
    await sql`grant select on all tables in schema public to anon`;
    const rows = await sql.begin(async (tx) => {
      await tx`set local role anon`;
      return tx`select * from lines limit 1`;
    });
    expect(rows).toHaveLength(0);
  });
});
