import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, makeBreak, openBreakWithLines, makePhoto, newPrefix } from "../../../tests/helpers/fixtures";
import { photoUploads } from "@/db/schema";
import { claimLines } from "@/domain/lines/commands";
import { deleteDraft } from "@/domain/breaks/commands";
import { NotAuthorized, UploadNotFound } from "@/domain/errors";
import { issueUploadTicket, recordProcessedPhoto } from "./commands";
import { dropUploadTicket, peekBreakStatus, peekPhoto, peekUploadTicket } from "./peek";
import { NOW, as } from "./test-helpers";

const record = (ticketId: string, breakId: string) =>
  ({ ticketId, prefix: newPrefix(breakId), location: "photos-draft" as const, width: 1600, height: 1200, slot: null, alt: "Darts", now: NOW });

describe("peekUploadTicket", () => {
  it("reads a fresh, an expired and a consumed upload without throwing", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const t = await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
      expect(await peekUploadTicket(tx, as(host.id), { ticketId: t.ticketId, now: NOW })).toEqual(
        { breakId: b.id, incomingName: t.incomingName, expired: false, consumed: false, breakStatus: "draft" });
      await tx.update(photoUploads).set({ expiresAt: new Date(NOW.getTime() - 1) }).where(eq(photoUploads.id, t.ticketId));
      expect((await peekUploadTicket(tx, as(host.id), { ticketId: t.ticketId, now: NOW })).expired).toBe(true);
      const t2 = await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
      await recordProcessedPhoto(tx, as(host.id), record(t2.ticketId, b.id));
      expect((await peekUploadTicket(tx, as(host.id), { ticketId: t2.ticketId, now: NOW })).consumed).toBe(true);
    });
  });

  it("refuses an unknown id, another host's upload, an admin on someone else's, and a banned caller", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const other = await makeUser(tx, { role: "host" });
      const admin = await makeUser(tx, { role: "admin" });
      const b = await makeBreak(tx, { hostId: host.id });
      const t = await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
      await expect(peekUploadTicket(tx, as(host.id), { ticketId: randomUUID(), now: NOW })).rejects.toBeInstanceOf(UploadNotFound);
      await expect(peekUploadTicket(tx, as(host.id), { ticketId: "not-a-uuid", now: NOW })).rejects.toBeInstanceOf(UploadNotFound);
      await expect(peekUploadTicket(tx, as(other.id, "host"), { ticketId: t.ticketId, now: NOW })).rejects.toBeInstanceOf(UploadNotFound);
      await expect(peekUploadTicket(tx, as(admin.id, "admin"), { ticketId: t.ticketId, now: NOW })).rejects.toBeInstanceOf(UploadNotFound);
      await expect(peekUploadTicket(tx, { ...as(host.id), banned: true }, { ticketId: t.ticketId, now: NOW })).rejects.toBeInstanceOf(NotAuthorized);
    });
  });
});

describe("peekPhoto", () => {
  it("reports claimed only after a claim, live until removed, and null for an unknown id", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const buyer = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id });
      const p = await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: 0 });
      expect(await peekPhoto(tx, p.id)).toEqual({ breakId: b.id, hostId: host.id, prefix: p.prefix, location: "photos", live: true, claimed: false });
      await claimLines(tx, as(buyer.id, "member"), { breakId: b.id, numbers: [1], batchId: randomUUID() });
      expect((await peekPhoto(tx, p.id))!.claimed).toBe(true);
      const gone = await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: 1, bucket: "photo-archive", removedAt: NOW });
      expect(await peekPhoto(tx, gone.id)).toMatchObject({ location: "photo-archive", live: false });
      expect(await peekPhoto(tx, randomUUID())).toBeNull();
      expect(await peekPhoto(tx, "nope")).toBeNull();
    });
  });
});

describe("peekBreakStatus", () => {
  it("reads the status, and null for a missing or deleted break", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      expect(await peekBreakStatus(tx, b.id)).toBe("draft");
      expect(await peekBreakStatus(tx, randomUUID())).toBeNull();
      await deleteDraft(tx, as(host.id, "host"), b.id);
      expect(await peekBreakStatus(tx, b.id)).toBeNull();
    });
  });
});

describe("dropUploadTicket", () => {
  it("deletes only the caller's own unconsumed upload", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const other = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const t = await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
      await dropUploadTicket(tx, as(other.id, "host"), t.ticketId);
      expect(await tx.select().from(photoUploads).where(eq(photoUploads.id, t.ticketId))).toHaveLength(1);
      await dropUploadTicket(tx, as(host.id), t.ticketId);
      expect(await tx.select().from(photoUploads).where(eq(photoUploads.id, t.ticketId))).toEqual([]);
      const used = await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
      await recordProcessedPhoto(tx, as(host.id), record(used.ticketId, b.id));
      await dropUploadTicket(tx, as(host.id), used.ticketId);
      expect(await tx.select().from(photoUploads).where(eq(photoUploads.id, used.ticketId))).toHaveLength(1);
    });
  });
});
