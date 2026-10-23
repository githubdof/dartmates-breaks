import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { breakPhotos, events, photoUploads } from "@/db/schema";
import { deleteDraft } from "@/domain/breaks/commands";
import { claimLines } from "@/domain/lines/commands";
import { hidePhoto, issueUploadTicket, recordProcessedPhoto, removePhoto } from "@/domain/photos/commands";
import { breaksUnderHold } from "@/domain/photos/holds";
import { breakPhotos as photosOf, leadPhotos } from "@/domain/photos/queries";
import { SYSTEM, type Caller } from "@/domain/types";
import { BUCKETS, VARIANT_WIDTHS, variantPath, type BucketName } from "@/storage/buckets";
import type { PhotoStorage } from "@/storage/photo-storage";
import { withTx } from "../../tests/helpers/db";
import { makeBreak, makePhoto, makeTicket, makeUser, openBreakWithLines } from "../../tests/helpers/fixtures";
import { createMemoryStorage } from "../../tests/helpers/memory-storage";
import { runPhotoCleanup, type PhotoCleanupDeps, type PhotoCleanupResult } from "./photo-cleanup";

const T0 = new Date("2026-10-21T09:17:00Z");
const hoursAgo = (h: number) => new Date(T0.getTime() - h * 3_600_000);
const daysAgo = (d: number) => hoursAgo(d * 24);
let clock = T0; // the memory storage's clock: set it back before a put to make an old file
beforeEach(() => { clock = T0; });
afterEach(() => { vi.restoreAllMocks(); });
const store = () => createMemoryStorage(() => clock);
const as = (id: string, role: Caller["role"] = "host"): Caller => ({ id, role, onboarded: true, banned: false });
const prefixOf = (breakId: string) => `${breakId}/${randomBytes(16).toString("base64url")}`;
async function variants(s: PhotoStorage, bucket: BucketName, prefix: string, ageHours = 25) {
  clock = hoursAgo(ageHours);
  for (const w of VARIANT_WIDTHS) await s.put(bucket, variantPath(prefix, w), Buffer.from("x"), "image/webp");
  clock = T0;
}
const has = (s: MemoryStorage, bucket: BucketName, path: string) => s.files.has(`${bucket}/${path}`);
const hasAll = (s: MemoryStorage, bucket: BucketName, prefix: string) => VARIANT_WIDTHS.every((w) => has(s, bucket, variantPath(prefix, w)));
const hasNone = (s: MemoryStorage, bucket: BucketName, prefix: string) => VARIANT_WIDTHS.every((w) => !has(s, bucket, variantPath(prefix, w)));
const job = (s: PhotoStorage, tx: Tx, o: PhotoCleanupDeps = {}) => runPhotoCleanup(s, T0, { run: (fn) => fn(tx), ...o }) as Promise<PhotoCleanupResult>;
/** issueUploadTicket + recordProcessedPhoto at `location` (must match the break's status), then its files, 25 h old. */
async function addPhoto(tx: Tx, s: PhotoStorage, host: { id: string }, breakId: string, location: "photos" | "photos-draft") {
  const { ticketId } = await issueUploadTicket(tx, as(host.id), { breakId, now: T0 });
  const prefix = prefixOf(breakId);
  const { photoId } = await recordProcessedPhoto(tx, as(host.id), { ticketId, prefix, location, width: 1600, height: 1200, slot: null, alt: "Darts", now: T0 });
  await variants(s, location, prefix);
  return { photoId, prefix };
}
/** An open break with line 1 claimed, so removals archive. */
async function claimedBreak(tx: Tx, host: { id: string }, buyer: { id: string }) {
  const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
  await claimLines(tx, as(buyer.id, "member"), { breakId: b.id, numbers: [1], batchId: randomUUID() });
  return b;
}
/** A photo removed after the first claim, its archive copy made (as Task 6 does), removed `removedDaysAgo` days ago
 *  (removed_at is set once, so the removal itself is dated then). */
