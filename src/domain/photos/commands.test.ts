import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, makeBreak, openBreakWithLines, makePhoto, addPrize } from "../../../tests/helpers/fixtures";
import { breaks, breakPhotos, events, photoNoticesSeen } from "@/db/schema";
import { releaseLine } from "@/domain/lines/commands";
import { NotAuthorized, NotFound, NotOpen } from "@/domain/errors";
import { SYSTEM } from "@/domain/types";
import { NOW, as, later, live, setStatus, claimedBreak } from "./test-helpers";
import { removePhoto, reorderPhotos, retagPhoto, describePhoto, hidePhoto, markPhotoNoticeSeen } from "./commands";

const positions = async (tx: Tx, breakId: string) => (await live(tx, breakId)).map((p) => [p.id, p.position]);
const noticeOf = async (tx: Tx, breakId: string) => (await tx.select({ at: breaks.photosUpdatedAt, text: breaks.photosUpdatedNote }).from(breaks).where(sql`${breaks.id} = ${breakId}`))[0];
const typed = async (tx: Tx, breakId: string, type: string) => tx.select().from(events).where(sql`${events.breakId} = ${breakId} and ${events.type} = ${type}`);

describe("removePhoto", () => {
  it("before any claim deletes the row outright, renumbers, and sets no notice", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id });
      const ps = [];
      for (let i = 0; i < 3; i++) ps.push(await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: i }));
      expect(await removePhoto(tx, as(host.id), { photoId: ps[1].id, now: NOW })).toEqual({ prefix: ps[1].prefix, from: "photos", archive: false });
      expect(await tx.select().from(breakPhotos).where(sql`${breakPhotos.id} = ${ps[1].id}`)).toHaveLength(0);
      expect(await positions(tx, b.id)).toEqual([[ps[0].id, 0], [ps[2].id, 1]]);
      expect(await noticeOf(tx, b.id)).toEqual({ at: null, text: null });
      expect((await typed(tx, b.id, "photo.removed")).map((e) => e.payload)).toEqual([
        { photoId: ps[1].id, position: 1, slot: null, wasLead: false, archived: false, previousLead: ps[0].id },
      ]);
    });
  });
  it("after the first claim archives the row and sets the place's sentence in the same transaction", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 3, [null, "top", null]);
      expect(await removePhoto(tx, as(host.id), { photoId: photos[1].id, now: NOW })).toEqual({ prefix: photos[1].prefix, from: "photos", archive: true });
      const [row] = await tx.select().from(breakPhotos).where(sql`${breakPhotos.id} = ${photos[1].id}`);
      expect(row).toMatchObject({ removedAt: NOW, bucket: "photo-archive", path: photos[1].prefix });
      expect(await positions(tx, b.id)).toEqual([[photos[0].id, 0], [photos[2].id, 1]]);
      expect(await noticeOf(tx, b.id)).toEqual({ at: NOW, text: "Top-spot photo removed" });
    });
  });
  it("a claim that was later released still counts as claimed (decision 12)", async () => {
    await withTx(async (tx) => {
      const { host, buyer, b, photos } = await claimedBreak(tx, 2);
      await releaseLine(tx, as(buyer.id, "member"), { breakId: b.id, number: 1, reason: "withdrawn" });
      expect((await removePhoto(tx, as(host.id), { photoId: photos[0].id, now: NOW })).archive).toBe(true);
    });
  });
  it("removing the lead with others left reads 'Lead photo replaced'; the next photo leads", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 2, ["top", "second"]);
      await removePhoto(tx, as(host.id), { photoId: photos[0].id, now: NOW });
      expect(await positions(tx, b.id)).toEqual([[photos[1].id, 0]]);
      expect((await noticeOf(tx, b.id)).text).toBe("Lead photo replaced");
    });
  });
  it("removing the last photo reads as its place's removal (ruling 1, Review Focus 2)", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 1, ["top"]);
      await removePhoto(tx, as(host.id), { photoId: photos[0].id, now: NOW });
      expect(await live(tx, b.id)).toHaveLength(0);
      expect((await noticeOf(tx, b.id)).text).toBe("Top-spot photo removed");
      const untagged = await claimedBreak(tx, 1, [null]);
      await removePhoto(tx, as(untagged.host.id), { photoId: untagged.photos[0].id, now: NOW });
      expect((await noticeOf(tx, untagged.b.id)).text).toBe("Photo removed");
    });
  });
  it("is the host's or an admin's, only until the draw is requested, and once per photo", async () => {
    await withTx(async (tx) => {
      const { host, buyer, b, photos } = await claimedBreak(tx, 2);
      await expect(removePhoto(tx, as(buyer.id, "member"), { photoId: photos[0].id, now: NOW })).rejects.toBeInstanceOf(NotAuthorized);
      await removePhoto(tx, as(host.id), { photoId: photos[0].id, now: NOW });
      await expect(removePhoto(tx, as(host.id), { photoId: photos[0].id, now: NOW })).rejects.toThrow(new NotFound("Photo not found"));
      await setStatus(tx, b.id, "drawing");
      await expect(removePhoto(tx, as(host.id), { photoId: photos[1].id, now: NOW })).rejects.toBeInstanceOf(NotOpen);
    });
  });
});

