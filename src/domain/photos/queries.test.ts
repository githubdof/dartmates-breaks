import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, makeBreak, openBreakWithLines, makePhoto } from "../../../tests/helpers/fixtures";
import { breakPhotos as photoRows } from "@/db/schema";
import { allowPhotoModeration } from "@/db/photo-moderation";
import { SYSTEM } from "@/domain/types";
import { NOW, as, later, setStatus, claimedBreak } from "./test-helpers";
import { removePhoto, hidePhoto, markPhotoNoticeSeen } from "./commands";
import { breakPhotos, leadPhotos } from "./queries";

const viewer = (id: string, o: Partial<{ isHost: boolean; isHolder: boolean; isAdmin: boolean }> = {}) =>
  ({ id, isHost: false, isHolder: false, isAdmin: false, ...o });

describe("breakPhotos", () => {
  it("live photos in order for everyone on an open break; removed ones only for the host, holders and admins", async () => {
    await withTx(async (tx) => {
      const { host, buyer, b, top, photos } = await claimedBreak(tx, 3, ["top", null, null]);
      await removePhoto(tx, as(host.id), { photoId: photos[2].id, now: NOW });
      const stranger = await breakPhotos(tx, b.id, null);
      expect(stranger.live).toEqual([
        { id: photos[0].id, position: 0, slot: top, alt: "Darts", width: 1600, height: 1200, location: "photos", prefix: photos[0].prefix },
        { id: photos[1].id, position: 1, slot: null, alt: "Darts", width: 1600, height: 1200, location: "photos", prefix: photos[1].prefix },
      ]);
      expect(stranger.removed).toEqual([]);
      expect(stranger.notice).toEqual({ text: "Photo removed", at: NOW }); // everyone sees the notice (§6)
      expect(stranger.unseen).toBe(false);
      const removed = [{ id: photos[2].id, slot: null, alt: "Darts", width: 1600, height: 1200, removedAt: NOW, location: "photo-archive", prefix: photos[2].prefix }];
      for (const v of [viewer(host.id, { isHost: true }), viewer(buyer.id, { isHolder: true }), viewer(randomUUID(), { isAdmin: true })]) {
        expect((await breakPhotos(tx, b.id, v)).removed, JSON.stringify(v)).toEqual(removed);
      }
      expect((await breakPhotos(tx, b.id, viewer(randomUUID()))).removed).toEqual([]);
    });
  });
  it("a draft's photos only for the host and admins", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: 0, bucket: "photos-draft" });
      expect((await breakPhotos(tx, b.id, null)).live).toEqual([]);
      expect((await breakPhotos(tx, b.id, viewer(randomUUID()))).live).toEqual([]);
      expect((await breakPhotos(tx, b.id, viewer(host.id, { isHost: true }))).live.map((p) => p.location)).toEqual(["photos-draft"]);
      expect((await breakPhotos(tx, b.id, viewer(randomUUID(), { isAdmin: true }))).live).toHaveLength(1);
    });
  });
  it("a row left in photos-draft on an open break reaches only the host and admins", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const stuck = await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: 0, bucket: "photos-draft" });
      await setStatus(tx, b.id, "open"); // opened without the move: the step that must never leak
      expect((await breakPhotos(tx, b.id, null)).live).toEqual([]);
      expect((await breakPhotos(tx, b.id, viewer(randomUUID()))).live).toEqual([]);
      expect((await breakPhotos(tx, b.id, viewer(randomUUID(), { isHolder: true }))).live).toEqual([]);
      expect((await breakPhotos(tx, b.id, viewer(host.id, { isHost: true }))).live.map((p) => [p.id, p.location])).toEqual([[stuck.id, "photos-draft"]]);
      expect((await breakPhotos(tx, b.id, viewer(randomUUID(), { isAdmin: true }))).live.map((p) => p.id)).toEqual([stuck.id]);
    });
  });
  it("a hidden photo, live or removed, reaches nobody", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 2);
      await removePhoto(tx, as(host.id), { photoId: photos[1].id, now: NOW });
      await hidePhoto(tx, SYSTEM, { photoId: photos[0].id, reason: "r", now: NOW });
      await hidePhoto(tx, SYSTEM, { photoId: photos[1].id, reason: "r", now: NOW });
      for (const v of [null, viewer(host.id, { isHost: true }), viewer(randomUUID(), { isAdmin: true, isHolder: true })]) {
        const r = await breakPhotos(tx, b.id, v);
        expect([r.live, r.removed]).toEqual([[], []]);
      }
    });
  });
  it("unseen is true only for a holder who has not seen the latest change", async () => {
    await withTx(async (tx) => {
      const { host, buyer, b, photos } = await claimedBreak(tx, 2);
      await removePhoto(tx, as(host.id), { photoId: photos[1].id, now: NOW });
      expect((await breakPhotos(tx, b.id, viewer(buyer.id, { isHolder: true }))).unseen).toBe(true);
      expect((await breakPhotos(tx, b.id, viewer(host.id, { isHost: true }))).unseen).toBe(false);
      await markPhotoNoticeSeen(tx, as(buyer.id, "member"), { breakId: b.id, now: later(10) });
      expect((await breakPhotos(tx, b.id, viewer(buyer.id, { isHolder: true }))).unseen).toBe(false);
    });
  });
  it("a removed photo whose archive copy was dropped keeps its mark with a null prefix", async () => {
    await withTx(async (tx) => {
      const { host, buyer, b } = await claimedBreak(tx, 0);
      await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: 0, removedAt: NOW, bucket: "photo-archive", path: null });
      expect((await breakPhotos(tx, b.id, viewer(buyer.id, { isHolder: true }))).removed[0]).toMatchObject({ removedAt: NOW, prefix: null });
    });
  });
});

