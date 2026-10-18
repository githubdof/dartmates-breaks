import { describe, it, expect } from "vitest";
import { cellLabel, cellStateWord, type CellData } from "./cell-label";

const c = (o: Partial<CellData> & { number: number }): CellData => ({ state: "open", mine: false, overdue: false, bonus: false, ...o });

describe("cellLabel", () => {
  it("names the line and its state, shape-first words only", () => {
    expect(cellLabel(c({ number: 7 }))).toBe("Line 7, open");
    expect(cellLabel(c({ number: 12, state: "taken" }))).toBe("Line 12, taken");
    expect(cellLabel(c({ number: 12, state: "paid" }))).toBe("Line 12, paid");
    expect(cellLabel(c({ number: 9, state: "sent", mine: true }))).toBe("Line 9, yours, sent");
    expect(cellLabel(c({ number: 4, state: "taken", overdue: true }))).toBe("Line 4, taken, overdue");
    expect(cellLabel(c({ number: 51, state: "paid", bonus: true }))).toBe("Line 51, bonus, paid");
    expect(cellLabel(c({ number: 3, state: "reserved" }))).toBe("Line 3, reserved for a mini");
  });
  it("never includes a holder handle", () => {
    const withHolder = { ...c({ number: 5, state: "paid" }), holder: "mike" };
    expect(cellLabel(withHolder)).not.toContain("mike");
  });
  it("on the board: other people's sent lines read taken; sniped and won lines are named (Mosaic §5)", () => {
    expect(cellLabel(c({ number: 7, state: "sent" }), { foldSent: true })).toBe("Line 7, taken");
    expect(cellLabel(c({ number: 9, state: "sent", mine: true }), { foldSent: true })).toBe("Line 9, yours, sent");
    // Paper surfaces (the ledger's mini cells) keep the word: the host works from it.
    expect(cellLabel(c({ number: 7, state: "sent" }))).toBe("Line 7, sent");
    expect(cellLabel(c({ number: 7, state: "taken" }), { struck: true, foldSent: true })).toBe("Line 7, just taken");
    expect(cellLabel(c({ number: 23, state: "paid", place: 1 }), { foldSent: true })).toBe("Line 23, top spot");
    expect(cellLabel(c({ number: 9, state: "paid", place: 2 }), { foldSent: true })).toBe("Line 9, 2nd place");
    expect(cellLabel(c({ number: 31, state: "paid", place: 3 }), { foldSent: true })).toBe("Line 31, 3rd place");
    // A won line is named by its place alone, yours included: the result never changes with the viewer's holdings
    // (Mosaic §5, recorded ruling 19).
    expect(cellLabel(c({ number: 23, state: "paid", place: 1, mine: true }), { foldSent: true })).toBe("Line 23, top spot");
  });
  it("never includes a flight", () => {
    const name = cellLabel(c({ number: 5, state: "paid", flight: { colour: "plum", shape: "kite" } }), { foldSent: true });
    expect(name).toBe("Line 5, paid");
    expect(name).not.toMatch(/plum|kite/);
  });
  it("gives a short state word", () => {
    expect(cellStateWord(c({ number: 1, state: "paid", mine: true }))).toBe("yours, paid");
    expect(cellStateWord(c({ number: 1, state: "taken", overdue: true }))).toBe("taken, overdue");
  });
});
