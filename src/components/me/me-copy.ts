import type { MyBreak } from "@/domain/lines/queries";
import type { CellData } from "@/components/grid/cell-label";
import type { Owe } from "@/components/break/use-pay-sheet";
import { ordinal } from "@/lib/list";

/**
 * Where the viewer's lines in one break stand: cancelled first, then wins (an unanswered choice, shipped, else the best
 * award; awards arrive by ascending rank), then what is still owed.
 */
export function stateLine(g: Pick<MyBreak, "status" | "unsent" | "sent" | "awards">, hostName: string): string {
  if (g.status === "cancelled") return "Cancelled.";
  if (g.awards.some((a) => a.choice && a.pickedAt === null)) return `Won. Tell ${hostName} your choice.`;
  if (g.awards.length > 0 && g.awards.every((a) => a.shippedAt)) return "Shipped.";
  const best = g.awards[0];
  if (best) {
    if (best.rank === 1) return best.itemName ? `Won ${best.itemName}.` : "Won the top spot.";
    return best.itemName ? `Won ${ordinal(best.rank)} place: ${best.itemName}.` : `Won ${ordinal(best.rank)} place.`;
  }
  if (g.unsent.length > 0) return "Unpaid.";
  if (g.sent.length > 0) return `Sent. ${hostName} will tick you off when it arrives.`;
  return "Paid.";
}

export const howToPayLabel = (hostName: string) => `How to pay ${hostName}`;

/** Everything one /me card needs, already decided and serialisable. */
export type MyBreakCardProps = {
  breakId: string; title: string; status: string; hostName: string; payee: string;
  handles: { venmo?: string; paypal?: string }; instructions: string; commitment: string | null;
  cells: CellData[]; stateLine: string; owe: Owe | null;
};
