// Usage: ENV_FILE=.env.local pnpm exec tsx scripts/verify-draws.ts   (an explicit DATABASE_URL wins over the file)
// Backfills draws.verified_at (migration 0004): runs verifyInputs over every active draw not yet marked. Safe to run
// again: a marked draw is never checked twice. Run it after migrating, on every database.
import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local" });
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { verifyStoredDraws } from "../src/domain/draws/verify-stored";

// No top-level await: package.json has no "type": "module", so tsx emits CJS (as src/db/migrate.ts notes).
async function main(): Promise<number> {
  const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  try {
    const db = drizzle(client, { schema });
    const r = await db.transaction((tx) => verifyStoredDraws(tx));
    console.log(`checked ${r.checked} draws, ${r.verified} verified`);
    return 0;
  } finally {
    await client.end();
  }
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e);
    process.exit(1);
  },
);
