import { describe, it, expect } from "vitest";
import { shapeGrid, shownFlights, canViewBreak, allowanceFor, type GridViewer } from "./grid";
import type { Flight } from "@/domain/flights";
import type { BreakPage } from "./queries";

const HOST = "00000000-0000-4000-8000-0000000000a1";
const ALICE = "00000000-0000-4000-8000-0000000000a2";
const BOB = "00000000-0000-4000-8000-0000000000a3";
const ADMIN = "00000000-0000-4000-8000-0000000000a4";
const CAROL = "00000000-0000-4000-8000-0000000000a5";
const MINI = "00000000-0000-4000-8000-0000000000c1";
const now = new Date("2026-10-13T16:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

type L = BreakPage["lines"][number];
const open = (number: number): L => ({ number, ownerId: null, ownerHandle: null, ownerFlightColour: null, ownerFlightShape: null, claimedAt: null, sentAt: null, paidAt: null, priceCents: null, reservedForMiniId: null, isBonus: false });
/** Each holder's stored flight. */
const FLIGHT: Record<string, [string, string]> = { [ALICE]: ["pink", "slim"], [BOB]: ["blue", "kite"], [HOST]: ["plum", "pear"], [CAROL]: ["sky", "standard"] };
const held = (number: number, ownerId: string, ownerHandle: string, o: Partial<L> = {}): L =>
  ({ ...open(number), ownerId, ownerHandle, ownerFlightColour: FLIGHT[ownerId][0], ownerFlightShape: FLIGHT[ownerId][1], claimedAt: hoursAgo(1), priceCents: 500, ...o });

function page(lines: L[], b: Partial<BreakPage["break"]> = {}): BreakPage {
  return {
    break: {
      id: "00000000-0000-4000-8000-0000000000b1", hostId: HOST, kind: "main", title: "Chronos", description: "", lineCount: 6, linePriceCents: 500,
      allowRandomClaims: true, claimMode: "pick_or_random", paymentWindowHours: 24, maxLinesPerUser: null, entryRule: null, paymentInstructions: "",
      onePrizePerPerson: false, miniTimeoutAutoAssign: true, threadClosedAt: null, status: "open", seedCommitment: "ab".repeat(32),
      openedAt: hoursAgo(48), filledAt: null, cancelReason: null, relistedFromId: null, createdAt: hoursAgo(49), ...b,
    },
    host: { id: HOST, handle: "jim", displayName: "Jim", paymentHandles: {}, kit: { dark: "blue", light: "yellow" } },
    items: [], prizes: [], lines,
  };
}
const v = (id: string, role: GridViewer["role"] = "member", globalUnpaid = 0): GridViewer => ({ id, role, globalUnpaid });

// 1 open; 2 alice, claimed 30 h ago, unsent (overdue); 3 alice sent; 4 bob paid; 5 reserved for a mini; 6 open; 7 bonus, bob, paid.
const lines: L[] = [
  open(6), held(4, BOB, "bob", { paidAt: hoursAgo(2) }), open(1),
  held(2, ALICE, "alice", { claimedAt: hoursAgo(30) }), held(3, ALICE, "alice", { sentAt: hoursAgo(0.5) }),
  { ...open(5), reservedForMiniId: MINI }, held(7, BOB, "bob", { paidAt: hoursAgo(1), isBonus: true, priceCents: 0 }),
];

describe("shapeGrid", () => {
  it("orders cells, puts bonus lines after N and counts numbered lines only", () => {
    const g = shapeGrid(page(lines), null, now);
    expect(g.cells.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(g.cells.map((c) => c.state)).toEqual(["open", "taken", "sent", "paid", "reserved", "open", "paid"]);
    expect(g.cells[6].bonus).toBe(true);
    expect(g.counts).toEqual({ open: 2, taken: 1, sent: 1, paid: 1, reserved: 1, total: 6 });
  });

  it("overdue and holders are host-only", () => {
    const cell2 = (viewer: GridViewer | null) => shapeGrid(page(lines), viewer, now).cells[1];
    expect(cell2(null)).toEqual({ number: 2, state: "taken", mine: false, overdue: false, bonus: false, holder: null, flight: null });
    expect(cell2(v(CAROL))).toMatchObject({ state: "taken", overdue: false, holder: null });
    expect(shapeGrid(page(lines), v(CAROL), now).showHolders).toBe(false);
    expect(cell2(v(BOB))).toMatchObject({ state: "taken", overdue: false, holder: "alice" });
    expect(cell2(v(HOST, "host"))).toMatchObject({ state: "taken", overdue: true, holder: "alice" });
    expect(cell2(v(ADMIN, "admin"))).toMatchObject({ overdue: true, holder: "alice" });
    // A sent line is never overdue, even for the host.
    expect(shapeGrid(page(lines), v(HOST, "host"), now).cells[2].overdue).toBe(false);
  });

  it("summarises the viewer's own lines and what they owe", () => {
    const g = shapeGrid(page(lines), v(ALICE), now);
    expect(g.participant).toBe(true);
    expect(g.cells.filter((c) => c.mine).map((c) => c.number)).toEqual([2, 3]);
    expect(g.viewer).toEqual({ held: [2, 3], unsent: [2], sent: [3], paid: [], owedCents: 500, payBy: hoursAgo(6) });
    expect(shapeGrid(page(lines), null, now).viewer).toBeNull();
  });

  it("takes the tightest of the per-person, host and global caps, never below zero", () => {
    expect(shapeGrid(page(lines, { maxLinesPerUser: 3 }), v(ALICE), now).allowance).toEqual({ reason: "per_person", limit: 3, remaining: 1 });
    expect(shapeGrid(page(lines, { maxLinesPerUser: 1 }), v(ALICE), now).allowance).toEqual({ reason: "per_person", limit: 1, remaining: 0 });
    expect(shapeGrid(page(lines), v(ALICE, "member", 29), now).allowance).toEqual({ reason: "global", limit: 30, remaining: 1 });
    expect(shapeGrid(page(lines, { maxLinesPerUser: 5 }), null, now).allowance).toEqual({ reason: "per_person", limit: 5, remaining: 5 });
    const hostLines = [held(1, HOST, "jim"), held(2, HOST, "jim"), held(3, HOST, "jim"), held(4, HOST, "jim"), open(5)];
    expect(shapeGrid(page(hostLines, { lineCount: 50 }), v(HOST, "host"), now).allowance).toEqual({ reason: "host", limit: 5, remaining: 1 });
  });

  it("does not count bonus lines towards the per-person cap", () => {
    expect(allowanceFor({ maxLinesPerUser: 2, lineCount: 6, heldNumbered: 1, isHost: false, globalUnpaid: 0 })).toEqual({ reason: "per_person", limit: 2, remaining: 1 });
    expect(shapeGrid(page(lines, { maxLinesPerUser: 2 }), v(BOB), now).allowance.remaining).toBe(1);
  });
  it("an owned line keeps its owner's state even if it still carries a mini reservation", () => {
    const m = shapeGrid(page([held(1, ALICE, "alice", { reservedForMiniId: MINI, paidAt: hoursAgo(1) }), open(2)]), null, now);
    expect(m.cells[0]).toMatchObject({ number: 1, state: "paid", holder: null, overdue: false });
    expect(m.counts).toMatchObject({ paid: 1, reserved: 0, open: 1 });
  });
});

describe("canViewBreak", () => {
  it("hides drafts from everyone but their host", () => {
    expect(canViewBreak("draft", false)).toBe(false);
    expect(canViewBreak("draft", true)).toBe(true);
    expect(canViewBreak("open", false)).toBe(true);
    expect(canViewBreak("drawn", false)).toBe(true);
  });
});

const pinkSlim: Flight = { colour: "pink", shape: "slim" };
const blueKite: Flight = { colour: "blue", shape: "kite" };
const plumPear: Flight = { colour: "plum", shape: "pear" };

// Review Focus 1: an open break where alice holds a sent line (3), an overdue line (2) and a bonus line (7);
// bob holds a paid line (4); the host holds line 5 themselves.
const focus: L[] = [
  open(1), held(2, ALICE, "alice", { claimedAt: hoursAgo(30) }), held(3, ALICE, "alice", { sentAt: hoursAgo(0.5) }),
  held(4, BOB, "bob", { paidAt: hoursAgo(2) }), held(5, HOST, "jim"), open(6),
  held(7, ALICE, "alice", { paidAt: hoursAgo(1), isBonus: true, priceCents: 0 }),
];
const gate = (viewer: GridViewer | null) =>
  shapeGrid(page(focus), viewer, now).cells.map((c) => ({ n: c.number, holder: c.holder, flight: c.flight, mine: c.mine, overdue: c.overdue }));
const none = { holder: null, flight: null, mine: false, overdue: false };

describe("the holder gate (Mosaic §6)", () => {
  it("sets a flight exactly where it sets a holder (Review Focus 1)", () => {
    for (const viewer of [null, v(CAROL)]) {
      const g = shapeGrid(page(focus), viewer, now);
      expect(g.cells.every((c) => c.flight === null && c.holder === null && !c.overdue)).toBe(true);
      const text = JSON.stringify(g);
      for (const s of ["alice", ALICE, "pink", "slim", "kite", "pear"]) expect(text, s).not.toContain(s);
    }
    for (const viewer of [v(BOB), v(ALICE), v(HOST, "host"), v(ADMIN, "admin")]) {
      const g = shapeGrid(page(focus), viewer, now);
      for (const c of g.cells) expect(c.flight === null, `line ${c.number} for ${viewer.id}`).toBe(c.holder === null);
      expect(g.cells.filter((c) => c.holder === "alice").map((c) => c.flight)).toEqual([pinkSlim, pinkSlim, pinkSlim]);
    }
  });
  it("anonymous: no holder, no flight, nothing mine, nothing overdue", () => {
    expect(gate(null)).toEqual([1, 2, 3, 4, 5, 6, 7].map((n) => ({ n, ...none })));
  });
  it("signed in with no line here: the same as anonymous", () => {
    expect(gate(v(CAROL))).toEqual(gate(null));
  });
  it("holder: every holder's flight and handle, their own lines mine, never overdue", () => {
    expect(gate(v(BOB))).toEqual([
      { n: 1, ...none },
      { n: 2, holder: "alice", flight: pinkSlim, mine: false, overdue: false },
      { n: 3, holder: "alice", flight: pinkSlim, mine: false, overdue: false },
      { n: 4, holder: "bob", flight: blueKite, mine: true, overdue: false },
      { n: 5, holder: "jim", flight: plumPear, mine: false, overdue: false },
      { n: 6, ...none },
      { n: 7, holder: "alice", flight: pinkSlim, mine: false, overdue: false },
    ]);
  });
  it("host: holders, flights, their own self-claimed line, and overdue", () => {
    expect(gate(v(HOST, "host"))).toEqual([
      { n: 1, ...none },
      { n: 2, holder: "alice", flight: pinkSlim, mine: false, overdue: true },
      { n: 3, holder: "alice", flight: pinkSlim, mine: false, overdue: false },
      { n: 4, holder: "bob", flight: blueKite, mine: false, overdue: false },
      { n: 5, holder: "jim", flight: plumPear, mine: true, overdue: false },
      { n: 6, ...none },
      { n: 7, holder: "alice", flight: pinkSlim, mine: false, overdue: false },
    ]);
  });
  it("admin: as the host, with no line of their own", () => {
    expect(gate(v(ADMIN, "admin"))).toEqual(gate(v(HOST, "host")).map((c) => ({ ...c, mine: false })));
  });
});

describe("the per-break collision rule (Mosaic §5)", () => {
  const at = (h: number) => hoursAgo(h);
  const f = (colour: Flight["colour"], shape: Flight["shape"]): Flight => ({ colour, shape });

  it("a shared flight: the later holder shows the next shape after their own", () => {
    const m = shownFlights([{ id: "b", firstClaimAt: at(1), flight: f("blue", "kite") }, { id: "a", firstClaimAt: at(2), flight: f("blue", "kite") }]);
    expect(m.get("a")).toEqual(f("blue", "kite"));
    expect(m.get("b")).toEqual(f("blue", "slim"));
  });
  it("a shared shape in a watched pair: yellow and lime, petrol and plum", () => {
    const m = shownFlights([
      { id: "a", firstClaimAt: at(4), flight: f("yellow", "pear") }, { id: "b", firstClaimAt: at(3), flight: f("lime", "pear") },
      { id: "c", firstClaimAt: at(2), flight: f("petrol", "standard") }, { id: "d", firstClaimAt: at(1), flight: f("plum", "standard") },
    ]);
    expect(m.get("b")).toEqual(f("lime", "kite"));
    expect(m.get("d")).toEqual(f("plum", "pear"));
  });
  it("a shared shape outside a watched pair stays as stored", () => {
    const m = shownFlights([{ id: "a", firstClaimAt: at(2), flight: f("blue", "pear") }, { id: "b", firstClaimAt: at(1), flight: f("sky", "pear") }]);
    expect(m.get("b")).toEqual(f("sky", "pear"));
  });
  it("with all four shapes taken in the pair, the flight shows unchanged", () => {
    const m = shownFlights([
      { id: "a", firstClaimAt: at(5), flight: f("petrol", "standard") }, { id: "b", firstClaimAt: at(4), flight: f("plum", "pear") },
      { id: "c", firstClaimAt: at(3), flight: f("petrol", "kite") }, { id: "d", firstClaimAt: at(2), flight: f("plum", "slim") },
      { id: "e", firstClaimAt: at(1), flight: f("petrol", "standard") },
    ]);
    expect(m.get("e")).toEqual(f("petrol", "standard"));
  });
  it("is the same for every member viewer, and a release gives the shape back", () => {
    // carol shares alice's pink slim and claimed later, so she shows pink standard (the next shape after slim).
    const lines6: L[] = [open(1), held(2, ALICE, "alice", { claimedAt: hoursAgo(30) }), held(3, ALICE, "alice"), held(4, BOB, "bob"), open(5),
      held(6, CAROL, "carol", { ownerFlightColour: "pink", ownerFlightShape: "slim", claimedAt: hoursAgo(0.5) })];
    const carolCell = (ls: L[], viewer: GridViewer) => shapeGrid(page(ls), viewer, now).cells.find((c) => c.number === 6)!.flight;
    expect(carolCell(lines6, v(BOB))).toEqual(f("pink", "standard"));
    expect(carolCell(lines6, v(HOST, "host"))).toEqual(f("pink", "standard"));
    expect(carolCell(lines6, v(CAROL))).toEqual(f("pink", "standard"));
    expect(shapeGrid(page(lines6), v(BOB), now).cells.find((c) => c.number === 2)!.flight).toEqual(pinkSlim);
    const released = lines6.map((l) => (l.ownerId === ALICE ? open(l.number) : l));
    expect(carolCell(released, v(BOB))).toEqual(pinkSlim);
  });
});

describe("kit and heat on the grid model (Mosaic §4, §6)", () => {
  it("carries the host's kit and the lamp's step for every viewer, frozen from Closed on", () => {
    // `lines`: 2 of 6 numbered lines open, so 4 claimed: floor(4 × 4 / 6) = 2.
    for (const viewer of [null, v(CAROL), v(ALICE), v(HOST, "host")]) {
      const g = shapeGrid(page(lines), viewer, now);
      expect(g.kit).toEqual({ dark: "blue", light: "yellow" });
      expect(g.heat).toBe(2);
    }
    for (const status of ["filled", "drawing", "drawn"]) expect(shapeGrid(page(lines, { status }), null, now).heat).toBe(4);
    expect(shapeGrid(page(lines, { status: "cancelled" }), null, now).heat).toBe(2);
  });
});