describe("reorderPhotos", () => {
  it("sets positions from the order and logs the final order once", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 3);
      const order = [photos[0].id, photos[2].id, photos[1].id];
      await reorderPhotos(tx, as(host.id), { breakId: b.id, order, now: NOW });
      expect(await positions(tx, b.id)).toEqual(order.map((id, i) => [id, i]));
      expect((await typed(tx, b.id, "photo.reordered")).map((e) => e.payload)).toEqual([{ order, previousLead: photos[0].id }]);
      expect(await noticeOf(tx, b.id)).toEqual({ at: null, text: null }); // the lead was kept
    });
  });
  it("a new lead after the first claim reads 'Lead photo replaced'", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 3);
      await reorderPhotos(tx, as(host.id), { breakId: b.id, order: [photos[2].id, photos[0].id, photos[1].id], now: NOW });
      expect(await noticeOf(tx, b.id)).toEqual({ at: NOW, text: "Lead photo replaced" });
    });
  });
  it("refuses an order that is not exactly the live photos, and the same order is a no-op", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 3);
      const removed = await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: 3, removedAt: NOW, bucket: "photo-archive" });
      const ids = photos.map((p) => p.id);
      for (const order of [ids.slice(0, 2), [...ids, removed.id], [ids[0], ids[0], ids[1]], [ids[0], ids[1], randomUUID()]]) {
        await expect(reorderPhotos(tx, as(host.id), { breakId: b.id, order, now: NOW })).rejects.toThrow("The photos just changed. Try again.");
      }
      await reorderPhotos(tx, as(host.id), { breakId: b.id, order: ids, now: NOW });
      expect(await typed(tx, b.id, "photo.reordered")).toHaveLength(0);
      expect(await positions(tx, b.id)).toEqual(ids.map((id, i) => [id, i]));
    });
  });
});

