import { beforeEach, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

// These tests commit for real, so every test starts from an empty ledger.
async function resetLedger() {
  await db.execute(sql`truncate photo_notices_seen, photo_uploads, break_photos, awards, draws, draw_requests, events, lines, prizes, break_items, break_secrets, breaks, host_profiles, legal_acceptances, idempotency_keys, rate_limits, users restart identity cascade`);
  // The truncate removes the SYSTEM row the migration inserted (Task 2); finalise by SYSTEM needs it.
  await db.execute(sql`insert into users (id, email, role, handle, display_name, age_confirmed_at)
    values ('00000000-0000-4000-8000-000000000000', 'system@breaks.local', 'admin', 'system', 'System', now())
    on conflict (id) do nothing`);
}

beforeEach(resetLedger);
// Leave the shared local DB clean for other suites and the dev server.
afterAll(resetLedger);
