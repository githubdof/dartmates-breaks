import { describe, it, expect } from "vitest";
import { radioKeyIndex, radioTabIndex } from "./radio-group";

describe("radioKeyIndex", () => {
  it("moves with the arrows and wraps at both ends", () => {
    expect(radioKeyIndex("ArrowRight", 0, 3)).toBe(1);
    expect(radioKeyIndex("ArrowDown", 2, 3)).toBe(0);
    expect(radioKeyIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(radioKeyIndex("ArrowUp", 2, 3)).toBe(1);
  });
  it("jumps to the ends with Home and End", () => {
    expect(radioKeyIndex("Home", 2, 4)).toBe(0);
    expect(radioKeyIndex("End", 0, 4)).toBe(3);
  });
  it("ignores other keys and empty groups", () => {
    expect(radioKeyIndex("Enter", 1, 3)).toBeNull();
    expect(radioKeyIndex("Tab", 1, 3)).toBeNull();
    expect(radioKeyIndex("ArrowRight", 0, 0)).toBeNull();
  });
});

describe("radioTabIndex", () => {
  it("makes the checked option the only tab stop, or the first when none is checked", () => {
    expect([false, true, false].map((on, i) => radioTabIndex(on, i, true))).toEqual([-1, 0, -1]);
    expect([false, false].map((on, i) => radioTabIndex(on, i, false))).toEqual([0, -1]);
  });
});
