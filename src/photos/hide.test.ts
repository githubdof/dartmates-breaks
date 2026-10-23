import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Tx, TxRunner } from "@/db/client";
import { breakPhotos, breaks, events } from "@/db/schema";
import { allowPhotoModeration } from "@/db/photo-moderation";
import { NotFound } from "@/domain/errors";
import { claimLines } from "@/domain/lines/commands";
import { issueUploadTicket, recordProcessedPhoto, removePhoto } from "@/domain/photos/commands";
import { breakPhotos as photosOf, leadPhotos } from "@/domain/photos/queries";
import { dropPhotoFiles } from "@/domain/photos/retention";
import type { Caller } from "@/domain/types";
import { BUCKETS, VARIANT_WIDTHS, variantPath, type BucketName } from "@/storage/buckets";
import type { PhotoStorage } from "@/storage/photo-storage";
import { withTx } from "../../tests/helpers/db";
import { makeBreak, makeUser, openBreakWithLines } from "../../tests/helpers/fixtures";
import { createMemoryStorage } from "../../tests/helpers/memory-storage";
import { hidePhotoAndFiles, parseHideArgs } from "./hide";

const T0 = new Date("2026-10-21T09:17:00Z");
const hoursAgo = (h: number) => new Date(T0.getTime() - h * 3_600_000);
const ID = "3f2c1b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f";
let clock = T0;
beforeEach(() => { clock = T0; });
afterEach(() => { vi.restoreAllMocks(); });
const store = () => createMemoryStorage(() => clock);
const run = (tx: Tx): TxRunner => (fn) => fn(tx);
const as = (id: string, role: Caller["role"] = "host"): Caller => ({ id, role, onboarded: true, banned: false });
const prefixOf = (breakId: string) => `${breakId}/${randomBytes(16).toString("base64url")}`;
async function variants(s: PhotoStorage, bucket: BucketName, prefix: string, ageHours = 25) {
  clock = hoursAgo(ageHours);
  for (const w of VARIANT_WIDTHS) await s.put(bucket, variantPath(prefix, w), Buffer.from("x"), "image/webp");
  clock = T0;
}
type MemoryStorage = ReturnType<typeof createMemoryStorage>;
const has = (s: MemoryStorage, bucket: BucketName, path: string) => s.files.has(`${bucket}/${path}`);
const hasAll = (s: MemoryStorage, bucket: BucketName, prefix: string) => VARIANT_WIDTHS.every((w) => has(s, bucket, variantPath(prefix, w)));
const hasNone = (s: MemoryStorage, bucket: BucketName, prefix: string) => VARIANT_WIDTHS.every((w) => !has(s, bucket, variantPath(prefix, w)));
async function addPhoto(tx: Tx, s: PhotoStorage, host: { id: string }, breakId: string, location: "photos" | "photos-draft") {
  const { ticketId } = await issueUploadTicket(tx, as(host.id), { breakId, now: T0 });
  const prefix = prefixOf(breakId);
  const { photoId } = await recordProcessedPhoto(tx, as(host.id), { ticketId, prefix, location, width: 1600, height: 1200, slot: null, alt: "Darts", now: T0 });
  await variants(s, location, prefix);
  return { photoId, prefix };
}
async function claimedBreak(tx: Tx, host: { id: string }, buyer: { id: string }) {
  const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
  await claimLines(tx, as(buyer.id, "member"), { breakId: b.id, numbers: [1], batchId: randomUUID() });
  return b;
}
const typed = (tx: Tx, breakId: string, type: string) => tx.select().from(events).where(and(eq(events.breakId, breakId), eq(events.type, type)));
const row = async (tx: Tx, photoId: string) => (await tx.select({ hiddenAt: breakPhotos.hiddenAt, bucket: breakPhotos.bucket, path: breakPhotos.path })
  .from(breakPhotos).where(eq(breakPhotos.id, photoId)))[0];

describe("parseHideArgs", () => {
  it("reads an id, a reason and --purge anywhere", () => {
    expect(parseHideArgs([ID, "nudity"])).toEqual({ photoId: ID, reason: "nudity", purge: false });
    expect(parseHideArgs(["--purge", ID, "illegal content"])).toEqual({ photoId: ID, reason: "illegal content", purge: true });
  });
  it("refuses a missing reason, a non-uuid id, an unknown flag and extra words", () => {
    for (const a of [[ID], ["nope", "r"], [ID, "r", "--force"], [ID, "r", "extra"], [ID, "   "]]) expect(parseHideArgs(a)).toHaveProperty("error");
  });
});

