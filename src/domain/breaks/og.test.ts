import { describe, it, expect } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { getBreakPage, type BreakPage } from "./queries";
import type { Kit } from "@/domain/flights";
import type { Tx } from "@/db/client";
import { claimLines } from "@/domain/lines/commands";
import { hidePhoto, issueUploadTicket, recordProcessedPhoto, removePhoto } from "@/domain/photos/commands";
import { leadPhotos } from "@/domain/photos/queries";
import type { PhotoLocation } from "@/domain/photos/types";
import { SYSTEM, type Caller } from "@/domain/types";
import { withTx } from "../../../tests/helpers/db";
import { makeBreak, makeUser, openBreakWithLines } from "../../../tests/helpers/fixtures";
import { ogCaption, ogHostedBy, ogModel } from "./og";

const HOST = "00000000-0000-4000-8000-0000000000a1";
const ALICE = "00000000-0000-4000-8000-0000000000a2";
const now = new Date("2026-10-14T16:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

type L = BreakPage["lines"][number];
const open = (number: number): L => ({ number, ownerId: null, ownerHandle: null, ownerFlightColour: null, ownerFlightShape: null, claimedAt: null, sentAt: null, paidAt: null, priceCents: null, reservedForMiniId: null, isBonus: false });
const alice = (number: number, o: Partial<L> = {}): L => ({ ...open(number), ownerId: ALICE, ownerHandle: "alice", ownerFlightColour: "pink", ownerFlightShape: "slim", claimedAt: hoursAgo(1), priceCents: 500, ...o });

function page(lines: L[], b: Partial<BreakPage["break"]> = {}, kit: Kit = { dark: "blue", light: "yellow" }): BreakPage {
  return {
    break: {
      id: "00000000-0000-4000-8000-0000000000b1", hostId: HOST, kind: "main", title: "Taylor Chronos", description: "", lineCount: 6, linePriceCents: 500,
      allowRandomClaims: true, claimMode: "pick_or_random", paymentWindowHours: 24, maxLinesPerUser: null, entryRule: null, paymentInstructions: "",
      onePrizePerPerson: false, miniTimeoutAutoAssign: true, threadClosedAt: null, status: "open", seedCommitment: "ab".repeat(32),
      openedAt: hoursAgo(48), filledAt: null, cancelReason: null, relistedFromId: null,
      firstClaimedAt: null, photosUpdatedAt: null, photosUpdatedNote: null, deletedAt: null, createdAt: hoursAgo(49), ...b,
    },
    host: { id: HOST, handle: "jim", displayName: "Jim", paymentHandles: { venmo: "@Jim-R" }, kit },
    items: [], prizes: [], lines,
  };
}

// 1 open; 2 alice sent; 3 alice overdue (claimed 30 h ago, unsent); 4 alice paid; 5 and 6 open; 7 alice's bonus line.
const lines: L[] = [
  open(1), alice(2, { sentAt: hoursAgo(0.5) }), alice(3, { claimedAt: hoursAgo(30) }), alice(4, { paidAt: hoursAgo(2) }),
  open(5), open(6), alice(7, { paidAt: hoursAgo(1), isBonus: true, priceCents: 0 }),
];

describe("ogModel (Review Focus 4)", () => {
  it("draws the grid as an anonymous viewer sees it: tones only, no holder, no bonus lines", () => {
    const m = ogModel(page(lines), now)!;
    expect(m).toEqual({
      title: "Taylor Chronos",
      caption: "3 to go, $5 a line",
      hostedBy: "Hosted by @jim",
      columns: 4,
      kit: { dark: "blue", light: "yellow" },
      heat: 2,
      cells: [
        { number: 1, tone: "open" }, { number: 2, tone: "taken" }, { number: 3, tone: "taken" },
        { number: 4, tone: "paid" }, { number: 5, tone: "open" }, { number: 6, tone: "open" },
      ],
      photo: null,
    });
    const text = JSON.stringify(m);
    expect(text).not.toContain("alice");
    expect(text).not.toContain(ALICE);
    expect(text).not.toContain("Jim-R");
    expect(m.cells.every((c) => Object.keys(c).sort().join() === "number,tone")).toBe(true);
  });
  it("is null for a draft, whoever asks", () => {
    expect(ogModel(page([], { status: "draft" }), now)).toBeNull();
  });
  it("has no flight key (Review Focus 1)", () => {
    // A full BreakPage, flights and handles included, goes in: the model is rebuilt from line state only.
    const m = ogModel(page(lines, {}, { dark: "petrol", light: "orange" }), now)!;
    expect(Object.keys(m).sort()).toEqual(["caption", "cells", "columns", "heat", "hostedBy", "kit", "photo", "title"]);
    expect(m.kit).toEqual({ dark: "petrol", light: "orange" });
    expect(m.cells.every((c) => Object.keys(c).every((k) => ["number", "tone", "place"].includes(k)))).toBe(true);
    const text = JSON.stringify(m);
    for (const s of ["alice", ALICE, "pink", "slim", "flight", "holder", "Jim-R"]) expect(text, s).not.toContain(s);
  });
  it("marks the won places on a ran break, and only there", () => {
    const paid = [1, 2, 3, 4, 5, 6].map((n) => alice(n, { paidAt: hoursAgo(3) }));
    const places = [{ number: 4, place: 1 as const }, { number: 2, place: 2 as const }, { number: 5, place: 3 as const }];
    const ran = ogModel({ ...page(paid, { status: "drawn" }), places }, now)!;
    expect(ran.cells.filter((c) => c.tone === "won")).toEqual([{ number: 2, tone: "won", place: 2 }, { number: 4, tone: "won", place: 1 }, { number: 5, tone: "won", place: 3 }]);
    expect(ran.heat).toBe(4);
    const notRan = ogModel({ ...page(paid, { status: "filled" }), places }, now)!;
    expect(notRan.cells.some((c) => c.tone === "won")).toBe(false);
  });
  it("shortens a long title", () => {
    const m = ogModel(page(lines, { title: "x".repeat(120) }), now)!;
    expect(m.title).toHaveLength(80);
    expect(m.title.endsWith("…")).toBe(true);
  });
});

describe("ogCaption (§6: the count everywhere is N to go)", () => {
  it("speaks the community's state words", () => {
    expect(ogCaption("open", 12, 500)).toBe("12 to go, $5 a line");
    expect(ogCaption("open", 3, 550)).toBe("3 to go, $5.50 a line");
    expect(ogCaption("filled", 0, 500)).toBe("Closed. Every line is paid.");
    expect(ogCaption("drawing", 0, 500)).toBe("Running draw");
    expect(ogCaption("drawn", 0, 500, new Date("2026-10-14T16:00:00Z"))).toBe("Ran Oct 14. Anyone can check the draw.");
    expect(ogCaption("drawn", 0, 500, null)).toBe("Ran. Anyone can check the draw.");
    expect(ogCaption("cancelled", 0, 500)).toBe("Cancelled");
  });
  it("names the host by handle, else by name", () => {
    expect(ogHostedBy({ handle: "jim", displayName: "Jim" })).toBe("Hosted by @jim");
    expect(ogHostedBy({ handle: null, displayName: "Jim" })).toBe("Hosted by Jim");
    expect(ogHostedBy({ handle: null, displayName: null })).toBe("Hosted by the host");
  });
});

describe("the preview after the draw (§6: the bulls on the kit board)", () => {
  const ran = () => page(lines, { status: "drawn" });
  const ranAt = new Date("2026-10-14T16:00:00Z");
  it("marks the won places on their cells, as many as there are prizes, and says when it ran", () => {
    // placesOf([4, 2, 3, 1, 5, 6], [1, 2]) (Task 6): the top spot on line 4, 2nd on line 2.
    const m = ogModel({ ...ran(), places: [{ number: 4, place: 1 }, { number: 2, place: 2 }] }, now, { ranAt })!;
    expect(m.cells.filter((c) => c.tone === "won")).toEqual([{ number: 2, tone: "won", place: 2 }, { number: 4, tone: "won", place: 1 }]);
    expect(m.caption).toBe("Ran Oct 14. Anyone can check the draw.");
  });
  it("leaves a won bonus line out with the rest of the bonus row", () => {
    const m = ogModel({ ...ran(), places: [{ number: 7, place: 1 }, { number: 2, place: 2 }, { number: 3, place: 3 }] }, now, { ranAt })!;
    expect(m.cells.map((c) => c.number)).not.toContain(7);
    expect(m.cells.filter((c) => c.tone === "won").map((c) => [c.number, c.place])).toEqual([[2, 2], [3, 3]]);
  });
  it("carries only what a stranger may see: the keys of the model and of every cell", () => {
    const m = ogModel({ ...ran(), places: [{ number: 4, place: 1 }, { number: 2, place: 2 }, { number: 3, place: 3 }] }, now, { ranAt })!;
    expect(Object.keys(m).sort()).toEqual(["caption", "cells", "columns", "heat", "hostedBy", "kit", "photo", "title"]);
    for (const c of m.cells) expect(Object.keys(c).every((k) => ["number", "tone", "place"].includes(k))).toBe(true);
    const text = JSON.stringify(m);
    expect(text).not.toContain("alice");
    expect(text).not.toContain(ALICE);
    expect(ogModel(page(lines), now)!.cells.every((c) => c.place === undefined)).toBe(true);
  });
});

describe("the model per status and kit (recorded ruling 25: the JSON, not PNG bytes)", () => {
  const six = (f: (n: number) => L) => [1, 2, 3, 4, 5, 6].map(f);
  for (const kit of [{ dark: "blue", light: "yellow" }, { dark: "plum", light: "lime" }] as Kit[]) {
    it(`open at 0 % and 50 %, closed, running and ran, in the ${kit.dark} with ${kit.light} kit`, () => {
      const empty = ogModel(page(six(open), {}, kit), now)!;
      expect(empty).toMatchObject({ caption: "6 to go, $5 a line", hostedBy: "Hosted by @jim", kit, heat: 0 });
      expect(empty.cells.every((c) => c.tone === "open")).toBe(true);
      const half = ogModel(page(six((n) => (n <= 3 ? alice(n) : open(n))), {}, kit), now)!;
      expect(half).toMatchObject({ caption: "3 to go, $5 a line", kit, heat: 2 });
      expect(half.cells.map((c) => c.tone)).toEqual(["taken", "taken", "taken", "open", "open", "open"]);
      const paid = six((n) => alice(n, { paidAt: hoursAgo(3) }));
      expect(ogModel(page(paid, { status: "filled" }, kit), now)).toMatchObject({ caption: "Closed. Every line is paid.", kit, heat: 4 });
      expect(ogModel(page(paid, { status: "drawing" }, kit), now)).toMatchObject({ caption: "Running draw", kit, heat: 4 });
      const ran = ogModel({ ...page(paid, { status: "drawn" }, kit), places: [{ number: 5, place: 1 }] }, now, { ranAt: new Date("2026-10-14T16:00:00Z") })!;
      expect(ran).toMatchObject({ caption: "Ran Oct 14. Anyone can check the draw.", kit, heat: 4 });
      expect(ran.cells.filter((c) => c.tone === "won")).toEqual([{ number: 5, tone: "won", place: 1 }]);
      for (const m of [empty, half, ran]) expect(JSON.stringify(m)).not.toMatch(/alice|pink|slim|flight/);
    });
  }
});


describe("the lead photo (photos spec §8.4)", () => {
  const P = "00000000-0000-4000-8000-0000000000b1/AAAAAAAAAAAAAAAAAAAAAA";
  const lead = (location: PhotoLocation) => ({ id: "00000000-0000-4000-8000-0000000000c1", prefix: P, location });
  it("carries a published lead as its id and prefix only", () => {
    const m = ogModel({ ...page(lines), lead: lead("photos") }, now)!;
    expect(m.photo).toEqual({ id: "00000000-0000-4000-8000-0000000000c1", prefix: P });
    expect(Object.keys(m.photo!).sort()).toEqual(["id", "prefix"]);
  });
  it("is null for a draft or an archived location, and with no lead", () => {
    expect(ogModel({ ...page(lines), lead: lead("photos-draft") }, now)!.photo).toBeNull();
    expect(ogModel({ ...page(lines), lead: lead("photo-archive") }, now)!.photo).toBeNull();
    expect(ogModel({ ...page(lines), lead: null }, now)!.photo).toBeNull();
    expect(ogModel(page(lines), now)!.photo).toBeNull();
  });
  // Regression pin: true before this task; the photo must not bring a holder, handle or flight in.
  it("still has no holder, handle or flight anywhere, photo or not", () => {
    const text = JSON.stringify(ogModel({ ...page(lines), lead: lead("photos") }, now));
    expect(text).not.toMatch(/alice|pink|slim|flight|holder|owner|handle/);
    expect(text).not.toContain(ALICE);
  });
});

const as = (id: string, role: Caller["role"] = "host"): Caller => ({ id, role, onboarded: true, banned: false });
/** A recorded photo (rows only): `photos` for an open break, `photos-draft` for a draft (ruling 7). */
async function addPhoto(tx: Tx, host: { id: string }, breakId: string, location: "photos" | "photos-draft"): Promise<{ photoId: string }> {
  const { ticketId } = await issueUploadTicket(tx, as(host.id), { breakId, now });
  const prefix = `${breakId}/${randomBytes(16).toString("base64url")}`;
  const { photoId } = await recordProcessedPhoto(tx, as(host.id), { ticketId, prefix, location, width: 1600, height: 1200, slot: null, alt: "Darts", now });
  return { photoId };
}
const preview = async (tx: Tx, breakId: string) =>
  ogModel({ ...(await getBreakPage(tx, breakId))!, lead: (await leadPhotos(tx, [breakId])).get(breakId) ?? null }, now);

describe("the lead photo as the preview reads it (photos spec §8.4: hidden, removed, draft)", () => {
  it("shows the live lead of an open break", async () => withTx(async (tx) => {
    const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const { photoId } = await addPhoto(tx, host, b.id, "photos");
    expect((await preview(tx, b.id))!.photo?.id).toBe(photoId);
  }));
  it("drops a hidden lead, and the next live photo leads", async () => withTx(async (tx) => {
    const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const first = await addPhoto(tx, host, b.id, "photos");
    const second = await addPhoto(tx, host, b.id, "photos");
    await hidePhoto(tx, SYSTEM, { photoId: first.photoId, reason: "test", now });
    expect((await preview(tx, b.id))!.photo?.id).toBe(second.photoId);
    await hidePhoto(tx, SYSTEM, { photoId: second.photoId, reason: "test", now });
    expect((await preview(tx, b.id))!.photo).toBeNull();
  }));
  it("drops a lead the host removed, before and after the first claim", async () => withTx(async (tx) => {
    const host = await makeUser(tx, { role: "host" });
    const buyer = await makeUser(tx);
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const early = await addPhoto(tx, host, b.id, "photos");
    expect((await removePhoto(tx, as(host.id), { photoId: early.photoId, now })).archive).toBe(false);
    expect((await preview(tx, b.id))!.photo).toBeNull();
    await claimLines(tx, as(buyer.id, "member"), { breakId: b.id, numbers: [1], batchId: randomUUID() });
    const late = await addPhoto(tx, host, b.id, "photos");
    expect((await preview(tx, b.id))!.photo?.id).toBe(late.photoId);
    expect((await removePhoto(tx, as(host.id), { photoId: late.photoId, now })).archive).toBe(true);
    expect((await preview(tx, b.id))!.photo).toBeNull();
  }));
  it("has no preview at all for a draft, whose photos are in photos-draft", async () => withTx(async (tx) => {
    const host = await makeUser(tx, { role: "host" });
    const b = await makeBreak(tx, { hostId: host.id, status: "draft" });
    await addPhoto(tx, host, b.id, "photos-draft");
    expect((await leadPhotos(tx, [b.id])).has(b.id)).toBe(false);
    expect(await preview(tx, b.id)).toBeNull();
  }));
});
