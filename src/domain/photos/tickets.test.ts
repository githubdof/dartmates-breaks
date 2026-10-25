import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, makeBreak, openBreakWithLines, makePhoto, makeTicket, newPrefix } from "../../../tests/helpers/fixtures";
import { breaks, breakPhotos, photoUploads, events, prizes } from "@/db/schema";
import { hitRateLimit } from "@/domain/rate-limit";
import { NotAuthorized, NotOpen, notOpenMessage, PhotosNotReady, UploadExpired, UploadNotFound, UploadUsed } from "@/domain/errors";
import type { Caller } from "@/domain/types";
import { rateBucket } from "./types";
import { issueUploadTicket, recordProcessedPhoto } from "./commands";

const NOW = new Date("2026-10-21T10:50:00Z");
const as = (id: string, role: Caller["role"] = "host"): Caller => ({ id, role, onboarded: true, banned: false });
const later = (s: number) => new Date(NOW.getTime() + s * 1000);
const setStatus = (tx: Tx, id: string, status: string) => tx.update(breaks).set({ status }).where(sql`${breaks.id} = ${id}`);
const live = async (tx: Tx, breakId: string) => (await tx.select().from(breakPhotos)
  .where(sql`${breakPhotos.breakId} = ${breakId} and ${breakPhotos.removedAt} is null and ${breakPhotos.hiddenAt} is null`)
  .orderBy(breakPhotos.position));
const fill = async (tx: Tx, bucket: string, n: number, windowSeconds: number) => {
  for (let i = 0; i < n; i++) await hitRateLimit(tx, { bucket, limit: n, windowSeconds, now: NOW });
};
const rec = (ticketId: string, breakId: string, o: Partial<Parameters<typeof recordProcessedPhoto>[2]> = {}) =>
  ({ ticketId, prefix: newPrefix(breakId), width: 1600, height: 1200, slot: null, alt: "Darts", location: "photos" as const, now: NOW, ...o });
/** Asserts both the class and the exact copy of a refusal (ruling 23). */
async function refusedWith(p: Promise<unknown>, cls: new (...args: never[]) => Error, message: string): Promise<void> {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(cls);
  expect((e as Error).message).toBe(message);
}

