import type { MyBreak } from "@/domain/lines/queries";
import { formatDeadline, type Zone } from "@/lib/time";
import { hostLabel } from "@/components/break/frame-copy";
import { commitmentShort, payeeFor } from "@/components/break/pay-copy";
import { stateLine, type MyBreakCardProps } from "@/components/me/me-copy";

/** One /me group → the card's props. The deadline goes down as ISO plus a fallback in the viewer's zone (LocalTime). */
export function toCardProps(g: MyBreak, now: Date, zone: Zone): MyBreakCardProps {
  const hostName = hostLabel(g.host);
  return {
    breakId: g.breakId, title: g.title, status: g.status, hostName, payee: payeeFor(g.host.paymentHandles, hostName),
    handles: g.host.paymentHandles, instructions: g.paymentInstructions, commitment: commitmentShort(g.seedCommitment),
    cells: g.lines.map((l) => ({ number: l.number, state: l.state, mine: true, overdue: false, bonus: l.bonus })),
    stateLine: stateLine(g, hostName),
    // Only an open or closed (filled) break asks for money: a cancelled or ran one owes nothing here.
    owe: (g.status === "open" || g.status === "filled") && g.unsent.length > 0
      ? {
          numbers: g.unsent, cents: g.owedCents,
          payByIso: g.payBy ? g.payBy.toISOString() : null,
          payByFallback: g.payBy ? formatDeadline(g.payBy, now, zone.tz, zone.labelled) : null,
          late: g.late,
        }
      : null,
  };
}
