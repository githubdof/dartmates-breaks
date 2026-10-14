import { describe, it, expect } from "vitest";
import {
  applyOrder, applyView, bonusText, drawingText, freezeView, chipCounts, freezeOrder, markPaidLabel, matchesFilter, matchesQuery, paidToast, releaseConfirm, releaseReason, rowCells, rowStateWord, type LedgerRowView,
} from "./ledger-view";

const row = (o: Partial<LedgerRowView> & { ownerId: string }): LedgerRowView => ({
  handle: null, displayName: null, numbers: [], unpaid: [], sent: [], overdue: [], paid: [], bonus: [], owedCents: 0, status: "paid", lateText: null, ...o,
});
const alice = row({ ownerId: "a", handle: "alice", displayName: "Alice Smith", numbers: [2, 5], unpaid: [2, 5], sent: [2, 5], owedCents: 1000, status: "sent" });
const dave = row({ ownerId: "d", handle: "dave", displayName: "Dave", numbers: [4], unpaid: [4], owedCents: 500, status: "unpaid" });
const erin = row({ ownerId: "e", handle: "erin", numbers: [10, 11, 12], paid: [10], unpaid: [11, 12], sent: [11], overdue: [12], owedCents: 1050, status: "overdue", lateText: "4 h late" });
const bob = row({ ownerId: "b", handle: "bob", numbers: [7, 13], paid: [7, 13], bonus: [13], status: "paid" });

describe("filters and search", () => {
  it("filters by what a buyer still has in each state (Review Focus 4)", () => {
    expect([alice, dave, erin, bob].filter((r) => matchesFilter(r, "sent")).map((r) => r.ownerId)).toEqual(["a", "e"]);
    expect([alice, dave, erin, bob].filter((r) => matchesFilter(r, "unpaid")).map((r) => r.ownerId)).toEqual(["a", "d", "e"]);
    expect([alice, dave, erin, bob].filter((r) => matchesFilter(r, "overdue")).map((r) => r.ownerId)).toEqual(["e"]);
    expect([alice, dave, erin, bob].filter((r) => matchesFilter(r, "all"))).toHaveLength(4);
    expect(chipCounts([alice, dave, erin, bob])).toEqual({ all: 4, sent: 2, unpaid: 3, overdue: 1 });
  });
  it("matches display name, handle or the owed amount", () => {
    expect(matchesQuery(alice, "")).toBe(true);
    expect(matchesQuery(alice, "@ali")).toBe(true);
    expect(matchesQuery(alice, "smith")).toBe(true);
    expect(matchesQuery(alice, "$10")).toBe(true);
    expect(matchesQuery(alice, "10")).toBe(true);
    expect(matchesQuery(erin, "10.50")).toBe(true);
    expect(matchesQuery(dave, "10")).toBe(false);
    expect(matchesQuery(dave, "zzz")).toBe(false);
  });
  it("matches an amount written with thousands commas", () => {
    const big = row({ ownerId: "g", handle: "gus", owedCents: 125000, status: "unpaid" });
    expect(matchesQuery(big, "$1,250")).toBe(true);
    expect(matchesQuery(big, "1,250.00")).toBe(true);
    expect(matchesQuery(big, "1250")).toBe(true);
    expect(matchesQuery(big, "1,25")).toBe(false);
  });
});

describe("fixed order", () => {
  it("keeps the order frozen at open and appends newcomers", () => {
    const order = freezeOrder([alice, dave, erin]);
    const fresh = [{ ...dave, status: "paid" as const }, erin, bob, alice];
    expect(applyOrder(fresh, order).map((r) => r.ownerId)).toEqual(["a", "d", "e", "b"]);
  });
  it("keeps a row listed after it stops matching the filter, with its current data", () => {
    const view = freezeView([alice, dave, erin, bob], "unpaid");
    const daveNowPaid = { ...dave, unpaid: [], paid: [4], owedCents: 0, status: "paid" as const };
    const shown = applyView(view, [alice, daveNowPaid, erin, bob], "");
    expect(shown.map((r) => r.ownerId)).toEqual(["a", "d", "e"]);
    expect(shown[1].status).toBe("paid");
  });
  it("does not list a row that starts matching after the freeze, unless it is a newcomer", () => {
    const view = freezeView([alice, dave, bob], "sent");
    const daveNowSent = { ...dave, sent: [4], status: "sent" as const };
    const fay = row({ ownerId: "f", handle: "fay", numbers: [20], unpaid: [20], sent: [20], owedCents: 500, status: "sent" });
    const gil = row({ ownerId: "g", handle: "gil", numbers: [21], unpaid: [21], owedCents: 500, status: "unpaid" });
    expect(applyView(view, [fay, alice, daveNowSent, gil, bob], "").map((r) => r.ownerId)).toEqual(["a", "f"]);
  });
  it("filters by search text live", () => {
    const view = freezeView([alice, dave, erin, bob], "all");
    expect(applyView(view, [alice, dave, erin, bob], "dave").map((r) => r.ownerId)).toEqual(["d"]);
    expect(applyView(view, [alice, dave, erin, bob], "$10").map((r) => r.ownerId)).toEqual(["a"]);
  });
});

describe("row copy", () => {
  it("names the Paid button's action for screen readers (design §6 \"Mark paid\")", () => {
    expect(markPaidLabel(dave)).toBe("Mark Dave paid, $5");
    expect(markPaidLabel(erin)).toBe("Mark @erin paid, $10.50");
  });
  it("confirms paid in a snackbar", () => {
    expect(paidToast(dave, [4], 500)).toBe("Marked @dave paid (1 line, $5).");
    expect(paidToast(row({ ownerId: "x", displayName: "Zed" }), [1, 2, 3], 1500)).toBe("Marked Zed paid (3 lines, $15).");
  });
  it("names the lines and the consequence when releasing, and warns about sent lines", () => {
    expect(releaseConfirm(dave, [4])).toEqual({ text: "Release line 4 from @dave? It reopens now.", confirm: "Release 1 line", warning: null });
    expect(releaseConfirm(erin, [11, 12])).toEqual({
      text: "Release lines 11 and 12 from @erin? They reopen now.", confirm: "Release 2 lines",
      warning: "@erin marked line 11 as sent. Check your payments before releasing.",
    });
  });
  it("uses the overdue reason only when every unpaid line is overdue", () => {
    expect(releaseReason(erin)).toBe("host_dropped");
    expect(releaseReason(row({ ownerId: "z", unpaid: [3], overdue: [3] }))).toBe("overdue");
  });
  it("says who started the draw (design §5.4)", () => {
    expect(drawingText("Dave")).toBe("Dave started the draw. The result is in about a minute.");
  });
  it("shows the bonus allowance and the row state word", () => {
    expect(bonusText(2, 5)).toBe("3 of 5 bonus lines left");
    expect(bonusText(0, 1)).toBe("1 of 1 bonus line left");
    expect(bonusText(7, 5)).toBe("0 of 5 bonus lines left"); // never a negative count
    expect([alice, dave, erin, bob].map(rowStateWord)).toEqual(["Sent", "Unpaid", "Overdue", "Paid"]);
  });
  it("draws each line's state as a mini cell", () => {
    expect(rowCells(erin)).toEqual([
      { number: 10, state: "paid", mine: false, overdue: false, bonus: false },
      { number: 11, state: "sent", mine: false, overdue: false, bonus: false },
      { number: 12, state: "taken", mine: false, overdue: true, bonus: false },
    ]);
    expect(rowCells(bob)[1]).toEqual({ number: 13, state: "paid", mine: false, overdue: false, bonus: true });
  });
});
