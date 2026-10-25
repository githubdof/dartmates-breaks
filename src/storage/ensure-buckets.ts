import type { SupabaseClient } from "@supabase/supabase-js";
import type postgres from "postgres";
import { BUCKETS, BUCKET_SETTINGS, type BucketName } from "./buckets";

const sameList = (a: readonly string[], b: readonly string[]) => [...a].sort().join("\n") === [...b].sort().join("\n");

/** Creates each missing photo bucket and aligns one whose settings differ from BUCKET_SETTINGS (photos spec §5.5).
 *  Idempotent: a second run answers `ok` for every bucket. Needs a service-role client. */
export async function ensureBuckets(
  admin: SupabaseClient,
): Promise<{ bucket: BucketName; action: "created" | "updated" | "ok" }[]> {
  const out: { bucket: BucketName; action: "created" | "updated" | "ok" }[] = [];
  for (const bucket of Object.values(BUCKETS)) {
    const want = BUCKET_SETTINGS[bucket];
    const options = { public: want.public, fileSizeLimit: want.fileSizeLimit, allowedMimeTypes: [...want.allowedMimeTypes] };
    const { data, error } = await admin.storage.getBucket(bucket);
    if (error && !/not found/i.test(error.message)) throw new Error(`storage getBucket ${bucket}: ${error.message}`, { cause: error });
    if (!data) {
      const made = await admin.storage.createBucket(bucket, options);
      if (made.error) throw new Error(`storage createBucket ${bucket}: ${made.error.message}`, { cause: made.error });
      out.push({ bucket, action: "created" });
      continue;
    }
    const same =
      data.public === want.public &&
      data.file_size_limit === want.fileSizeLimit &&
      sameList(data.allowed_mime_types ?? [], want.allowedMimeTypes);
    if (same) {
      out.push({ bucket, action: "ok" });
      continue;
    }
    const updated = await admin.storage.updateBucket(bucket, options);
    if (updated.error) throw new Error(`storage updateBucket ${bucket}: ${updated.error.message}`, { cause: updated.error });
    out.push({ bucket, action: "updated" });
  }
  return out;
}

/** Every policy in schema `storage` that applies to `anon`, `authenticated` or `public`; there must be none (photos
 *  spec §5.5: every write is the service role or a signed upload URL). */
export async function clientStoragePolicies(sql: postgres.Sql): Promise<{ table: string; policy: string; roles: string[] }[]> {
  return sql<{ table: string; policy: string; roles: string[] }[]>`
    select tablename as "table", policyname as policy, roles::text[] as roles
    from pg_policies
    where schemaname = 'storage' and roles && array['anon', 'authenticated', 'public']::name[]
    order by tablename, policyname
  `;
}