async function archived(tx: Tx, s: PhotoStorage, host: { id: string }, breakId: string, removedDaysAgo: number) {
  const p = await addPhoto(tx, s, host, breakId, "photos");
  await variants(s, BUCKETS.archive, p.prefix);
  await removePhoto(tx, as(host.id), { photoId: p.photoId, now: daysAgo(removedDaysAgo) });
  return p;
}
type MemoryStorage = ReturnType<typeof createMemoryStorage>;
const holderView = (buyer: { id: string }) => ({ id: buyer.id, isHost: false, isHolder: true, isAdmin: false });

describe("runPhotoCleanup (photos spec §5.6)", () => {
  it("removes incoming files and unconsumed tickets older than 24 hours, and keeps younger ones (Review Focus 3)", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const b = await makeBreak(tx, { hostId: host.id, status: "draft" });
    const old = await makeTicket(tx, { hostId: host.id, breakId: b.id, expiresAt: hoursAgo(25) });
    const young = await makeTicket(tx, { hostId: host.id, breakId: b.id, expiresAt: hoursAgo(23) });
    const used = await makeTicket(tx, { hostId: host.id, breakId: b.id, expiresAt: hoursAgo(30), consumedAt: hoursAgo(30) });
    clock = hoursAgo(25); await s.put(BUCKETS.incoming, old.id, Buffer.from("x"), "image/webp");
    clock = hoursAgo(23); await s.put(BUCKETS.incoming, young.id, Buffer.from("x"), "image/webp"); clock = T0;
    const r = await job(s, tx);
    expect(r).toMatchObject({ incoming: 1, tickets: 1 });
    expect([has(s, BUCKETS.incoming, old.id), has(s, BUCKETS.incoming, young.id)]).toEqual([false, true]);
    const left = await tx.select({ id: photoUploads.id }).from(photoUploads).where(eq(photoUploads.breakId, b.id));
    expect(left.map((x) => x.id).sort()).toEqual([young.id, used.id].sort());
  }));

  it("removes published files that no row relies on after 24 hours, and junk names too", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const r1 = prefixOf(b.id); await variants(s, BUCKETS.public, r1, 25);
    const { prefix: r2 } = await addPhoto(tx, s, host, b.id, "photos");
    const r3 = prefixOf(b.id); await variants(s, BUCKETS.public, r3, 23);
    clock = hoursAgo(25); await s.put(BUCKETS.public, `${b.id}/junk.txt`, Buffer.from("x"), "image/webp"); clock = T0;
    const r = await job(s, tx);
    expect(hasNone(s, BUCKETS.public, r1)).toBe(true);
    expect(hasAll(s, BUCKETS.public, r2)).toBe(true);
    expect(hasAll(s, BUCKETS.public, r3)).toBe(true);
    expect(has(s, BUCKETS.public, `${b.id}/junk.txt`)).toBe(false);
    expect(r.orphans).toBe(4);
  }));

  it("keeps a failed open's public copy while the row is still a draft, and drops the draft copy once the break is open", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const draft = await makeBreak(tx, { hostId: host.id, status: "draft" });
    const { prefix: r4 } = await addPhoto(tx, s, host, draft.id, "photos-draft");
    await variants(s, BUCKETS.public, r4); // the copy a failed open left
    const open = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const { prefix: r5 } = await addPhoto(tx, s, host, open.id, "photos");
    await variants(s, BUCKETS.draft, r5); // the draft copy left after an open
    await job(s, tx);
    expect([hasAll(s, BUCKETS.draft, r4), hasAll(s, BUCKETS.public, r4)]).toEqual([true, true]);
    expect([hasNone(s, BUCKETS.draft, r5), hasAll(s, BUCKETS.public, r5)]).toEqual([true, true]);
  }));

  it("removes a deleted draft's photos", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const d = await makeBreak(tx, { hostId: host.id, status: "draft" });
    const { prefix } = await addPhoto(tx, s, host, d.id, "photos-draft");
    await deleteDraft(tx, as(host.id), d.id); // the files stay, as if the action's removal failed
    await job(s, tx);
    expect(hasNone(s, BUCKETS.draft, prefix)).toBe(true);
  }));

  it("removes an archive copy no row names (a crash before a hide or remove committed)", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const p = prefixOf(b.id); await variants(s, BUCKETS.archive, p);
    const r = await job(s, tx);
    expect(hasNone(s, BUCKETS.archive, p)).toBe(true);
    expect(r.orphans).toBe(3);
  }));

  it("never deletes the last copy: a removed photo whose files are only in photos is copied to the archive, not deleted (ruling 25)", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
    const b = await claimedBreak(tx, host, buyer);
    const { photoId, prefix } = await addPhoto(tx, s, host, b.id, "photos");
    await removePhoto(tx, as(host.id), { photoId, now: T0 }); // the row now relies on photo-archive, which holds nothing
    expect(hasNone(s, BUCKETS.archive, prefix)).toBe(true);
    const first = await job(s, tx);
    expect(hasAll(s, BUCKETS.archive, prefix)).toBe(true);  // copied into the row's own bucket
    expect(hasAll(s, BUCKETS.public, prefix)).toBe(true);   // and nothing deleted in the run that copied
    expect(first.orphans).toBe(0);
    await job(s, tx);
    expect(hasNone(s, BUCKETS.public, prefix)).toBe(true);  // the next run finds the archive complete
    expect(hasAll(s, BUCKETS.archive, prefix)).toBe(true);
    const removed = (await photosOf(tx, b.id, holderView(buyer))).removed;
    expect(removed.map((x) => x.prefix)).toEqual([prefix]);
  }));

  it("keeps a stale leftover object that a row came to rely on after the batch's read (the fresh re-read)", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const d = await makeBreak(tx, { hostId: host.id, status: "draft" });
    const p = prefixOf(d.id); await variants(s, BUCKETS.draft, p); // 25 h old, no row: an orphan when read
    let inserted = false;
    const r = await job(s, tx, {
      afterRead: async (rule) => {
        if (rule !== "orphans" || inserted) return;
        inserted = true;
        await makePhoto(tx, { breakId: d.id, createdBy: host.id, position: 0, bucket: "photos-draft", path: p });
      },
    });
    expect(inserted).toBe(true);
    expect(hasAll(s, BUCKETS.draft, p)).toBe(true);
    expect(r.orphans).toBe(0);
  }));

  it("tolerates a removed photo whose files exist in no bucket (a lost archive copy): nothing thrown, other rows and files still handled", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
    const b = await claimedBreak(tx, host, buyer);
    const lost = await addPhoto(tx, s, host, b.id, "photos");
    await removePhoto(tx, as(host.id), { photoId: lost.photoId, now: T0 }); // relies on photo-archive, which never got the copy
    await s.remove(BUCKETS.public, VARIANT_WIDTHS.map((w) => variantPath(lost.prefix, w))); // and the public files went
    const orphan = prefixOf(b.id); await variants(s, BUCKETS.public, orphan);
    const due = await archived(tx, s, host, b.id, 181);
    const r = await job(s, tx);
    expect(hasNone(s, BUCKETS.public, orphan)).toBe(true);
    expect(hasNone(s, BUCKETS.archive, due.prefix)).toBe(true);
    expect(r).toMatchObject({ orphans: 6, archive: 3, done: true }); // the orphan, and due's public copy
    const [row] = await tx.select({ bucket: breakPhotos.bucket, path: breakPhotos.path }).from(breakPhotos).where(eq(breakPhotos.id, lost.photoId));
    expect(row).toEqual({ bucket: "photo-archive", path: lost.prefix }); // left as it is
    expect(await job(s, tx)).toEqual({ incoming: 0, tickets: 0, orphans: 0, archive: 0, cancelled: 0, failed: 0, done: true });
  }));

  it("copies what it can into a relying row's bucket, counts the variants no bucket holds, and finishes on the next run", async () => withTx(async (tx) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = store(); const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
    const b = await claimedBreak(tx, host, buyer);
    const { photoId, prefix } = await addPhoto(tx, s, host, b.id, "photos");
    await removePhoto(tx, as(host.id), { photoId, now: T0 });
    await s.remove(BUCKETS.public, [variantPath(prefix, 160), variantPath(prefix, 1600)]); // only the 640 is left, in photos
    const first = await job(s, tx);
    expect(first.orphans).toBe(0);
    expect([has(s, BUCKETS.archive, variantPath(prefix, 640)), has(s, BUCKETS.public, variantPath(prefix, 640))]).toEqual([true, true]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`"missing":2`));
    expect(warn.mock.calls[0][0]).toContain(prefix);
    const second = await job(s, tx);
    expect(second.orphans).toBe(1);
    expect([has(s, BUCKETS.archive, variantPath(prefix, 640)), has(s, BUCKETS.public, variantPath(prefix, 640))]).toEqual([true, false]);
    expect(await job(s, tx)).toMatchObject({ orphans: 0, done: true });
  }));

  it("a removal that fails on one prefix is logged and counted, and the other prefixes and rules 3 and 4 still run", async () => withTx(async (tx) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = store(); const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
    const b = await claimedBreak(tx, host, buyer);
    const stuck = prefixOf(b.id); await variants(s, BUCKETS.public, stuck);
    const other = prefixOf(b.id); await variants(s, BUCKETS.public, other);
    const due = await archived(tx, s, host, b.id, 181);
    const c = await claimedBreak(tx, host, buyer);
    const live = await addPhoto(tx, s, host, c.id, "photos");
    await tx.execute(sql`update breaks set status = 'cancelled' where id = ${c.id}`);
    await tx.execute(sql`insert into events (break_id, type, created_at) values (${c.id}, 'break.cancelled', ${daysAgo(181).toISOString()}::timestamptz)`);
    const remove = s.remove.bind(s);
    vi.spyOn(s, "remove").mockImplementation(async (bucket, paths) => {
      if (bucket === BUCKETS.public && paths.some((p) => p.startsWith(stuck))) throw new Error("storage down");
      return remove(bucket, paths);
    });
    const r = await job(s, tx);
    expect(hasAll(s, BUCKETS.public, stuck)).toBe(true); // left for the next run
    expect(hasNone(s, BUCKETS.public, other)).toBe(true);
    expect(hasNone(s, BUCKETS.archive, due.prefix)).toBe(true);
    expect(hasNone(s, BUCKETS.public, live.prefix)).toBe(true);
    expect(r).toMatchObject({ orphans: 6, archive: 3, cancelled: 3, failed: 1, done: true }); // other, and due's public copy
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toContain(stuck);
  }));

  it("a failed incoming or junk removal is logged and counted, and the run goes on", async () => withTx(async (tx) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    clock = hoursAgo(25);
    await s.put(BUCKETS.incoming, `${b.id}/${randomUUID()}`, Buffer.from("x"), "image/webp");
    await s.put(BUCKETS.public, `${b.id}/junk.txt`, Buffer.from("x"), "image/webp");
    clock = T0;
    const orphan = prefixOf(b.id); await variants(s, BUCKETS.public, orphan);
    const remove = s.remove.bind(s);
    vi.spyOn(s, "remove").mockImplementation(async (bucket, paths) => {
      if (bucket === BUCKETS.incoming || paths.some((p) => p.endsWith("junk.txt"))) throw new Error("storage down");
      return remove(bucket, paths);
    });
    const r = await job(s, tx);
    expect(has(s, BUCKETS.public, `${b.id}/junk.txt`)).toBe(true);
    expect(hasNone(s, BUCKETS.public, orphan)).toBe(true);
    expect(r).toMatchObject({ incoming: 0, orphans: 3, failed: 2, done: true });
    expect(error).toHaveBeenCalledTimes(2);
  }));

  it("a bucket whose listing fails is skipped for this run; the other buckets and rules still run", async () => withTx(async (tx) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const pub = prefixOf(b.id); await variants(s, BUCKETS.public, pub);
    const arc = prefixOf(b.id); await variants(s, BUCKETS.archive, arc);
    const list = s.list.bind(s);
    vi.spyOn(s, "list").mockImplementation(async (bucket, prefix) => {
      if (bucket === BUCKETS.public && prefix === "") throw new Error("storage down");
      return list(bucket, prefix);
    });
    const r = await job(s, tx);
    expect(hasAll(s, BUCKETS.public, pub)).toBe(true);
    expect(hasNone(s, BUCKETS.archive, arc)).toBe(true);
    expect(r).toMatchObject({ orphans: 3, failed: 1, done: true });
    expect(error).toHaveBeenCalledTimes(1);
  }));

  it("drops archived photos after 180 days, keeps them before, and keeps them while the break is under hold", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
    const a = await claimedBreak(tx, host, buyer); const held = await claimedBreak(tx, host, buyer);
    const due = await archived(tx, s, host, a.id, 181);
    const young = await archived(tx, s, host, a.id, 179);
    const kept = await archived(tx, s, host, held.id, 181);
    const hidden = await addPhoto(tx, s, host, a.id, "photos");
    await variants(s, BUCKETS.archive, hidden.prefix);
    await hidePhoto(tx, SYSTEM, { photoId: hidden.photoId, reason: "test", now: daysAgo(181) }); // hidden_at is set once
    const r = await job(s, tx, { holds: async () => new Set([held.id]) });
    expect([hasNone(s, BUCKETS.archive, due.prefix), hasNone(s, BUCKETS.archive, hidden.prefix)]).toEqual([true, true]);
    expect([hasAll(s, BUCKETS.archive, young.prefix), hasAll(s, BUCKETS.archive, kept.prefix)]).toEqual([true, true]);
    expect(r.archive).toBe(6); // two photos, three variants each
    const removed = (await photosOf(tx, a.id, holderView(buyer))).removed;
    expect(removed.find((x) => x.id === due.photoId)!.prefix).toBeNull(); // the Removed mark stays, with no image
    expect(removed.find((x) => x.id === young.photoId)!.prefix).toBe(young.prefix);
  }));

  it("expires a cancelled break's photos 180 days after the cancel: rows to photo-archive with no path, photo.expired, every file gone (ruling 26)", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
    const b = await claimedBreak(tx, host, buyer);
    const live = await addPhoto(tx, s, host, b.id, "photos");
    const gone = await archived(tx, s, host, b.id, 10);
    await tx.execute(sql`update breaks set status = 'cancelled' where id = ${b.id}`);
    await tx.execute(sql`insert into events (break_id, type, created_at) values (${b.id}, 'break.cancelled', ${daysAgo(181).toISOString()}::timestamptz)`);
    const r = await job(s, tx);
    for (const p of [live.prefix, gone.prefix]) for (const bucket of Object.values(BUCKETS)) expect(hasNone(s, bucket, p), `${bucket} ${p}`).toBe(true);
    const rows = await tx.select({ bucket: breakPhotos.bucket, path: breakPhotos.path }).from(breakPhotos).where(eq(breakPhotos.breakId, b.id));
    expect(rows).toEqual([{ bucket: "photo-archive", path: null }, { bucket: "photo-archive", path: null }]); // allowed by the new gone check
    const evs = await tx.select().from(events).where(and(eq(events.breakId, b.id), eq(events.type, "photo.expired")));
    expect(evs).toHaveLength(1);
    expect(evs[0].payload).toEqual({ photoIds: expect.arrayContaining([live.photoId, gone.photoId]), reason: "retention" });
    expect(evs[0].processedAt).not.toBeNull();
    expect((await leadPhotos(tx, [b.id])).has(b.id)).toBe(false);
    expect(r.cancelled).toBe(6);
  }));

  it("leaves a cancelled break's photos alone before 180 days, under hold, and without a cancel event", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
    const cases: { id: string; prefix: string }[] = [];
    for (const [days, held] of [[179, false], [181, true], [null, false]] as const) {
      const b = await claimedBreak(tx, host, buyer);
      const { prefix } = await addPhoto(tx, s, host, b.id, "photos");
      await tx.execute(sql`update breaks set status = 'cancelled' where id = ${b.id}`);
      if (days !== null) await tx.execute(sql`insert into events (break_id, type, created_at) values (${b.id}, 'break.cancelled', ${daysAgo(days).toISOString()}::timestamptz)`);
      cases.push({ id: held ? b.id : "", prefix });
    }
    const r = await job(s, tx, { holds: async () => new Set(cases.map((c) => c.id).filter(Boolean)) });
    for (const c of cases) expect(hasAll(s, BUCKETS.public, c.prefix), c.prefix).toBe(true);
    expect(r.cancelled).toBe(0);
  }));

  it("works through more than one batch in a run", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const ps = Array.from({ length: 5 }, () => prefixOf(b.id));
    for (const p of ps) await variants(s, BUCKETS.public, p);
    const r = await job(s, tx, { batchSize: 2 });
    expect(ps.every((p) => hasNone(s, BUCKETS.public, p))).toBe(true);
    expect(r).toMatchObject({ orphans: 15, done: true });
  }));

  it("stops at the time budget and finishes on the next run", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const ps = Array.from({ length: 3 }, () => prefixOf(b.id));
    for (const p of ps) await variants(s, BUCKETS.public, p);
    const first = await job(s, tx, { budgetMs: 0 });
    expect(first.done).toBe(false);
    expect(ps.some((p) => hasAll(s, BUCKETS.public, p))).toBe(true);
    const second = await job(s, tx);
    expect(second.done).toBe(true);
    expect(ps.every((p) => hasNone(s, BUCKETS.public, p))).toBe(true);
  }));

  it("is idempotent: a second run removes nothing, and a file already gone is not an error", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
    const b = await claimedBreak(tx, host, buyer);
    const orphan = prefixOf(b.id); await variants(s, BUCKETS.public, orphan);
    const due = await archived(tx, s, host, b.id, 181);
    await s.remove(BUCKETS.archive, VARIANT_WIDTHS.map((w) => variantPath(due.prefix, w)));
    await s.remove(BUCKETS.public, VARIANT_WIDTHS.map((w) => variantPath(due.prefix, w))); // every copy already gone
    await job(s, tx);
    const [row] = await tx.select({ path: breakPhotos.path }).from(breakPhotos).where(eq(breakPhotos.id, due.photoId));
    expect(row.path).toBeNull();
    expect(await job(s, tx)).toEqual({ incoming: 0, tickets: 0, orphans: 0, archive: 0, cancelled: 0, failed: 0, done: true });
  }));

  it("returns locked while another run holds the lock, and touches nothing", async () => {
    await db.transaction(async (holder) => {
      await holder.execute(sql`select pg_advisory_xact_lock(hashtext('job:photo-cleanup'))`);
      const s = store();
      await variants(s, BUCKETS.public, `${randomUUID()}/${"A".repeat(22)}`);
      const before = [...s.files.keys()];
      expect(await runPhotoCleanup(s, T0)).toBe("locked");
      expect([...s.files.keys()]).toEqual(before);
    });
  });
});

describe("breaksUnderHold", () => {
  it("is empty until the reports plan gives it open reports", async () => withTx(async (tx) => expect((await breaksUnderHold(tx)).size).toBe(0)));
});
