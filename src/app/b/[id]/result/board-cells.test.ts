import { it, expect } from "vitest";
import type { GridCell } from "@/domain/breaks/grid";
import { withPlaces } from "./board-cells";

const cell = (number: number): GridCell => ({ number, state: "paid", mine: false, overdue: false, bonus: false, holder: null, flight: null });

it("puts each place from placesOf on its line, and null everywhere else", () => {
  // placesOf([3, 1, 4, 2], [1, 2]) (Task 6): the top spot on line 3, 2nd on line 1.
  const cells = withPlaces([cell(1), cell(2), cell(3), cell(4)], [{ number: 3, place: 1 }, { number: 1, place: 2 }]);
  expect(cells.map((c) => [c.number, c.place])).toEqual([[1, 2], [2, null], [3, 1], [4, null]]);
});
