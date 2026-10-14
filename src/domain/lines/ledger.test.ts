import { describe, it, expect } from "vitest";
import { buyerStatus, compareLedger } from "./ledger";
import { bonusAllowance } from "@/domain/breaks/rules";

describe("buyerStatus", () => {
  it("is paid when nothing is unpaid", () => expect(buyerStatus({ unpaid: [], sent: [], overdue: [] })).toBe("paid"));
  it("is overdue as soon as one unpaid line is overdue, even with sent lines", () => expect(buyerStatus({ unpaid: [11, 12], sent: [11], overdue: [12] })).toBe("overdue"));
  it("is sent only when every unpaid line is sent", () => {
    expect(buyerStatus({ unpaid: [2, 5], sent: [2, 5], overdue: [] })).toBe("sent");
    expect(buyerStatus({ unpaid: [2, 5], sent: [2], overdue: [] })).toBe("unpaid");
  });
});

describe("compareLedger", () => {
  it("orders Sent, Unpaid, Overdue, Paid, then by first claim", () => {
    const t = (h: number) => new Date(Date.UTC(2026, 9, 13, h));
    const rows = [
      { id: "paid", status: "paid" as const, firstClaimAt: t(1), ownerId: "u1" },
      { id: "late", status: "overdue" as const, firstClaimAt: t(2), ownerId: "u2" },
      { id: "unpaid-b", status: "unpaid" as const, firstClaimAt: t(5), ownerId: "u3" },
      { id: "unpaid-a", status: "unpaid" as const, firstClaimAt: t(4), ownerId: "u4" },
      { id: "sent", status: "sent" as const, firstClaimAt: t(9), ownerId: "u5" },
    ];
    expect([...rows].sort(compareLedger).map((r) => r.id)).toEqual(["sent", "unpaid-a", "unpaid-b", "late", "paid"]);
  });
  it("breaks a tie on equal status and first claim by owner id, whatever the input order", () => {
    const at = new Date(Date.UTC(2026, 9, 13, 3));
    const x = { status: "unpaid" as const, firstClaimAt: at, ownerId: "b-owner" };
    const y = { status: "unpaid" as const, firstClaimAt: at, ownerId: "a-owner" };
    expect([x, y].sort(compareLedger)).toEqual([y, x]);
    expect([y, x].sort(compareLedger)).toEqual([y, x]);
  });
});

describe("bonusAllowance", () => {
  it("is 10% of N, at least one", () => expect([2, 6, 12, 20, 30, 50].map(bonusAllowance)).toEqual([1, 1, 1, 2, 3, 5]));
});
