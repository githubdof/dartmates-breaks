// Usage: pnpm exec tsx scripts/create-db.ts breaks_e2e
// Creates a database on the local Supabase stack (if missing) and applies the CI auth stub to it, with the repo's
// postgres package: psql is not needed. Then migrate it with DATABASE_URL=…/<name> pnpm db:migrate.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const SERVER = process.env.DB_SERVER_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322";

// No top-level await: package.json has no "type": "module", so tsx emits CJS (as src/db/migrate.ts notes).
async function main(): Promise<number> {
  const name = process.argv[2] ?? "";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) {
    console.error("usage: pnpm exec tsx scripts/create-db.ts <database_name>");
    return 2;
  }
  const admin = postgres(`${SERVER}/postgres`, { max: 1, prepare: false });
  try {
    const [{ n }] = await admin<{ n: number }[]>`select count(*)::int as n from pg_database where datname = ${name}`;
    if (n === 0) await admin.unsafe(`create database ${name}`); // the name is checked above; identifiers cannot be bound
    console.log(n === 0 ? `created ${name}` : `${name} exists`);
  } finally {
    await admin.end();
  }
  const db = postgres(`${SERVER}/${name}`, { max: 1, prepare: false });
  try {
    // The stub is idempotent (create … if not exists, create or replace): safe to apply again.
    await db.unsafe(readFileSync("supabase/ci-auth-stub.sql", "utf8"));
    console.log("auth stub applied");
  } finally {
    await db.end();
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e);
    process.exit(1);
  },
);
