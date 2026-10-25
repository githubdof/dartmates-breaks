import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { BreakPhotos } from "@/domain/photos/queries";
import { placeRows } from "@/components/photos/prizes-model";
import { createMemoryStorage } from "../../tests/helpers/memory-storage";
import type { Caller } from "@/domain/types";
import { pagePhotos, type PhotoAudience } from "./page-photos";
import { holderSet, photoAudience, photoViewer } from "./viewer";

const id = randomUUID();
const prefix = (c: string) => `${id}/${c.repeat(22)}`;
const storage = createMemoryStorage();
const rows = placeRows(
  [{ rank: 1, itemId: "i1", slotKey: "A" }],
  [{ id: "i1", name: "Taylor Chronos 24g", condition: "new_in_box", variantSchema: null }],
);
const live = (c: string, slot: string | null, position: number, location: "photos" | "photos-draft" = "photos") =>
  ({ id: c, position, slot, alt: `Alt ${c}`, width: 1600, height: 1200, location, prefix: prefix(c) });
const withRemoved: BreakPhotos = {
  live: [live("L", "A", 0), live("U", null, 1)],
  removed: [{ id: "R", slot: null, alt: "Old lead", width: 1600, height: 1200, removedAt: new Date("2026-10-21T15:05:00Z"), location: "photo-archive", prefix: prefix("R") }],
  notice: { text: "Lead photo replaced", at: new Date("2026-10-21T15:05:00Z") },
  unseen: true,
};

describe("pagePhotos (the page's audience gate)", () => {
  it("a stranger never gets removed photos or a signed URL, even if breakPhotos returned them", async () => {
    const p = await pagePhotos(storage, withRemoved, rows, { audience: "other", tz: "America/New_York" });
    expect(p.removed).toEqual([]);
    expect(JSON.stringify(p)).not.toMatch(/seconds=|token=|photo-archive|photos-draft/);
    expect(p.updated).toBe(false);
    expect(p.unseen).toBe(false);
  });
  it("a stranger never gets a photo still in the draft bucket, even if breakPhotos returned it", async () => {
    const draft = { ...withRemoved, live: [live("L", "A", 0), live("D", null, 1, "photos-draft")] };
    for (const audience of ["other", "holder"] as const) {
      const p = await pagePhotos(storage, draft, rows, { audience, tz: "UTC" });
      expect(p.count).toBe(1);
      expect(JSON.stringify(p)).not.toMatch(/photos-draft|seconds=\d+.*photos-draft/);
      expect(JSON.stringify(p)).not.toContain(prefix("D"));
    }
  });
  it("a holder gets them with a signed URL and the local-date fallback 'Oct 21'", async () => {
    const p = await pagePhotos(storage, withRemoved, rows, { audience: "holder", tz: "America/New_York" });
    expect(p.removed).toHaveLength(1);
    expect(p.removed[0]).toMatchObject({ id: "R", removedIso: "2026-10-21T15:05:00.000Z", removedFallback: "Oct 21" });
    expect(p.removed[0].photo!.src).toMatch(/seconds=600/);
  });
  it("the host gets removed photos too; a removed photo the archive dropped has no image", async () => {
    const gone = { ...withRemoved, removed: [{ ...withRemoved.removed[0], prefix: null }] };
    const p = await pagePhotos(storage, gone, rows, { audience: "host", tz: "America/New_York" });
    expect(p.removed[0].photo).toBeNull();
  });
  it("'updated' needs a holder, a notice and unseen", async () => {
    const at = (audience: PhotoAudience, o: Partial<BreakPhotos> = {}) => pagePhotos(storage, { ...withRemoved, ...o }, rows, { audience, tz: "UTC" });
    expect((await at("host")).updated).toBe(false);
    expect((await at("holder", { unseen: false })).updated).toBe(false);
    expect((await at("holder", { notice: null })).updated).toBe(false);
    expect((await at("holder")).updated).toBe(true);
    expect((await at("holder")).unseen).toBe(true);
  });
  it("the notice reaches every audience with its time and fallback", async () => {
    for (const audience of ["holder", "host", "other"] as const)
      expect((await pagePhotos(storage, withRemoved, rows, { audience, tz: "America/New_York" })).notice)
        .toEqual({ text: "Lead photo replaced", iso: "2026-10-21T15:05:00.000Z", fallback: "Oct 21, 2026 at 11:05 am" });
  });
  it("count, lead and viewer follow live order; the lead is the 160 variant, viewer photos the 1600", async () => {
    const p = await pagePhotos(storage, withRemoved, rows, { audience: "other", tz: "UTC" });
    expect(p.count).toBe(2);
    expect(p.lead!.src).toMatch(/-160\.webp$/);
    expect(p.viewer.map((v) => v.src)).toEqual([expect.stringMatching(/L+-1600\.webp$/), expect.stringMatching(/U+-1600\.webp$/)]);
  });
  it("the last photo removed: count 0, no lead, no viewer photos, the removal sentence kept", async () => {
    const last = { ...withRemoved, live: [], notice: { text: "Top-spot photo removed", at: new Date("2026-10-21T15:05:00Z") } };
    const p = await pagePhotos(storage, last, rows, { audience: "holder", tz: "UTC" });
    expect(p).toMatchObject({ count: 0, lead: null, viewer: [], untagged: [] });
    expect(p.notice!.text).toBe("Top-spot photo removed");
    expect(p.removed).toHaveLength(1);
  });
  it("the viewer's caption is the tagged place word and item name; untagged photos have none", async () => {
    const p = await pagePhotos(storage, withRemoved, rows, { audience: "other", tz: "UTC" });
    expect(p.viewer.map((v) => v.caption)).toEqual(["Top spot: Taylor Chronos 24g", null]);
  });
});

