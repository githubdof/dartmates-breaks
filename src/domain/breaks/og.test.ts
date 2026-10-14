import { describe, it, expect } from "vitest";
import type { BreakPage } from "./queries";
import { ogCaption, ogModel } from "./og";

const HOST = "00000000-0000-4000-8000-0000000000a1";
const ALICE = "00000000-0000-4000-8000-0000000000a2";
const now = new Date("2026-10-14T16:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

type L = BreakPage["lines"][number];
const open = (number: number): L => ({ number, ownerId: null, ownerHandle: null, claimedAt: null, sentAt: null, paidAt: null, priceCents: null, reservedForMiniId: null, isBonus: false });
const alice = (number: number, o: Partial<L> = {}): L => ({ ...open(number), ownerId: ALICE, ownerHandle: "alice", claimedAt: hoursAgo(1), priceCents: 500, ...o });

function page(lines: L[], b: Partial<BreakPage["break"]> = {}): BreakPage {
  return {
    break: {
      id: "00000000-0000-4000-8000-0000000000b1", hostId: HOST, kind: "main", title: "Taylor Chronos", description: "", lineCount: 6, linePriceCents: 500,
      allowRandomClaims: true, claimMode: "pick_or_random", paymentWindowHours: 24, maxLinesPerUser: null, entryRule: null, paymentInstructions: "",
      onePrizePerPerson: false, miniTimeoutAutoAssign: true, threadClosedAt: null, status: "open", seedCommitment: "ab".repeat(32),
      openedAt: hoursAgo(48), filledAt: null, cancelReason: null, relistedFromId: null, createdAt: hoursAgo(49), ...b,
    },
    host: { id: HOST, handle: "jim", displayName: "Jim", paymentHandles: { venmo: "@Jim-R" } },
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
      caption: "3 of 6 left, $5 a line",
      columns: 4,
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
  it("shortens a long title", () => {
    const m = ogModel(page(lines, { title: "x".repeat(120) }), now)!;
    expect(m.title).toHaveLength(80);
    expect(m.title.endsWith("…")).toBe(true);
  });
});

describe("ogCaption", () => {
  it("speaks the community's state words", () => {
    expect(ogCaption("open", 19, 50, 500)).toBe("19 of 50 left, $5 a line");
    expect(ogCaption("open", 3, 12, 550)).toBe("3 of 12 left, $5.50 a line");
    expect(ogCaption("filled", 0, 50, 500)).toBe("Closed. Every line is paid.");
    expect(ogCaption("drawing", 0, 50, 500)).toBe("Running draw");
    expect(ogCaption("drawn", 0, 50, 500)).toBe("Ran. Anyone can check the draw.");
    expect(ogCaption("cancelled", 0, 50, 500)).toBe("Cancelled");
  });
});