describe("retagPhoto", () => {
  it("a move to another prize after the first claim sets the sentence; tagging an untagged photo does not", async () => {
    await withTx(async (tx) => {
      const { host, b, top, second, photos } = await claimedBreak(tx, 2, ["top", null]);
      await retagPhoto(tx, as(host.id), { photoId: photos[1].id, slot: top, now: NOW });
      expect(await noticeOf(tx, b.id)).toEqual({ at: null, text: null });
      await retagPhoto(tx, as(host.id), { photoId: photos[0].id, slot: second, now: NOW });
      expect(await noticeOf(tx, b.id)).toEqual({ at: NOW, text: "A photo moved from Top spot to 2nd place" });
      expect((await typed(tx, b.id, "photo.retagged")).map((e) => e.payload)).toContainEqual({ photoId: photos[0].id, from: top, to: second });
    });
  });
  it("untagging a prize's photo counts; two separate actions keep the latest sentence and time (ruling 2)", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 3, ["top", "second", null]);
      await removePhoto(tx, as(host.id), { photoId: photos[1].id, now: NOW });
      await retagPhoto(tx, as(host.id), { photoId: photos[0].id, slot: null, now: later(60) });
      expect(await noticeOf(tx, b.id)).toEqual({ at: later(60), text: "Top-spot photo untagged" });
    });
  });
  it("refuses a slot of another break; the same slot is a no-op", async () => {
    await withTx(async (tx) => {
      const { host, b, top, photos } = await claimedBreak(tx, 1, ["top"]);
      const elsewhere = await makeBreak(tx, { hostId: host.id });
      const foreign = await addPrize(tx, elsewhere.id, 2, "Case");
      await expect(retagPhoto(tx, as(host.id), { photoId: photos[0].id, slot: foreign, now: NOW })).rejects.toThrow("Pick one of this break's prizes, or no tag.");
      await retagPhoto(tx, as(host.id), { photoId: photos[0].id, slot: top, now: NOW });
      expect(await typed(tx, b.id, "photo.retagged")).toHaveLength(0);
    });
  });
});

describe("describePhoto", () => {
  it("stores the trimmed alt text, 1–120 characters, without an event", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 1);
      await describePhoto(tx, as(host.id), { photoId: photos[0].id, alt: "  Chronos, barrels  " });
      expect((await live(tx, b.id))[0].alt).toBe("Chronos, barrels");
      await expect(describePhoto(tx, as(host.id), { photoId: photos[0].id, alt: "" })).rejects.toThrow("Describe the photo in 1 to 120 characters.");
      expect(await tx.select().from(events).where(sql`${events.breakId} = ${b.id} and ${events.type} like 'photo.%'`)).toHaveLength(0);
      await setStatus(tx, b.id, "drawing");
      await expect(describePhoto(tx, as(host.id), { photoId: photos[0].id, alt: "x" })).rejects.toBeInstanceOf(NotOpen);
    });
  });
});

describe("hidePhoto", () => {
  it("is for admins and SYSTEM; hides, renumbers, moves the row to the archive and never sets the notice", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 2, ["top", null]);
      const admin = await makeUser(tx, { role: "admin" });
      await expect(hidePhoto(tx, as(host.id), { photoId: photos[0].id, reason: "x", now: NOW })).rejects.toThrow("Admins only");
      await expect(hidePhoto(tx, as(admin.id, "admin"), { photoId: photos[0].id, reason: "  ", now: NOW })).rejects.toThrow("Give a reason for hiding the photo.");
      expect(await hidePhoto(tx, as(admin.id, "admin"), { photoId: photos[0].id, reason: "Not the item", now: NOW })).toEqual({ prefix: photos[0].prefix, from: "photos" });
      const [row] = await tx.select().from(breakPhotos).where(sql`${breakPhotos.id} = ${photos[0].id}`);
      expect(row).toMatchObject({ hiddenAt: NOW, bucket: "photo-archive" });
      expect(await positions(tx, b.id)).toEqual([[photos[1].id, 0]]);
      expect(await noticeOf(tx, b.id)).toEqual({ at: null, text: null });
      const [ev] = await typed(tx, b.id, "photo.hidden");
      expect(ev).toMatchObject({ actorId: admin.id, payload: { photoId: photos[0].id, reason: "Not the item", slot: expect.any(String), position: 0, previousLead: photos[0].id } });
      expect(ev.processedAt).toEqual(NOW);
      // Again: nothing more is written.
      await hidePhoto(tx, as(admin.id, "admin"), { photoId: photos[0].id, reason: "Not the item", now: NOW });
      expect(await typed(tx, b.id, "photo.hidden")).toHaveLength(1);
    });
  });
  it("an admin hides a live photo on a drawn break, under allowPhotoModeration (ruling 10)", async () => {
    await withTx(async (tx) => {
      const { b, top, photos } = await claimedBreak(tx, 3, ["top", null, null]);
      const admin = await makeUser(tx, { role: "admin" });
      await setStatus(tx, b.id, "drawn"); // frozen: without the moderation flag the guard refuses the update
      expect(await hidePhoto(tx, as(admin.id, "admin"), { photoId: photos[0].id, reason: "Personal data", now: NOW })).toEqual({ prefix: photos[0].prefix, from: "photos" });
      const [row] = await tx.select().from(breakPhotos).where(sql`${breakPhotos.id} = ${photos[0].id}`);
      // Moderation only takes things down: the tag and the alt text stay as promised.
      expect(row).toMatchObject({ hiddenAt: NOW, bucket: "photo-archive", path: photos[0].prefix, prizeSlot: top, alt: "Darts", removedAt: null });
      expect(await positions(tx, b.id)).toEqual([[photos[1].id, 0], [photos[2].id, 1]]); // the lead stays at position 0
      expect((await typed(tx, b.id, "photo.hidden")).map((e) => e.actorId)).toEqual([admin.id]);
      expect(await noticeOf(tx, b.id)).toEqual({ at: null, text: null });
    });
  });
  it("works after the draw, by SYSTEM, on a removed photo too", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 2);
      await removePhoto(tx, as(host.id), { photoId: photos[0].id, now: NOW });
      await setStatus(tx, b.id, "drawn");
      expect(await hidePhoto(tx, SYSTEM, { photoId: photos[0].id, reason: "Report 12", now: NOW })).toEqual({ prefix: photos[0].prefix, from: "photo-archive" });
      expect((await typed(tx, b.id, "photo.hidden"))[0].payload).toMatchObject({ position: null });
    });
  });
});