describe("hidePhotoAndFiles (photos spec §10)", () => {
  it("hides a published photo: row hidden, photo.hidden written, public variants gone, a copy in the archive", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
    const b = await claimedBreak(tx, host, buyer);
    const { photoId, prefix } = await addPhoto(tx, s, host, b.id, "photos");
    expect(await hidePhotoAndFiles(s, { photoId, reason: "nudity", purge: false, now: T0 }, run(tx))).toEqual({ status: "hidden", breakId: b.id });
    expect([hasNone(s, BUCKETS.public, prefix), hasAll(s, BUCKETS.archive, prefix)]).toEqual([true, true]);
    expect(await row(tx, photoId)).toMatchObject({ bucket: "photo-archive", path: prefix, hiddenAt: T0 });
    expect(await typed(tx, b.id, "photo.hidden")).toHaveLength(1);
    expect((await leadPhotos(tx, [b.id])).has(b.id)).toBe(false);
    const v = await photosOf(tx, b.id, { id: buyer.id, isHost: false, isHolder: true, isAdmin: false });
    expect([...v.live, ...v.removed].map((x) => x.id)).not.toContain(photoId); // a hidden photo is never shown
  }));
  it("hides a draft's photo the same way, from photos-draft", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const d = await makeBreak(tx, { hostId: host.id, status: "draft" });
    const { photoId, prefix } = await addPhoto(tx, s, host, d.id, "photos-draft");
    expect((await hidePhotoAndFiles(s, { photoId, reason: "r", purge: false, now: T0 }, run(tx))).status).toBe("hidden");
    expect([hasNone(s, BUCKETS.draft, prefix), hasAll(s, BUCKETS.archive, prefix)]).toEqual([true, true]);
  }));
  it("hides a photo the host had removed after the first claim, and never removes from photo-archive (ruling 27)", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
    const b = await claimedBreak(tx, host, buyer);
    const { photoId, prefix } = await addPhoto(tx, s, host, b.id, "photos");
    await variants(s, BUCKETS.archive, prefix);
    await removePhoto(tx, as(host.id), { photoId, now: T0 });
    const removeSpy = vi.spyOn(s, "remove");
    expect((await hidePhotoAndFiles(s, { photoId, reason: "r", purge: false, now: T0 }, run(tx))).status).toBe("hidden");
    expect(hasAll(s, BUCKETS.archive, prefix)).toBe(true); // its only copy stays
    expect(removeSpy.mock.calls.filter(([bucket]) => bucket === BUCKETS.archive)).toEqual([]);
    expect((await row(tx, photoId)).hiddenAt).toEqual(T0);
  }));
  it("hides a removed photo whose archive copy was lost: copies what another bucket still holds, and never throws", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
    const b = await claimedBreak(tx, host, buyer);
    const { photoId, prefix } = await addPhoto(tx, s, host, b.id, "photos");
    await removePhoto(tx, as(host.id), { photoId, now: T0 }); // relies on photo-archive, which never got the copy
    await s.remove(BUCKETS.public, [variantPath(prefix, 160)]); // and one variant is nowhere
    expect((await hidePhotoAndFiles(s, { photoId, reason: "r", purge: false, now: T0 }, run(tx))).status).toBe("hidden");
    expect(VARIANT_WIDTHS.map((w) => has(s, BUCKETS.archive, variantPath(prefix, w)))).toEqual([false, true, true]);
    expect((await row(tx, photoId)).hiddenAt).toEqual(T0);
  }));
  it("hides a row whose files are already gone (path null): no copy, no removal, the row hidden (ruling 27)", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
    const b = await claimedBreak(tx, host, buyer);
    const { photoId } = await addPhoto(tx, s, host, b.id, "photos");
    await removePhoto(tx, as(host.id), { photoId, now: T0 });
    await allowPhotoModeration(tx); await dropPhotoFiles(tx, [photoId]); // retention already took the archive copy
    const copySpy = vi.spyOn(s, "copy"); const removeSpy = vi.spyOn(s, "remove");
    expect((await hidePhotoAndFiles(s, { photoId, reason: "r", purge: false, now: T0 }, run(tx))).status).toBe("hidden");
    expect(copySpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
    expect(await row(tx, photoId)).toMatchObject({ hiddenAt: T0, path: null });
  }));
  it("purges: every copy in every bucket gone, the row's path null, photo.purged written with the reason", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const { photoId, prefix } = await addPhoto(tx, s, host, b.id, "photos");
    await variants(s, BUCKETS.draft, prefix); // a stray draft copy too
    expect((await hidePhotoAndFiles(s, { photoId, reason: "illegal content", purge: true, now: T0 }, run(tx))).status).toBe("purged");
    for (const bucket of Object.values(BUCKETS)) expect(hasNone(s, bucket, prefix), bucket).toBe(true);
    expect(await row(tx, photoId)).toMatchObject({ bucket: "photo-archive", path: null });
    const [ev] = await typed(tx, b.id, "photo.purged");
    expect(ev.payload).toMatchObject({ photoId, reason: "illegal content" });
    // the hide had already taken the public copy: the purge removed what was left, and says where from
    expect((ev.payload as { buckets: string[] }).buckets.sort()).toEqual([BUCKETS.archive, BUCKETS.draft].sort());
    expect(ev.processedAt).not.toBeNull();
  }));
  it("purges a photo hidden earlier, removing the archive copy", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const { photoId, prefix } = await addPhoto(tx, s, host, b.id, "photos");
    await hidePhotoAndFiles(s, { photoId, reason: "r", purge: false, now: T0 }, run(tx));
    expect(hasAll(s, BUCKETS.archive, prefix)).toBe(true);
    expect((await hidePhotoAndFiles(s, { photoId, reason: "r", purge: true, now: T0 }, run(tx))).status).toBe("purged");
    expect(hasNone(s, BUCKETS.archive, prefix)).toBe(true);
    expect((await row(tx, photoId)).path).toBeNull();
  }));
  it("purges a photo of a drawn break, whose photos are frozen (ruling 10)", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
    const b = await claimedBreak(tx, host, buyer);
    const { photoId, prefix } = await addPhoto(tx, s, host, b.id, "photos");
    await tx.update(breaks).set({ status: "drawn" }).where(eq(breaks.id, b.id));
    expect((await hidePhotoAndFiles(s, { photoId, reason: "r", purge: true, now: T0 }, run(tx))).status).toBe("purged");
    for (const bucket of Object.values(BUCKETS)) expect(hasNone(s, bucket, prefix), bucket).toBe(true);
    expect(await row(tx, photoId)).toMatchObject({ hiddenAt: T0, path: null });
  }));
  it("does nothing to a photo already hidden without --purge, and says so", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const { photoId } = await addPhoto(tx, s, host, b.id, "photos");
    await hidePhotoAndFiles(s, { photoId, reason: "r", purge: false, now: T0 }, run(tx));
    const before = [...s.files.keys()].sort();
    expect((await hidePhotoAndFiles(s, { photoId, reason: "r", purge: false, now: T0 }, run(tx))).status).toBe("already-hidden");
    expect([...s.files.keys()].sort()).toEqual(before);
    expect(await typed(tx, b.id, "photo.hidden")).toHaveLength(1);
  }));
  it("leaves the photo visible when the archive copy fails: the copy runs before the hide commits", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const { photoId, prefix } = await addPhoto(tx, s, host, b.id, "photos");
    vi.spyOn(s, "copy").mockRejectedValue(new Error("storage down"));
    await expect(hidePhotoAndFiles(s, { photoId, reason: "r", purge: false, now: T0 }, run(tx))).rejects.toThrow("storage down");
    expect((await row(tx, photoId)).hiddenAt).toBeNull();
    expect(hasAll(s, BUCKETS.public, prefix)).toBe(true);
    expect((await leadPhotos(tx, [b.id])).get(b.id)?.id).toBe(photoId);
  }));
  it("throws NotFound for an unknown photo id", async () => withTx(async (tx) => {
    await expect(hidePhotoAndFiles(store(), { photoId: randomUUID(), reason: "r", purge: false, now: T0 }, run(tx))).rejects.toBeInstanceOf(NotFound);
  }));
});
