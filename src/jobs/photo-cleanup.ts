import { sql } from "drizzle-orm";
import { inTransaction, type Tx, type TxRunner } from "@/db/client";
import { breakPhotos, photoUploads } from "@/db/schema";
import { allowPhotoModeration } from "@/db/photo-moderation";
import { lockBreak, type BreakRow } from "@/auth/authz";
import { NotFound } from "@/domain/errors";
import { breaksUnderHold } from "@/domain/photos/holds";
import { dropPhotoFiles, expirePhotos } from "@/domain/photos/retention";
import { isUuid } from "@/lib/is-uuid";
import { PHOTO_BUCKETS, copyVariants, heldUnder, removeVariants } from "@/photos/variants";
import { BUCKETS, PREFIX_PATTERN, VARIANT_WIDTHS, variantPath, type VariantWidth } from "@/storage/buckets";
import type { PhotoStorage } from "@/storage/photo-storage";
import { withHeldJobLock } from "./job-lock";

type PhotoBucket = (typeof PHOTO_BUCKETS)[number];

// The daily photo cleanup (photos spec §5.6). No Storage call runs inside a transaction (ruling 28): each batch reads
// in one short transaction, calls Storage with none open, then writes in another. Every rule is idempotent: a file
// already gone is not an error, and a crash between a row update and its file removal leaves orphans that rule 2
// removes on the next run. Every file removal goes through deleteIfSafe, which never deletes the last copy a row
// relies on (ruling 25); only `incoming` uploads and junk names, which no row can name, skip it.

