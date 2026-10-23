import postgres from "postgres";
import { E2E_DATABASE_URL } from "./e2e-db";
import { BUCKET_NAMES, emptyBucket, probeStorage } from "./db";

/** Empties the e2e database before every run, so runs never see each other's users and breaks. */
export default async function globalSetup() {
  if (new URL(E2E_DATABASE_URL).pathname !== "/breaks_e2e") {
    throw new Error(`Refusing to truncate ${new URL(E2E_DATABASE_URL).pathname}: the e2e database must be named breaks_e2e`);
  }
  await probeStorage(); // a missing Storage is a failed run, as a missing database is
  const sql = postgres(E2E_DATABASE_URL, { max: 1, prepare: false });
  try {
    await sql`truncate photo_notices_seen, photo_uploads, break_photos, awards, draws, draw_requests, events, lines, prizes, break_items, break_secrets, breaks, host_profiles, legal_acceptances, idempotency_keys, rate_limits, users restart identity cascade`;
    // The truncate removes the SYSTEM row the first migration inserted; cron finalisation runs as SYSTEM.
    await sql`insert into users (id, email, role, handle, display_name, age_confirmed_at)
      values ('00000000-0000-4000-8000-000000000000', 'system@breaks.local', 'admin', 'system', 'System', now())
      on conflict (id) do nothing`;
  } finally {
    await sql.end();
  }
  // The rows are gone, so every stored object is an orphan of an earlier run.
  for (const b of BUCKET_NAMES) await emptyBucket(b);
}
