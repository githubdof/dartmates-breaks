import { describe, it, expect } from "vitest";
import { joinAnd, plural, ordinal } from "./list";

describe("joinAnd", () => {
  it("names one, two and many items without a serial comma", () => {
    expect(joinAnd([])).toBe("");
    expect(joinAnd([4])).toBe("4");
    expect(joinAnd([4, 11])).toBe("4 and 11");
    expect(joinAnd([4, 11, 27])).toBe("4, 11 and 27");
    expect(joinAnd(["a", "b", "c", "d"])).toBe("a, b, c and d");
  });
});

describe("plural", () => {
  it("picks the singular only for one", () => {
    expect(plural(1, "line", "lines")).toBe("line");
    expect(plural(0, "line", "lines")).toBe("lines");
    expect(plural(3, "line", "lines")).toBe("lines");
  });
});

describe("ordinal", () => {
  it("handles the teens and the twenties", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"]);
  });
});