describe("pagePhotos when Storage cannot sign (I5)", () => {
  // A memory store whose signing always rejects, as a Storage outage or a timeout would.
  const failing = () => ({ ...createMemoryStorage(), signedReadUrl: () => Promise.reject(new Error("signing down")) });
  const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});

  it("a removed photo whose signing fails keeps its Removed mark with no image; the page still renders", async () => {
    const spy = quiet();
    try {
      for (const audience of ["holder", "host"] as const) {
        const p = await pagePhotos(failing(), withRemoved, rows, { audience, tz: "UTC" });
        expect(p.removed).toHaveLength(1);
        expect(p.removed[0]).toMatchObject({ id: "R", photo: null, removedFallback: "Oct 21" });
        expect(p.count).toBe(2); // the public photos need no signing
      }
      expect(spy).toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });
  it("the host's draft photo whose signing fails drops out; the public ones stay in order", async () => {
    const spy = quiet();
    try {
      const draft = { ...withRemoved, live: [live("L", "A", 0), live("D", null, 1, "photos-draft"), live("U", null, 2)] };
      const p = await pagePhotos(failing(), draft, rows, { audience: "host", tz: "UTC" });
      expect(p.count).toBe(2);
      expect(p.viewer.map((v) => v.alt)).toEqual(["Alt L", "Alt U"]);
      expect(p.untagged.map((u) => u.id)).toEqual(["U"]);
      expect(JSON.stringify(p)).not.toContain(prefix("D"));
    } finally { spy.mockRestore(); }
  });
});

describe("the result page's audience (Task 9; spec §8.4)", () => {
  const HOST: Caller = { id: "00000000-0000-4000-8000-0000000000a1", role: "host", onboarded: true, banned: false };
  const HOLDER: Caller = { id: "00000000-0000-4000-8000-0000000000a2", role: "member", onboarded: true, banned: false };
  const STRANGER: Caller = { id: "00000000-0000-4000-8000-0000000000a3", role: "member", onboarded: true, banned: false };
  // The distinct owners of the drawn break's entries (a holder with two lines appears twice).
  const ctx = { hostId: HOST.id, holderIds: holderSet([HOLDER.id, HOLDER.id, null]) };
  const tz = "America/New_York";

  it("holderSet keeps distinct owners and drops unowned lines", () => {
    expect([...ctx.holderIds]).toEqual([HOLDER.id]);
  });
  it("maps viewers to audiences: host, holder, everyone else", () => {
    expect(photoAudience(photoViewer(HOST, ctx))).toBe("host");
    expect(photoAudience(photoViewer(HOLDER, ctx))).toBe("holder");
    expect(photoAudience(photoViewer(STRANGER, ctx))).toBe("other");
    expect(photoAudience(photoViewer(null, ctx))).toBe("other");
  });
  it("a holder of the drawn break sees the removed photo, dated, through a signed URL", async () => {
    const p = await pagePhotos(storage, withRemoved, rows, { audience: photoAudience(photoViewer(HOLDER, ctx)), tz });
    expect(p.removed).toHaveLength(1);
    expect(p.removed[0].removedFallback).toBe("Oct 21");
    expect(p.removed[0].photo!.src).toContain("seconds=600");
    expect(p.count).toBe(2);
  });
  it("a stranger, signed in or not, sees the live photos and nothing removed", async () => {
    for (const caller of [STRANGER, null]) {
      const p = await pagePhotos(storage, withRemoved, rows, { audience: photoAudience(photoViewer(caller, ctx)), tz });
      expect(p.removed).toEqual([]);
      expect(p.count).toBe(2);
      expect(p.viewer).toHaveLength(2);
      expect(JSON.stringify(p)).not.toMatch(/seconds=|photo-archive|Removed/);
    }
  });
});
