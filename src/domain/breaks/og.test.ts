import { describe, it, expect } from "vitest";
import type { BreakPage } from "./queries";
import type { Kit } from "@/domain/flights";
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
    expect(Object.keys(m).sort()).toEqual(["caption", "cells", "columns", "heat", "hostedBy", "kit", "title"]);
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
    expect(Object.keys(m).sort()).toEqual(["caption", "cells", "columns", "heat", "hostedBy", "kit", "title"]);
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