describe("markPhotoNoticeSeen", () => {
  const seen = async (tx: Tx, userId: string, breakId: string) =>
    (await tx.select().from(photoNoticesSeen).where(sql`${photoNoticesSeen.userId} = ${userId} and ${photoNoticesSeen.breakId} = ${breakId}`))[0]?.seenAt ?? null;
  it("records a holder's view once per change", async () => {
    await withTx(async (tx) => {
      const { host, buyer, b, photos } = await claimedBreak(tx, 2);
      await markPhotoNoticeSeen(tx, as(buyer.id, "member"), { breakId: b.id, now: NOW }); // no change yet
      expect(await seen(tx, buyer.id, b.id)).toBeNull();
      await removePhoto(tx, as(host.id), { photoId: photos[1].id, now: NOW });
      await markPhotoNoticeSeen(tx, as(buyer.id, "member"), { breakId: b.id, now: later(10) });
      await markPhotoNoticeSeen(tx, as(buyer.id, "member"), { breakId: b.id, now: later(20) }); // not older: unchanged
      expect(await seen(tx, buyer.id, b.id)).toEqual(later(10));
      await reorderPhotos(tx, as(host.id), { breakId: b.id, order: [photos[0].id], now: later(30) }); // no-op, no change
      await removePhoto(tx, as(host.id), { photoId: photos[0].id, now: later(40) });
      await markPhotoNoticeSeen(tx, as(buyer.id, "member"), { breakId: b.id, now: later(50) });
      expect(await seen(tx, buyer.id, b.id)).toEqual(later(50));
    });
  });
  it("writes nothing for anyone who holds no line in the break", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 2);
      const stranger = await makeUser(tx);
      await removePhoto(tx, as(host.id), { photoId: photos[1].id, now: NOW });
      await markPhotoNoticeSeen(tx, as(stranger.id, "member"), { breakId: b.id, now: later(10) });
      await markPhotoNoticeSeen(tx, as(host.id), { breakId: b.id, now: later(10) });
      expect(await seen(tx, stranger.id, b.id)).toBeNull();
      expect(await seen(tx, host.id, b.id)).toBeNull();
    });
  });
});