describe("issueUploadTicket", () => {
  it("writes a 5-minute ticket for the caller under the break", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const t = await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
      expect(t.incomingName).toBe(`${b.id}/${t.ticketId}`);
      const [row] = await tx.select().from(photoUploads).where(sql`${photoUploads.id} = ${t.ticketId}`);
      expect(row).toMatchObject({ hostId: host.id, breakId: b.id, expiresAt: later(300), consumedAt: null });
    });
  });
  it("is for the break's host or an admin", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const other = await makeUser(tx, { role: "host" });
      const admin = await makeUser(tx, { role: "admin" });
      const b = await makeBreak(tx, { hostId: host.id });
      await expect(issueUploadTicket(tx, as(other.id), { breakId: b.id, now: NOW })).rejects.toBeInstanceOf(NotAuthorized);
      await expect(issueUploadTicket(tx, { ...as(host.id), banned: true }, { breakId: b.id, now: NOW })).rejects.toThrow(/suspended/);
      const t = await issueUploadTicket(tx, as(admin.id, "admin"), { breakId: b.id, now: NOW });
      const [row] = await tx.select().from(photoUploads).where(sql`${photoUploads.id} = ${t.ticketId}`);
      expect(row.hostId).toBe(admin.id);
    });
  });
  it("works for a draft, an open and a filled break, and refuses every later status", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      for (const status of ["draft", "open", "filled"]) {
        const b = await makeBreak(tx, { hostId: host.id, status });
        await expect(issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW })).resolves.toBeTruthy();
      }
      for (const status of ["drawing", "drawn", "cancelled"]) {
        // Built as a draft, then moved on: the items guard refuses makeBreak's item insert on a frozen break.
        const b = await makeBreak(tx, { hostId: host.id });
        await setStatus(tx, b.id, status);
        const p = issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
        await expect(p).rejects.toBeInstanceOf(NotOpen);
        await expect(issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW })).rejects.toThrow(notOpenMessage(status));
      }
    });
  });
  it("refuses a mini", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id, kind: "mini" });
      await expect(issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW })).rejects.toThrow("A mini shows its parent break's photos.");
    });
  });
  it("counts live photos and unexpired unconsumed tickets against the 8, nothing else (spec §5.2)", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id });
      for (let i = 0; i < 6; i++) await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: i });
      await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: 6, removedAt: NOW, bucket: "photo-archive" });
      await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: 7, hiddenAt: NOW, bucket: "photo-archive" });
      await makeTicket(tx, { hostId: host.id, breakId: b.id, expiresAt: later(60), consumedAt: NOW });
      await makeTicket(tx, { hostId: host.id, breakId: b.id, expiresAt: NOW }); // expired: expires_at <= now
      await makeTicket(tx, { hostId: host.id, breakId: b.id, expiresAt: later(60) }); // live: 6 + 1 = 7
      await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW }); // 8
      await expect(issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW })).rejects.toThrow("A break can have up to 8 photos.");
    });
  });
  it("allows at most 8 unconsumed, unexpired tickets per caller across breaks", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const a = await makeBreak(tx, { hostId: host.id });
      const c = await makeBreak(tx, { hostId: host.id });
      await makeTicket(tx, { hostId: host.id, breakId: a.id, expiresAt: NOW }); // expired, not counted
      for (let i = 0; i < 5; i++) await issueUploadTicket(tx, as(host.id), { breakId: a.id, now: NOW });
      for (let i = 0; i < 3; i++) await issueUploadTicket(tx, as(host.id), { breakId: c.id, now: NOW });
      await expect(issueUploadTicket(tx, as(host.id), { breakId: c.id, now: NOW })).rejects.toThrow("Wait for the photos already uploading to finish.");
      // The 5-minute window passing frees them (Review Focus 3).
      await expect(issueUploadTicket(tx, as(host.id), { breakId: c.id, now: later(300) })).resolves.toBeTruthy();
    });
  });
  it("allows 30 an hour and 100 a day per caller, with the wait in the message", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      await fill(tx, rateBucket("issue", "hour", host.id), 30, 3600);
      // NOW is 10:50 UTC: the hour window ends at 11:00.
      await expect(issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW })).rejects.toThrow("Too many photos for now. Try again in 10 minutes.");
      const other = await makeUser(tx, { role: "host" });
      const ob = await makeBreak(tx, { hostId: other.id });
      await fill(tx, rateBucket("issue", "day", other.id), 100, 86_400);
      // The day window ends at midnight UTC, 13 h 10 min after NOW.
      await expect(issueUploadTicket(tx, as(other.id), { breakId: ob.id, now: NOW })).rejects.toThrow("Too many photos for now. Try again in 14 hours.");
    });
  });
});

