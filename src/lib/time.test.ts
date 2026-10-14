import { describe, it, expect } from "vitest";
import { DEFAULT_TZ, daysSince, formatClock, formatDateTime, formatDeadline, formatLate, formatMonthYear, isTimeZone, resolveZone, zoneLabel } from "./time";

const now = new Date("2026-10-13T16:00:00Z"); // Tuesday: 12:00 pm in New York (EDT), 5:00 pm in London (BST)

// One row per zone. The UK leaves summer time on 2026-10-25, a week before the US (2026-11-01).
const ZONES = [
  {
    tz: "America/New_York",
    clock: ["9:40 pm", "9:05 am"],
    days: ["9:40 pm today", "9:40 pm tomorrow", "9:40 pm on Fri, Oct 16"],
    focus5: "11:30 pm today",
    ukChange: ["5:00 am tomorrow", "7:30 pm today"],
    usChange: "9:00 am tomorrow",
    dateTime: "Oct 13, 2026 at 9:40 pm",
  },
  {
    tz: "Europe/London",
    clock: ["2:40 am", "2:05 pm"],
    days: ["2:40 am tomorrow", "2:40 am on Thu, Oct 15", "2:40 am on Sat, Oct 17"],
    focus5: "4:30 am tomorrow",
    ukChange: ["9:00 am tomorrow", "12:30 am tomorrow"],
    usChange: "2:00 pm tomorrow",
    dateTime: "Oct 14, 2026 at 2:40 am",
  },
] as const;

describe.each(ZONES)("absolute times in $tz", (z) => {
  it("prints a lowercase 12-hour clock in the zone", () => {
    expect(formatClock(new Date("2026-10-14T01:40:00Z"), z.tz)).toBe(z.clock[0]);
    expect(formatClock(new Date("2026-10-13T13:05:00Z"), z.tz)).toBe(z.clock[1]);
  });
  it("says today, tomorrow or the date, decided in the zone", () => {
    expect(formatDeadline(new Date("2026-10-14T01:40:00Z"), now, z.tz)).toBe(z.days[0]);
    expect(formatDeadline(new Date("2026-10-15T01:40:00Z"), now, z.tz)).toBe(z.days[1]);
    expect(formatDeadline(new Date("2026-10-17T01:40:00Z"), now, z.tz)).toBe(z.days[2]);
  });
  it("decides the day in the viewer's zone, not UTC (Review Focus 5)", () => {
    // 03:30 UTC on the 14th: 11:30 pm on the 13th in New York, 4:30 am on the 14th in London.
    expect(formatDeadline(new Date("2026-10-14T03:30:00Z"), now, z.tz)).toBe(z.focus5);
  });
  it("keeps the wall-clock hour across the UK clock change (2026-10-25)", () => {
    const sat = new Date("2026-10-24T16:00:00Z");
    expect(formatDeadline(new Date("2026-10-25T09:00:00Z"), sat, z.tz)).toBe(z.ukChange[0]);
    expect(formatDeadline(new Date("2026-10-24T23:30:00Z"), sat, z.tz)).toBe(z.ukChange[1]);
  });
  it("keeps the wall-clock hour across the US clock change (2026-11-01)", () => {
    expect(formatDeadline(new Date("2026-11-01T14:00:00Z"), new Date("2026-10-31T16:00:00Z"), z.tz)).toBe(z.usChange);
  });
  it("formats a date and time, unlabelled", () => {
    expect(formatDateTime(new Date("2026-10-14T01:40:00Z"), z.tz)).toBe(z.dateTime);
  });
});

describe("the server fallback zone", () => {
  it("labels the default zone with its short name, which follows the clock change", () => {
    expect(zoneLabel(DEFAULT_TZ, new Date("2026-10-14T01:40:00Z"))).toBe("EDT");
    expect(zoneLabel(DEFAULT_TZ, new Date("2026-11-14T01:40:00Z"))).toBe("EST");
    expect(formatDeadline(new Date("2026-10-14T03:30:00Z"), now, DEFAULT_TZ, true)).toBe("11:30 pm EDT today");
    expect(formatDateTime(new Date("2026-10-14T01:40:00Z"), DEFAULT_TZ, true)).toBe("Oct 13, 2026 at 9:40 pm EDT");
  });
  it("trusts a valid tz cookie, unlabelled, and falls back to the labelled default otherwise", () => {
    expect(resolveZone("Europe/London")).toEqual({ tz: "Europe/London", labelled: false });
    expect(resolveZone("UTC")).toEqual({ tz: "UTC", labelled: false });
    expect(resolveZone(undefined)).toEqual({ tz: DEFAULT_TZ, labelled: true });
    expect(resolveZone("Mars/Olympus")).toEqual({ tz: DEFAULT_TZ, labelled: true });
    expect(resolveZone("x".repeat(200))).toEqual({ tz: DEFAULT_TZ, labelled: true });
    expect(isTimeZone(42)).toBe(false);
  });
});

describe("relative times and dates", () => {
  it("uses minutes, then hours, then days", () => {
    expect(formatLate(new Date(now.getTime() - 35 * 60_000), now)).toBe("35 min late");
    expect(formatLate(new Date(now.getTime() - 4 * 3_600_000 - 59 * 60_000), now)).toBe("4 h late");
    expect(formatLate(new Date(now.getTime() - 3 * 86_400_000), now)).toBe("3 days late");
    expect(formatLate(now, now)).toBe("1 min late");
  });
  it("counts whole days and names the month", () => {
    expect(daysSince(new Date(now.getTime() - 3.5 * 86_400_000), now)).toBe(3);
    expect(formatMonthYear(new Date("2026-10-01T12:00:00Z"))).toBe("Oct 2026");
    expect(formatMonthYear(new Date("2026-10-01T12:00:00Z"), "Europe/London")).toBe("Oct 2026");
  });
});