describe("expired photos (ruling 26)", () => {
  it("a row in photo-archive with a null path, neither removed nor hidden, appears nowhere live", async () => {
    await withTx(async (tx) => {
      const { host, buyer, b, photos } = await claimedBreak(tx, 2, ["top", null]);
      await setStatus(tx, b.id, "cancelled");
      // As the cleanup's retention rule 4 leaves a cancelled break's photo (Task 11).
      await allowPhotoModeration(tx);
      await tx.update(photoRows).set({ bucket: "photo-archive", path: null }).where(sql`${photoRows.id} = ${photos[0].id}`);
      const [row] = await tx.select().from(photoRows).where(sql`${photoRows.id} = ${photos[0].id}`);
      expect(row).toMatchObject({ removedAt: null, hiddenAt: null, bucket: "photo-archive", path: null });
      for (const v of [null, viewer(host.id, { isHost: true }), viewer(buyer.id, { isHolder: true }), viewer(randomUUID(), { isAdmin: true })]) {
        const r = await breakPhotos(tx, b.id, v);
        expect(r.live.map((p) => p.id), JSON.stringify(v)).toEqual([photos[1].id]);
        expect(r.live.every((p) => p.prefix !== null && p.location !== "photo-archive"), JSON.stringify(v)).toBe(true);
        expect(r.removed, JSON.stringify(v)).toEqual([]);
      }
      // Its position 0 is no lead: the feed, /me, /host, the profile and the preview show no photo.
      expect((await leadPhotos(tx, [b.id])).has(b.id)).toBe(false);
    });
  });
});

describe("leadPhotos", () => {
  it("returns each break's live position-0 photo from the public bucket only", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const open = await openBreakWithLines(tx, { hostId: host.id });
      const lead = await makePhoto(tx, { breakId: open.id, createdBy: host.id, position: 0 });
      await makePhoto(tx, { breakId: open.id, createdBy: host.id, position: 1 });
      const draft = await makeBreak(tx, { hostId: host.id });
      await makePhoto(tx, { breakId: draft.id, createdBy: host.id, position: 0, bucket: "photos-draft" });
      const onlyRemoved = await openBreakWithLines(tx, { hostId: host.id });
      await makePhoto(tx, { breakId: onlyRemoved.id, createdBy: host.id, position: 0, removedAt: NOW, bucket: "photo-archive" });
      const onlyHidden = await openBreakWithLines(tx, { hostId: host.id });
      await makePhoto(tx, { breakId: onlyHidden.id, createdBy: host.id, position: 0, hiddenAt: NOW, bucket: "photo-archive" });
      const m = await leadPhotos(tx, [open.id, draft.id, onlyRemoved.id, onlyHidden.id]);
      expect([...m.keys()]).toEqual([open.id]);
      expect(m.get(open.id)).toMatchObject({ id: lead.id, position: 0, location: "photos", prefix: lead.prefix });
      expect((await leadPhotos(tx, [])).size).toBe(0);
    });
  });
});