export type CleanupRule = "incoming" | "orphans" | "archive" | "cancelled";
/** Files removed per rule, upload grants deleted; `done` is false when the time budget ran out. */
export type PhotoCleanupResult = { incoming: number; tickets: number; orphans: number; archive: number; cancelled: number; done: boolean };
export type PhotoCleanupDeps = {
  run?: TxRunner;
  holds?: (tx: Tx) => Promise<ReadonlySet<string>>;
  batchSize?: number;
  budgetMs?: number;
  /** Test seam: called once per batch after the batch's read, before deleteIfSafe's re-read. Production passes nothing. */
  afterRead?: (rule: CleanupRule) => Promise<void>;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Leftovers and lapsed upload grants go after 24 hours; archived and expired photos after 180 days (spec §5.6). */
const LEFTOVER_MS = 24 * HOUR;
const RETENTION_MS = 180 * DAY;
/** A variant's file name: its prefix and width. Anything else in a photo bucket is junk. */
const VARIANT_NAME = /^(.+)-(160|640|1600)\.webp$/;

type Row = { bucket: PhotoBucket; removedAt: Date | null; hiddenAt: Date | null };
const isLive = (r: Row) => r.removedAt === null && r.hiddenAt === null;
/** A row relies on its prefix while it is live, or once it is in photo-archive (removed after a claim, or hidden). */
const relies = (r: Row) => isLive(r) || r.bucket === BUCKETS.archive;
const breakIdOf = (prefix: string) => prefix.slice(0, prefix.indexOf("/"));
/** A uuid[] or text[] literal: postgres-js with prepare:false cannot bind a JS array inside raw SQL. Checked values only. */
const arrayLiteral = (xs: readonly string[]) => `{${xs.join(",")}}`;

function chunks<T>(xs: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

class OutOfTime extends Error {}

/**
 * Locks each break in ascending id order before its rows are touched. A deleted draft, which lockBreak treats as not
 * found (ruling 12), is locked by its row directly and mapped to null.
 */
async function lockBreaks(tx: Tx, ids: readonly string[]): Promise<Map<string, BreakRow | null>> {
  const out = new Map<string, BreakRow | null>();
  for (const id of [...new Set(ids)].sort()) {
    try {
      out.set(id, await lockBreak(tx, id));
    } catch (e) {
      if (!(e instanceof NotFound)) throw e;
      await tx.execute(sql`select id from breaks where id = ${id} for update`);
      out.set(id, null);
    }
  }
  return out;
}

/**
 * The one gate every removal of a photo's files goes through (ruling 25). Re-reads, in a fresh transaction, every row
 * naming `prefix`, in any state. A row relying on the prefix keeps its own bucket untouched; when its bucket lacks a
 * variant another bucket holds, the variant is copied in first and nothing is deleted this run (the next run finds the
 * bucket complete). A variant no bucket holds (an archive copy lost to a race in the removal) is logged and skipped:
 * there is no copy left to keep, and it never blocks the rest. Removes the `widths` variants present in `bucket`, and
 * returns how many.
 */
export async function deleteIfSafe(storage: PhotoStorage, run: TxRunner, bucket: PhotoBucket, prefix: string, widths: readonly VariantWidth[] = VARIANT_WIDTHS): Promise<number> {
  const breakId = breakIdOf(prefix);
  const rows = await run((tx) => tx.select({ bucket: breakPhotos.bucket, removedAt: breakPhotos.removedAt, hiddenAt: breakPhotos.hiddenAt })
    .from(breakPhotos).where(sql`${breakPhotos.breakId} = ${breakId} and ${breakPhotos.path} = ${prefix}`));
  const own = new Set(rows.filter(relies).map((r) => r.bucket));
  if (own.has(bucket)) return 0;
  const held = await heldUnder(storage, breakId);
  let copied = false;
  let missing = 0;
  for (const b of own) {
    for (const w of VARIANT_WIDTHS) {
      const path = variantPath(prefix, w);
      if (held.get(b)!.has(path)) continue;
      const from = PHOTO_BUCKETS.find((x) => x !== b && held.get(x)!.has(path));
      if (!from) {
        missing += 1;
        continue;
      }
      await copyVariants(storage, prefix, from, b, [w]);
      copied = true;
    }
  }
  if (missing > 0) console.warn(JSON.stringify({ job: "photo-cleanup", prefix, bucket, relyingIn: [...own], missing }));
  if (copied) return 0;
  const present = widths.filter((w) => held.get(bucket)!.has(variantPath(prefix, w)));
  if (present.length > 0) await removeVariants(storage, bucket, prefix, present);
  return present.length;
}

type Ctx = {
  storage: PhotoStorage; run: TxRunner; holds: (tx: Tx) => Promise<ReadonlySet<string>>; now: Date; batchSize: number;
  afterRead: (rule: CleanupRule) => Promise<void>; checkTime: () => void; result: PhotoCleanupResult;
};

/** One prefix's removal: a Storage failure is logged and left for the next run, so it never blocks the others. */
async function removeSafely(c: Ctx, bucket: PhotoBucket, prefix: string, widths?: readonly VariantWidth[]): Promise<number> {
  try {
    return await deleteIfSafe(c.storage, c.run, bucket, prefix, widths);
  } catch (e) {
    console.error(JSON.stringify({ job: "photo-cleanup", prefix, bucket, error: e instanceof Error ? e.message : String(e) }));
    return 0;
  }
}

/** Rule 1: `incoming` objects older than 24 hours, and upload grants never used that lapsed over 24 hours ago. */
async function incoming(c: Ctx): Promise<void> {
  const cutoff = c.now.getTime() - LEFTOVER_MS;
  const old = (await c.storage.list(BUCKETS.incoming, "")).filter((o) => o.createdAt.getTime() < cutoff).map((o) => o.name);
  for (const batch of chunks(old, c.batchSize)) {
    c.checkTime();
    await c.afterRead("incoming");
    await c.storage.remove(BUCKETS.incoming, batch);
    c.result.incoming += batch.length;
  }
  const lapsed = sql`${photoUploads.consumedAt} is null and ${photoUploads.expiresAt} < ${new Date(cutoff).toISOString()}::timestamptz`;
  for (;;) {
    c.checkTime();
    const rows = await c.run((tx) => tx.select({ id: photoUploads.id, breakId: photoUploads.breakId }).from(photoUploads)
      .where(lapsed).orderBy(photoUploads.id).limit(c.batchSize));
    if (rows.length === 0) return;
    await c.afterRead("incoming");
    c.result.tickets += await c.run(async (tx) => {
      await lockBreaks(tx, rows.map((r) => r.breakId));
      const gone = await tx.delete(photoUploads)
        .where(sql`${photoUploads.id} = any(${arrayLiteral(rows.map((r) => r.id))}::uuid[]) and ${lapsed}`)
        .returning({ id: photoUploads.id });
      return gone.length;
    });
    if (rows.length < c.batchSize) return;
  }
}

/** Rule 2: files in the photo buckets older than 24 hours that no row keeps, junk names included. */
async function orphans(c: Ctx): Promise<void> {
  const cutoff = c.now.getTime() - LEFTOVER_MS;
  for (const bucket of PHOTO_BUCKETS) {
    // Old objects by prefix (the widths found), and junk: names that are no photo's variant.
    const groups = new Map<string, VariantWidth[]>();
    const junk: string[] = [];
    for (const o of await c.storage.list(bucket, "")) {
      if (o.createdAt.getTime() >= cutoff) continue;
      const m = VARIANT_NAME.exec(o.name);
      if (m && PREFIX_PATTERN.test(m[1]) && isUuid(breakIdOf(m[1]))) groups.set(m[1], [...(groups.get(m[1]) ?? []), Number(m[2]) as VariantWidth]);
      else junk.push(o.name);
    }
    const units: ({ prefix: string; widths: VariantWidth[] } | { prefix: null; name: string })[] = [
      ...[...groups].map(([prefix, widths]) => ({ prefix, widths })), ...junk.map((name) => ({ prefix: null, name })),
    ];
    for (const batch of chunks(units, c.batchSize)) {
      c.checkTime();
      const prefixes = batch.flatMap((u) => (u.prefix === null ? [] : [u.prefix]));
      const rows = prefixes.length === 0 ? [] : await c.run((tx) => tx
        .select({ path: breakPhotos.path, bucket: breakPhotos.bucket, removedAt: breakPhotos.removedAt, hiddenAt: breakPhotos.hiddenAt })
        .from(breakPhotos)
        .where(sql`${breakPhotos.breakId} = any(${arrayLiteral([...new Set(prefixes.map(breakIdOf))])}::uuid[])
          and ${breakPhotos.path} = any(${arrayLiteral(prefixes)}::text[])`));
      const keeps = (prefix: string) => rows.some((r) => r.path === prefix && (
        bucket === BUCKETS.public ? isLive(r) && (r.bucket === BUCKETS.public || r.bucket === BUCKETS.draft)
          : bucket === BUCKETS.draft ? isLive(r) && r.bucket === BUCKETS.draft
            : r.bucket === BUCKETS.archive));
      await c.afterRead("orphans");
      for (const u of batch) {
        if (u.prefix === null) {
          // No row can name a file that is not a variant: nothing relies on it.
          await c.storage.remove(bucket, [u.name]);
          c.result.orphans += 1;
        } else if (!keeps(u.prefix)) {
          c.result.orphans += await removeSafely(c, bucket, u.prefix, u.widths);
        }
      }
    }
  }
}

/** Rule 3: photos in photo-archive removed or hidden over 180 days ago, on breaks not under hold. Row first, files after. */
async function archive(c: Ctx): Promise<void> {
  const due = (held: ReadonlySet<string>) => sql`${breakPhotos.bucket} = 'photo-archive' and ${breakPhotos.path} is not null
    and coalesce(${breakPhotos.hiddenAt}, ${breakPhotos.removedAt}) < ${new Date(c.now.getTime() - RETENTION_MS).toISOString()}::timestamptz
    and ${breakPhotos.breakId} <> all(${arrayLiteral([...held].filter(isUuid))}::uuid[])`;
  for (;;) {
    c.checkTime();
    const rows = await c.run(async (tx) => tx.select({ id: breakPhotos.id, breakId: breakPhotos.breakId }).from(breakPhotos)
      .where(due(await c.holds(tx))).orderBy(breakPhotos.id).limit(c.batchSize));
    if (rows.length === 0) return;
    await c.afterRead("archive");
    const dropped = await c.run(async (tx) => {
      await lockBreaks(tx, rows.map((r) => r.breakId));
      const still = await tx.select({ id: breakPhotos.id, path: breakPhotos.path }).from(breakPhotos)
        .where(sql`${breakPhotos.id} = any(${arrayLiteral(rows.map((r) => r.id))}::uuid[]) and ${due(await c.holds(tx))}`).for("update");
      await allowPhotoModeration(tx);
      await dropPhotoFiles(tx, still.map((r) => r.id));
      return still;
    });
    for (const r of dropped) c.result.archive += await removeSafely(c, BUCKETS.archive, r.path!);
    if (rows.length < c.batchSize) return;
  }
}

/**
 * Rule 4 (ruling 26): cancelled breaks whose latest `break.cancelled` event is over 180 days old, not under hold. Every
 * row with files moves to photo-archive with no path (photo.expired), then the files go from every bucket. A cancelled
 * break with no cancel event has no date to count from, and is left alone.
 */
async function cancelled(c: Ctx): Promise<void> {
  const cutoff = new Date(c.now.getTime() - RETENTION_MS).toISOString();
  for (;;) {
    c.checkTime();
    const ids = await c.run(async (tx) => {
      const held = arrayLiteral([...(await c.holds(tx))].filter(isUuid));
      const rows = await tx.execute<{ id: string }>(sql`select b.id from breaks b
        where b.status = 'cancelled' and b.id <> all(${held}::uuid[])
          and (select max(e.created_at) from events e where e.break_id = b.id and e.type = 'break.cancelled') < ${cutoff}::timestamptz
          and exists (select 1 from break_photos p where p.break_id = b.id and p.path is not null)
        order by b.id limit ${c.batchSize}`);
      return rows.map((r) => r.id);
    });
    if (ids.length === 0) return;
    await c.afterRead("cancelled");
    const prefixes = await c.run(async (tx) => {
      const locked = await lockBreaks(tx, ids);
      const held = await c.holds(tx);
      await allowPhotoModeration(tx);
      const out: string[] = [];
      for (const [id, b] of locked) {
        if (b?.status !== "cancelled" || held.has(id)) continue;
        out.push(...(await expirePhotos(tx, id, c.now)).prefixes);
      }
      return out;
    });
    for (const p of prefixes) for (const bucket of PHOTO_BUCKETS) c.result.cancelled += await removeSafely(c, bucket, p);
    if (ids.length < c.batchSize) return;
  }
}

/**
 * Runs the four cleanup rules in order (photos spec §5.6) under the job's lock, in batches of `batchSize`, until
 * done or until `budgetMs` has passed (then `done` is false and the next run carries on). "locked" when another run
 * holds the lock.
 */
export async function runPhotoCleanup(storage: PhotoStorage, now: Date, deps: PhotoCleanupDeps = {}): Promise<PhotoCleanupResult | "locked"> {
  const budgetMs = deps.budgetMs ?? 240_000;
  return withHeldJobLock("photo-cleanup", async () => {
    const started = Date.now();
    const result: PhotoCleanupResult = { incoming: 0, tickets: 0, orphans: 0, archive: 0, cancelled: 0, done: true };
    const c: Ctx = {
      storage, now, result,
      run: deps.run ?? inTransaction,
      holds: deps.holds ?? breaksUnderHold,
      batchSize: deps.batchSize ?? 100,
      afterRead: deps.afterRead ?? (async () => {}),
      checkTime: () => {
        if (Date.now() - started >= budgetMs) throw new OutOfTime();
      },
    };
    try {
      await incoming(c);
      await orphans(c);
      await archive(c);
      await cancelled(c);
    } catch (e) {
      if (!(e instanceof OutOfTime)) throw e;
      result.done = false;
    }
    return result;
  });
}
