import { describe, it, expect } from "vitest";
import { addChoice, blankRow, removeChoice, setCondition, setName } from "./prize-rows";

const ids = () => { let n = 0; return () => `00000000-0000-4000-8000-00000000000${++n}`; };

describe("composer prize rows", () => {
  it("gives a new row its own slot when it is added, and removing a row keeps the others' slots", () => {
    const newId = ids();
    let rows = [blankRow(newId)];
    rows = addChoice(rows, newId); rows = addChoice(rows, newId);
    expect(rows.map((r) => r.slotKey)).toEqual([1, 2, 3].map((n) => `00000000-0000-4000-8000-00000000000${n}`));
    rows = removeChoice(rows, 1);
    expect(rows.map((r) => r.slotKey)).toEqual(["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000003"]);
    expect(removeChoice(rows, 0)).toEqual(rows); // row 0 is never removed
  });
  it("changes a row's name or condition without touching its slot", () => {
    const rows = [{ slotKey: "s1", name: "", condition: "" as const }];
    expect(setName(rows, 0, "Chronos 22g")).toEqual([{ slotKey: "s1", name: "Chronos 22g", condition: "" }]);
    expect(setCondition(rows, 0, "used")).toEqual([{ slotKey: "s1", name: "", condition: "used" }]);
    expect(rows).toEqual([{ slotKey: "s1", name: "", condition: "" }]); // inputs are not mutated
  });
});
