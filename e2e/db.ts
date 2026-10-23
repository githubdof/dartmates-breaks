import postgres from "postgres";
import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Flight, Kit } from "../src/domain/flights";
import { E2E_DATABASE_URL } from "./e2e-db";

/** One short connection per call to the e2e database, for state the UI cannot set quickly. Closed every time. */
export async function withDb<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(E2E_DATABASE_URL, { max: 1, prepare: false });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

/** Gives a signed-in user (by handle) a known flight. `flight_chosen_at` stays null: it was not picked on /account. */
export async function setFlight(handle: string, f: Flight): Promise<void> {
  await withDb(async (sql) => { await sql`update users set flight_colour = ${f.colour}, flight_shape = ${f.shape} where handle = ${handle}`; });
}

/** Gives a signed-in host (by handle) a kit, creating their host_profiles row if it does not exist yet. */
export async function setKit(handle: string, k: Kit): Promise<void> {
  await withDb(async (sql) => {
    await sql`insert into host_profiles (user_id, kit_dark, kit_light)
      select id, ${k.dark}, ${k.light} from users where handle = ${handle}
      on conflict (user_id) do update set kit_dark = excluded.kit_dark, kit_light = excluded.kit_light`;
  });
}

/** Moves claims back in time, so lines past the payment window show overdue in host view (computed from now). */
export async function ageClaims(breakId: string, numbers: number[], hours: number): Promise<void> {
  await withDb(async (sql) => {
    await sql`update lines set claimed_at = now() - make_interval(hours => ${hours}::int)
      where break_id = ${breakId}::uuid and number in ${sql(numbers)}`;
  });
}

// Storage, for what the UI cannot show: which objects exist. The e2e reaches it with the service-role key from
// .env.local, never through photoStorage() (that module imports server-only, which cannot load in Playwright).
export const BUCKET_NAMES = ["incoming", "photos-draft", "photos", "photo-archive"] as const;
let storageClient: SupabaseClient | null = null;

export function storageAdmin(): SupabaseClient {
  if (!storageClient) {
    dotenv.config({ path: ".env.local", quiet: true });
    storageClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return storageClient;
}

/** Every object whose full path starts with `prefix` in `bucket`, folders followed, as full paths. */
export async function listObjects(bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (path: string): Promise<void> => {
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await storageAdmin().storage.from(bucket).list(path, { limit: 100, offset });
      if (error) throw new Error(`list ${bucket}/${path}: ${error.message}`);
      for (const o of data) {
        const full = path === "" ? o.name : `${path}/${o.name}`;
        if (o.id === null) await walk(full); // a folder
        else out.push(full);
      }
      if (data.length < 100) return;
    }
  };
  // A prefix such as "<break>/<random>" ends in a file-name stem, not a folder: list its parent and filter.
  const slash = prefix.lastIndexOf("/");
  await walk(slash === -1 ? "" : prefix.slice(0, slash));
  return out.filter((p) => p.startsWith(prefix));
}

export async function emptyBucket(bucket: string): Promise<void> {
  const all = await listObjects(bucket, "");
  for (let i = 0; i < all.length; i += 100) {
    const { error } = await storageAdmin().storage.from(bucket).remove(all.slice(i, i + 100));
    if (error) throw new Error(`empty ${bucket}: ${error.message}`);
  }
}

/** Lists the four buckets; any failure is a failed run, as a missing database is. */
export async function probeStorage(): Promise<void> {
  try {
    for (const b of BUCKET_NAMES) {
      const { error } = await storageAdmin().storage.from(b).list("", { limit: 1 });
      if (error) throw new Error(error.message);
    }
  } catch {
    throw new Error('Storage is not reachable at SUPABASE_URL. Start the local stack (pnpm supabase start) and create the buckets (README, "Photos and Storage").');
  }
}
