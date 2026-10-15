import { describe, it, expect } from "vitest";
import type { GridCell } from "@/domain/breaks/grid";
import {
  cellNote, isSelectable, isRepeat, loginHref, onboardingHref, outcomeText, parsePick, reconcileSelection, selectionAnnouncement, selectionSummary, takenAnnouncement, toggleSelection,
} from "./selection";

const cell = (number: number, o: Partial<GridCell> = {}): GridCell => ({ number, state: "open", mine: false, overdue: false, bonus: false, holder: null, flight: null, ...o });
const board = (n: number, taken: Record<number, Partial<GridCell>> = {}) => Array.from({ length: n }, (_, i) => cell(i + 1, taken[i + 1]));

describe("parsePick and reconcileSelection", () => {
  it("keeps only real, open, de-duplicated lines from ?pick= (Review Focus 3)", () => {
    const picked = parsePick("7,abc,4,7,0,99,12", 50);
    expect(picked).toEqual([4, 7, 12]);
    const cells = board(50, { 4: { state: "taken" } });
    expect(reconcileSelection(picked, cells, 5)).toEqual({ selected: [7, 12], taken: [4], overLimit: [] });
  });
  it("accepts repeated params and nothing", () => {
    expect(parsePick(["3", "5"], 10)).toEqual([3, 5]);
    expect(parsePick(undefined, 10)).toEqual([]);
    expect(parsePick("1e2, 2 ,-3", 10)).toEqual([2]);
  });
  it("announces lines others took, and drops my own optimistic lines silently (Review Focus 2)", () => {
    const cells = board(20, { 7: { state: "taken" }, 12: { state: "taken", mine: true } });
    expect(reconcileSelection([7, 12], cells, 5)).toEqual({ selected: [], taken: [7], overLimit: [] });
    expect(reconcileSelection([3, 99], cells, 5)).toEqual({ selected: [3], taken: [], overLimit: [] });
  });
  it("drops bonus and reserved lines silently: they are not selectable, but nobody took them", () => {
    const cells = board(20, { 5: { bonus: true }, 6: { state: "reserved" } });
    expect(reconcileSelection([3, 5, 6], cells, 5)).toEqual({ selected: [3], taken: [], overLimit: [] });
  });
  it("a pick link over the limit keeps the lowest open lines; a taken pick does not cost an open one", () => {
    const cells = board(50, { 4: { state: "taken" } });
    const picked = parsePick("4,7,12,20,31", 50);
    expect(reconcileSelection(picked, cells, 2)).toEqual({ selected: [7, 12], taken: [4], overLimit: [20, 31] });
  });
  it("a refresh that shrinks the allowance trims the highest numbers", () => {
    expect(reconcileSelection([3, 9, 14], board(20), 1)).toEqual({ selected: [3], taken: [], overLimit: [9, 14] });
  });
  it("a host whose allowance is 0 following a pick link keeps nothing", () => {
    expect(reconcileSelection(parsePick("2,5", 8), board(8), 0)).toEqual({ selected: [], taken: [], overLimit: [2, 5] });
  });
});

describe("isSelectable", () => {
  it("is open and not bonus", () => {
    expect(isSelectable(cell(1))).toBe(true);
    expect(isSelectable(cell(1, { bonus: true }))).toBe(false);
    expect(isSelectable(cell(1, { state: "reserved" }))).toBe(false);
    expect(isSelectable(cell(1, { state: "taken" }))).toBe(false);
  });
});

describe("toggleSelection", () => {
  it("adds, removes and stops at the allowance", () => {
    expect(toggleSelection([3], cell(1), 5)).toEqual({ next: [1, 3], blocked: false });
    expect(toggleSelection([1, 3], cell(3), 5)).toEqual({ next: [1], blocked: false });
    expect(toggleSelection([1, 3], cell(4), 2)).toEqual({ next: [1, 3], blocked: true });
    expect(toggleSelection([1, 3], cell(3), 2)).toEqual({ next: [1], blocked: false });
  });
  it("never adds a line that is not selectable, and still lets an over-limit selection shrink", () => {
    expect(toggleSelection([1], cell(4, { state: "taken" }), 5)).toEqual({ next: [1], blocked: false });
    expect(toggleSelection([1], cell(4, { bonus: true }), 5)).toEqual({ next: [1], blocked: false });
    expect(toggleSelection([1, 3, 5], cell(5), 1)).toEqual({ next: [1, 3], blocked: false });
  });
});

describe("copy", () => {
  it("names the lines in the bar, then truncates past three", () => {
    expect(selectionSummary([7], 500)).toBe("Line 7, $5");
    expect(selectionSummary([7, 12], 500)).toBe("Lines 7, 12, $10");
    expect(selectionSummary([7, 12, 31], 500)).toBe("Lines 7, 12, 31, $15");
    expect(selectionSummary([7, 12, 31, 40, 44], 500)).toBe("Lines 7, 12, 31 +2, $25");
  });
  it("announces selections, taken lines and outcomes", () => {
    expect(selectionAnnouncement(3, 500)).toBe("3 lines selected, $15");
    expect(selectionAnnouncement(1, 550)).toBe("1 line selected, $5.50");
    expect(selectionAnnouncement(0, 500)).toBe("No lines selected");
    expect(takenAnnouncement([7])).toBe("Line 7 was just taken.");
    expect(takenAnnouncement([4, 7])).toBe("Lines 4 and 7 were just taken.");
    expect(outcomeText([4, 11], [7])).toBe("You have lines 4 and 11. Line 7 was just taken.");
    expect(outcomeText([4], [])).toBe("You have line 4.");
    expect(outcomeText([], [7, 9])).toBe("Lines 7 and 9 were just taken.");
  });
  it("explains a tapped taken cell without leaking a handle the server withheld", () => {
    expect(cellNote(cell(7, { state: "paid", holder: "mike" }))).toBe("Line 7: @mike, paid");
    expect(cellNote(cell(7, { state: "taken" }))).toBe("Line 7: taken");
    expect(cellNote(cell(9, { state: "sent", mine: true, holder: "me" }))).toBe("Line 9: yours, sent");
    expect(cellNote(cell(8, { state: "sent", holder: "mike" }))).toBe("Line 8: @mike, taken");
  });
  it("keeps the selection through sign-in and onboarding", () => {
    expect(loginHref("b1", [4, 7])).toBe("/login?next=%2Fb%2Fb1%3Fpick%3D4%2C7");
    expect(loginHref("b1", [])).toBe("/login?next=%2Fb%2Fb1");
    expect(onboardingHref("b1", [4])).toBe("/onboarding?next=%2Fb%2Fb1%3Fpick%3D4");
  });
});

describe("isRepeat", () => {
  it("skips the same words said again within 3 s, nothing else", () => {
    const last = { text: "You can hold 5 lines in this break.", at: 10_000 };
    expect(isRepeat(last, "You can hold 5 lines in this break.", 12_000)).toBe(true);
    expect(isRepeat(last, "You can hold 5 lines in this break.", 13_500)).toBe(false);
    expect(isRepeat(last, "Line 7 was just taken.", 11_000)).toBe(false);
    expect(isRepeat(null, "Line 7 was just taken.", 11_000)).toBe(false);
  });
});
