import { CapExceeded, InvalidInput } from "@/domain/errors";
import { SELF_CLAIM_SHARE, GLOBAL_UNPAID_CAP } from "@/domain/breaks/rules";

export function isOverdue(l: { claimedAt: Date | null; sentAt: Date | null; paidAt: Date | null; ownerId: string | null }, b: { paymentWindowHours: number }, now = new Date()): boolean {
  if (!l.ownerId || !l.claimedAt || l.paidAt || l.sentAt) return false;
  return l.claimedAt.getTime() + b.paymentWindowHours * 3600_000 < now.getTime();
}

export function validateNumbers(numbers: number[], lineCount: number): number[] {
  const uniq = [...new Set(numbers)];
  if (uniq.length === 0) throw new InvalidInput("Pick at least one line");
  for (const n of uniq) if (!Number.isInteger(n) || n < 1 || n > lineCount) throw new InvalidInput(`Line ${n} does not exist`);
  return uniq.sort((a, b) => a - b);
}

/** Caps after this claim would land. `heldByCaller` counts lines the caller already owns in this break. */
export function assertCaps(p: { requested: number; heldByCaller: number; maxLinesPerUser: number | null; isHost: boolean; lineCount: number; globalUnpaid: number }): void {
  const after = p.heldByCaller + p.requested;
  if (p.maxLinesPerUser !== null && after > p.maxLinesPerUser) throw new CapExceeded("lines per person", p.maxLinesPerUser);
  if (p.isHost) {
    // No max(1, …) here: that floor belongs to the bonus-line rule (Plan 2), not the self-claim cap.
    const hostCap = Math.floor(p.lineCount * SELF_CLAIM_SHARE);
    if (after > hostCap) throw new CapExceeded("host-held lines", hostCap);
  }
  if (p.globalUnpaid + p.requested > GLOBAL_UNPAID_CAP) throw new CapExceeded("open unpaid claims", GLOBAL_UNPAID_CAP);
}
