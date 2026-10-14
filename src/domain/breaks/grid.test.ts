import { describe, it, expect } from "vitest";
import { shapeGrid, canViewBreak, allowanceFor, type GridViewer } from "./grid";
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
const open = (number: number): L => ({ number, ownerId: null, ownerHandle: null, claimedAt: null, sentAt: null, paidAt: null, priceCents: null, reservedForMiniId: null, isBonus: false });
const held = (number: number, ownerId: string, ownerHandle: string, o: Partial<L> = {}): L =>
  ({ ...open(number), ownerId, ownerHandle, claimedAt: hoursAgo(1), priceCents: 500, ...o });

function page(lines: L[], b: Partial<BreakPage["break"]> = {}): BreakPage {
  return {
    break: {
      id: "00000000-0000-4000-8000-0000000000b1", hostId: HOST, kind: "main", title: "Chronos", description: "", lineCount: 6, linePriceCents: 500,
      allowRandomClaims: true, claimMode: "pick_or_random", paymentWindowHours: 24, maxLinesPerUser: null, entryRule: null, paymentInstructions: "",
      onePrizePerPerson: false, miniTimeoutAutoAssign: true, threadClosedAt: null, status: "open", seedCommitment: "ab".repeat(32),
      openedAt: hoursAgo(48), filledAt: null, cancelReason: null, relistedFromId: null, createdAt: hoursAgo(49), ...b,
    },
    host: { id: HOST, handle: "jim", displayName: "Jim", paymentHandles: {} },
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
    expect(cell2(null)).toEqual({ number: 2, state: "taken", mine: false, overdue: false, bonus: false, holder: null });
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
});

describe("canViewBreak", () => {
  it("hides drafts from everyone but their host", () => {
    expect(canViewBreak("draft", false)).toBe(false);
    expect(canViewBreak("draft", true)).toBe(true);
    expect(canViewBreak("open", false)).toBe(true);
    expect(canViewBreak("drawn", false)).toBe(true);
  });
});
