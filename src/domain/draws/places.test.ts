import { describe, it, expect } from "vitest";
import { placesOf } from "./places";

describe("placesOf", () => {
  it("maps each prize rank up to 3 to its line in the drawn order; a place with no prize is skipped", () => {
    expect(placesOf([7, 3, 9, 1], [1, 2, 3])).toEqual([{ number: 7, place: 1 }, { number: 3, place: 2 }, { number: 9, place: 3 }]);
    expect(placesOf([7, 3, 9, 1], [1])).toEqual([{ number: 7, place: 1 }]);
    expect(placesOf([7, 3, 9, 1], [3, 1, 1])).toEqual([{ number: 7, place: 1 }, { number: 9, place: 3 }]);
    expect(placesOf([7, 3, 9, 1], [1, 2, 3, 4])).toHaveLength(3);
    expect(placesOf([7], [1, 2])).toEqual([{ number: 7, place: 1 }]);
    expect(placesOf([], [1])).toEqual([]);
  });
});
