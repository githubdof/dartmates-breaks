import { describe, it, expect } from "vitest";
import type { MyBreak } from "@/domain/lines/queries";
import { toCardProps } from "./card-props";

const now = new Date("2026-10-14T16:00:00Z");
const g: MyBreak = {
  breakId: "b1", title: "Chronos", status: "open", openedAt: now, lineCount: 10, linePriceCents: 500, seedCommitment: "ab".repeat(32),
  paymentWindowHours: 24, paymentInstructions: "Leave the note blank.",
  host: { id: "h1", handle: "jim", displayName: "Jim", paymentHandles: { venmo: "@Jim-R" } },
  lines: [{ number: 3, state: "sent", bonus: false }, { number: 5, state: "taken", bonus: false }, { number: 11, state: "paid", bonus: true }],
  unsent: [5], sent: [3], paid: [11], owedCents: 500, payBy: new Date("2026-10-15T01:40:00Z"), late: false,
  awards: [], ranAt: null, earlier: false,
};
const zone = { tz: "America/New_York", labelled: false };

describe("toCardProps", () => {
  it("turns a group into what the card shows, with the deadline in the viewer's zone", () => {
    expect(toCardProps(g, now, zone)).toEqual({
      breakId: "b1", title: "Chronos", status: "open", hostName: "Jim", payee: "@Jim-R", handles: { venmo: "@Jim-R" },
      instructions: "Leave the note blank.", commitment: "abababababab",
      cells: [
        { number: 3, state: "sent", mine: true, overdue: false, bonus: false },
        { number: 5, state: "taken", mine: true, overdue: false, bonus: false },
        { number: 11, state: "paid", mine: true, overdue: false, bonus: true },
      ],
      stateLine: "Unpaid.",
      owe: { numbers: [5], cents: 500, payByIso: "2026-10-15T01:40:00.000Z", payByFallback: "9:40 pm today", late: false, bonusLost: [] },
    });
  });
  it("owes nothing once every unsent line is gone", () => {
    expect(toCardProps({ ...g, unsent: [], owedCents: 0, payBy: null }, now, zone).owe).toBeNull();
  });
  it("still owes on a closed break, and passes lateness through", () => {
    expect(toCardProps({ ...g, status: "filled", late: true }, now, zone).owe?.late).toBe(true);
  });
  it("owes nothing on a break that is cancelled or drawn", () => {
    const cancelled = toCardProps({ ...g, status: "cancelled" }, now, zone);
    expect(cancelled.owe).toBeNull();
    expect(cancelled.stateLine).toBe("Cancelled.");
    expect(toCardProps({ ...g, status: "drawn" }, now, zone).owe).toBeNull();
  });
  it("says which bonus lines a give-back would take", () => {
    const onlyUnsent = { ...g, lines: [{ number: 5, state: "taken" as const, bonus: false }, { number: 11, state: "paid" as const, bonus: true }], sent: [], paid: [11] };
    expect(toCardProps(onlyUnsent, now, { tz: "America/New_York", labelled: false }).owe?.bonusLost).toEqual([11]);
  });
});
