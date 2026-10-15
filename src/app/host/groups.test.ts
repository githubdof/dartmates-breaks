import { describe, it, expect } from "vitest";
import { groupHostBreaks, toWaitingView, waitingStripText } from "./groups";

describe("groupHostBreaks", () => {
  it("groups in the design's order with the community's words, keeping each group's order and dropping empty ones", () => {
    const rows = [
      { id: "d1", status: "draft" }, { id: "o1", status: "open" }, { id: "r1", status: "drawn" },
      { id: "o2", status: "open" }, { id: "c1", status: "filled" }, { id: "x1", status: "cancelled" },
    ];
    expect(groupHostBreaks(rows).map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([
      ["Open", ["o1", "o2"]], ["Closed", ["c1"]], ["Ran", ["r1"]], ["Drafts", ["d1"]], ["Cancelled", ["x1"]],
    ]);
    expect(groupHostBreaks([])).toEqual([]);
  });
});

describe("waitingStripText", () => {
  it("counts buyer rows and the breaks they span", () => {
    expect(waitingStripText([])).toBeNull();
    expect(waitingStripText([{ breakId: "a" }])).toBe("1 sent, waiting for you");
    expect(waitingStripText([{ breakId: "a" }, { breakId: "a" }])).toBe("2 sent, waiting for you");
    expect(waitingStripText([{ breakId: "a" }, { breakId: "b" }, { breakId: "c" }, { breakId: "a" }])).toBe("4 sent, waiting for you, across 3 breaks");
  });
});

describe("toWaitingView", () => {
  it("shapes a buyer's sent lines in one break as a ledger row, keyed by break and buyer", () => {
    const w = {
      breakId: "b1", breakTitle: "Chronos", ownerId: "u1", handle: "dave", displayName: "Dave", paymentName: "David R",
      sent: [3, 4], sentCents: 1000, firstSentAt: new Date("2026-10-14T12:00:00Z"),
    };
    expect(toWaitingView(w)).toEqual({
      key: "b1:u1", breakId: "b1", breakTitle: "Chronos",
      row: {
        ownerId: "u1", handle: "dave", displayName: "Dave", paymentName: "David R",
        numbers: [3, 4], unpaid: [3, 4], sent: [3, 4], overdue: [], paid: [], bonus: [], owedCents: 1000, status: "sent", lateText: null,
      },
    });
  });
});