describe("recordProcessedPhoto", () => {
  it("consumes the ticket, adds the photo at the next position and logs one processed event", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const slot = (await tx.select({ s: prizes.slotKey }).from(prizes).where(sql`${prizes.breakId} = ${b.id}`))[0].s;
      const t1 = await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
      const t2 = await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
      const r1 = await recordProcessedPhoto(tx, as(host.id), rec(t1.ticketId, b.id, { location: "photos-draft", slot, alt: "  Chronos front  " }));
      const r2 = await recordProcessedPhoto(tx, as(host.id), rec(t2.ticketId, b.id, { location: "photos-draft" }));
      expect(r1.location).toBe("photos-draft");
      expect((await live(tx, b.id)).map((p) => [p.id, p.position, p.prizeSlot, p.alt, p.bucket])).toEqual([
        [r1.photoId, 0, slot, "Chronos front", "photos-draft"], [r2.photoId, 1, null, "Darts", "photos-draft"],
      ]);
      const [ticket] = await tx.select().from(photoUploads).where(sql`${photoUploads.id} = ${t1.ticketId}`);
      expect(ticket.consumedAt).toEqual(NOW);
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${b.id} and ${events.type} = 'photo.added'`);
      expect(evs).toHaveLength(2);
      expect(evs.every((e) => e.processedAt?.getTime() === NOW.getTime())).toBe(true);
      expect(evs.map((e) => e.payload)).toContainEqual({ photoId: r1.photoId, position: 0, slot, location: "photos-draft" });
    });
  });
  it("an add never sets the notice, even after the first claim", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await tx.update(breaks).set({ firstClaimedAt: NOW }).where(sql`${breaks.id} = ${b.id}`);
      const t = await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
      expect((await recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id))).location).toBe("photos");
      const [row] = await tx.select().from(breaks).where(sql`${breaks.id} = ${b.id}`);
      expect(row).toMatchObject({ photosUpdatedAt: null, photosUpdatedNote: null });
    });
  });
  it("refuses an unknown ticket and another caller's (UploadNotFound), an expired one (UploadExpired) and a used one (UploadUsed), and adds nothing", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const admin = await makeUser(tx, { role: "admin" });
      const b = await openBreakWithLines(tx, { hostId: host.id });
      const t = await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
      // Another caller, even an admin, cannot finalise a host's ticket; the reply does not say it exists.
      await refusedWith(recordProcessedPhoto(tx, as(admin.id, "admin"), rec(t.ticketId, b.id)), UploadNotFound, "This upload could not be found. Try again.");
      await refusedWith(recordProcessedPhoto(tx, as(host.id), rec("55555555-5555-4555-8555-555555555555", b.id)), UploadNotFound, "This upload could not be found. Try again.");
      // Past 5 minutes (expired when now >= expires_at).
      await refusedWith(recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id, { now: later(300) })), UploadExpired, "This upload took too long. Try again.");
      expect(await live(tx, b.id)).toHaveLength(0);
      // One second earlier is still in time.
      await recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id, { now: later(299) }));
      await refusedWith(recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id)), UploadUsed, "This upload was already used. Try again.");
      expect(await live(tx, b.id)).toHaveLength(1);
    });
  });
  it("refuses variants written for the other state of the break with PhotosNotReady (ruling 7), and re-checks status", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const t = await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
      // A draft's photo written to the public bucket.
      await refusedWith(recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id, { location: "photos" })), PhotosNotReady, "Photos are still being prepared. Try again.");
      await setStatus(tx, b.id, "open"); // opened while the photo was processing (Task 6 wrote to photos-draft)
      await refusedWith(recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id, { location: "photos-draft" })), PhotosNotReady, "Photos are still being prepared. Try again.");
      // The ticket stays unconsumed, so Task 6's one retry (after copying to `photos`) can use it.
      const [ticket] = await tx.select().from(photoUploads).where(sql`${photoUploads.id} = ${t.ticketId}`);
      expect(ticket.consumedAt).toBeNull();
      await setStatus(tx, b.id, "drawing");
      await refusedWith(recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id)), NotOpen, notOpenMessage("drawing"));
      expect(await live(tx, b.id)).toHaveLength(0);
    });
  });
  it("refuses a prefix outside the break, a bad size, an unknown slot and alt text out of 1–120", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id });
      const elsewhere = await makeBreak(tx, { hostId: host.id });
      const t = await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
      const cases: [Partial<Parameters<typeof recordProcessedPhoto>[2]>, string][] = [
        [{ prefix: newPrefix(elsewhere.id) }, "Bad photo path"],
        [{ prefix: `${b.id}/../x` }, "Bad photo path"],
        [{ width: 0 }, "Bad photo size"], [{ height: 1601 }, "Bad photo size"], [{ width: 1.5 }, "Bad photo size"],
        [{ slot: (await tx.select({ s: prizes.slotKey }).from(prizes).where(sql`${prizes.breakId} = ${elsewhere.id}`))[0].s }, "Pick one of this break's prizes, or no tag."],
        [{ alt: "   " }, "Describe the photo in 1 to 120 characters."], [{ alt: "x".repeat(121) }, "Describe the photo in 1 to 120 characters."],
      ];
      for (const [o, msg] of cases) await expect(recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id, o)), msg).rejects.toThrow(msg);
      await expect(recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id, { alt: "x".repeat(120) }))).resolves.toBeTruthy();
    });
  });
  it("re-checks the cap on live rows", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id });
      for (let i = 0; i < 8; i++) await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: i });
      const t = await makeTicket(tx, { hostId: host.id, breakId: b.id, expiresAt: later(60) }); // bypasses the issue check
      await expect(recordProcessedPhoto(tx, as(host.id), rec(t.id, b.id))).rejects.toThrow("A break can have up to 8 photos.");
    });
  });
  it("has its own rate limit", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id });
      const t = await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
      await fill(tx, rateBucket("record", "hour", host.id), 30, 3600);
      await expect(recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id))).rejects.toThrow("Too many photos for now. Try again in 10 minutes.");
    });
  });
});
