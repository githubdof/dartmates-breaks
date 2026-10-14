import { it, expect } from "vitest";
import { clampStep, commitDraft, draftValue, stepState } from "./stepper-math";

it("clamps to the bounds and survives junk input", () => {
  expect(clampStep(3, 1, 5)).toBe(3);
  expect(clampStep(9, 1, 5)).toBe(5);
  expect(clampStep(0, 1, 5)).toBe(1);
  expect(clampStep(Number.NaN, 1, 5)).toBe(1);
  expect(clampStep(2.6, 1, 5)).toBe(3);
  expect(clampStep(4, 1, 0)).toBe(1); // no allowance: stays at min; the caller disables the control
});

it("knows which buttons work", () => {
  expect(stepState(1, 1, 5)).toEqual({ canDec: false, canInc: true });
  expect(stepState(5, 1, 5)).toEqual({ canDec: true, canInc: false });
  expect(stepState(1, 1, 1)).toEqual({ canDec: false, canInc: false });
});

it("commits a typed number only once it is complete and in bounds", () => {
  // Composer stepper, 2..50: clearing "30" and typing "25" must not snap to 2 on the way.
  expect(draftValue("", 2, 50)).toBeNull();
  expect(draftValue("2", 2, 50)).toBe(2);
  expect(draftValue("25", 2, 50)).toBe(25);
  expect(draftValue("1", 2, 50)).toBeNull(); // below min: maybe the start of "15"
  expect(draftValue("51", 2, 50)).toBeNull();
  expect(draftValue("2.5", 2, 50)).toBeNull();
  expect(draftValue(" 7 ", 2, 50)).toBe(7);
});

it("clamps on blur or Enter, and falls back on junk", () => {
  expect(commitDraft("1", 2, 50, 30)).toBe(2);
  expect(commitDraft("99", 2, 50, 30)).toBe(50);
  expect(commitDraft("", 2, 50, 30)).toBe(30);
  expect(commitDraft("abc", 2, 50, 30)).toBe(30);
  expect(commitDraft("12", 2, 50, 30)).toBe(12);
});
