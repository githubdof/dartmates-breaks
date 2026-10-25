import type { MyBreak } from "@/domain/lines/queries";
import type { Flight } from "@/domain/flights";
import { formatDateTime, formatDeadline, type Zone } from "@/lib/time";
import type { PhotoSrc } from "@/photos/urls";
import { hostLabel } from "@/components/break/frame-copy";
import { bonusGoesWith, commitmentShort, payeeFor } from "@/components/break/pay-copy";
import { stateLine, unpaidNote, type MyBreakCardProps } from "@/components/me/me-copy";

/**
 * One /me group → the card's props. Your own lines only, each in your stored flight (Mosaic §8): no other holder's
 * data, no place (the state line carries a win), no kit, no heat. The deadline goes down as ISO plus a fallback in
 * the viewer's zone (LocalTime).
 */
export function toCardProps(
  g: MyBreak, now: Date, zone: Zone, flight: Flight,
  photos?: { photo: PhotoSrc | null; notice: { text: string; at: Date } | null },
): MyBreakCardProps {
  const hostName = hostLabel(g.host);
  // Only an open or closed (filled) break asks for money: a cancelled, running or ran one owes nothing here.
  const asksForMoney = g.status === "open" || g.status === "filled";
  return {
    breakId: g.breakId, title: g.title, status: g.status, hostName, payee: payeeFor(g.host.paymentHandles, hostName),
    handles: g.host.paymentHandles, instructions: g.paymentInstructions, commitment: commitmentShort(g.seedCommitment),
    cells: g.lines.map((l) => ({ number: l.number, state: l.state, mine: true, overdue: false, bonus: l.bonus, flight, place: null })),
    stateLine: stateLine(g, hostName),
    photo: photos?.photo ?? null,
    photoNotice: photos?.notice
      ? { text: photos.notice.text, iso: photos.notice.at.toISOString(), fallback: formatDateTime(photos.notice.at, zone.tz, zone.labelled) }
      : null,
    unpaidNote: !asksForMoney && g.status !== "cancelled" && g.unsent.length > 0 ? unpaidNote(g.unsent, hostName) : null,
    owe: asksForMoney && g.unsent.length > 0
      ? {
          numbers: g.unsent, cents: g.owedCents,
          payByIso: g.payBy ? g.payBy.toISOString() : null,
          payByFallback: g.payBy ? formatDeadline(g.payBy, now, zone.tz, zone.labelled) : null,
          late: g.late,
          bonusLost: bonusGoesWith(g.lines, g.unsent),
        }
      : null,
  };
}
