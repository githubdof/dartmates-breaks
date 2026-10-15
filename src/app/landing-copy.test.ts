import { describe, it, expect } from "vitest";
import { heroNumbers, ranText } from "./landing-copy";

const now = new Date("2026-10-14T18:00:00Z"); // a Wednesday
const ago = (ms: number) => new Date(now.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;

describe("ranText", () => {
  it("says how long ago under 48 hours, then the day", () => {
    expect(ranText(ago(20_000), now, "America/New_York")).toBe("Ran just now.");
    expect(ranText(ago(1 * MIN), now, "America/New_York")).toBe("Ran 1 minute ago.");
    expect(ranText(ago(45 * MIN), now, "America/New_York")).toBe("Ran 45 minutes ago.");
    expect(ranText(ago(2 * HOUR), now, "America/New_York")).toBe("Ran 2 hours ago.");
    expect(ranText(ago(47 * HOUR), now, "America/New_York")).toBe("Ran 47 hours ago.");
    expect(ranText(ago(72 * HOUR), now, "America/New_York")).toBe("Ran on Sunday.");
    expect(ranText(ago(10 * 24 * HOUR), now, "America/New_York")).toBe("Ran on Oct 4.");
    expect(ranText(new Date("2025-10-04T18:00:00Z"), now, "America/New_York")).toBe("Ran on Oct 4, 2025.");
  });
  it("names the day in the viewer's zone", () => {
    const lateSunday = new Date("2026-10-12T02:30:00Z"); // Sunday evening in New York, Monday morning in London
    expect(ranText(lateSunday, now, "America/New_York")).toBe("Ran on Sunday.");
    expect(ranText(lateSunday, now, "Europe/London")).toBe("Ran on Monday.");
  });
});

describe("heroNumbers", () => {
  it("is every numbered line, plus the winner when it is a bonus line", () => {
    expect(heroNumbers(4, 2)).toEqual([1, 2, 3, 4]);
    expect(heroNumbers(4, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});
