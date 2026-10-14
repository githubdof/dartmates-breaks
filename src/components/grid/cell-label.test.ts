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
  it("gives a short state word", () => {
    expect(cellStateWord(c({ number: 1, state: "paid", mine: true }))).toBe("yours, paid");
    expect(cellStateWord(c({ number: 1, state: "taken", overdue: true }))).toBe("taken, overdue");
  });
});
