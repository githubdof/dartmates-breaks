// Usage: ENV_FILE=.env.local pnpm exec tsx scripts/create-buckets.ts   (an explicit DATABASE_URL wins over the file)
// Creates the four photo buckets (photos spec §5.5) or aligns their settings with BUCKET_SETTINGS, then checks that no
// storage policy lets anon or authenticated in. Idempotent: a second run prints `ok` for every bucket. Run it once per
// environment: locally after the first `supabase start` with Storage on, in production once before the photos release
// and again after any change to BUCKET_SETTINGS. DATABASE_URL must be the database that holds the `storage` schema
// (`postgres` locally, the project's database in production). Exits 1 while any client policy exists on `storage`.
import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { clientStoragePolicies, ensureBuckets } from "../src/storage/ensure-buckets";
import { STORAGE_TIMEOUT_MS, timedFetch } from "../src/storage/timed-fetch";

// No top-level await: package.json has no "type": "module", so tsx emits CJS (as src/db/migrate.ts notes).
async function main(): Promise<number> {
  const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: timedFetch(STORAGE_TIMEOUT_MS) },
  });
  for (const { bucket, action } of await ensureBuckets(admin)) console.log(`${bucket} ${action}`);

  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  try {
    const policies = await clientStoragePolicies(sql);
    if (policies.length === 0) {
      console.log("no client policies on storage");
      return 0;
    }
    for (const p of policies) console.log(`storage.${p.table} ${p.policy} ${p.roles.join(",")}`);
    return 1;
  } finally {
    await sql.end();
  }
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e);
    process.exit(1);
  },
);
