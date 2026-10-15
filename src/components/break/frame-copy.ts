import type { ClaimMode } from "@/domain/breaks/rules";
import { joinAnd, ordinal, plural } from "@/lib/list";
import { daysSince, formatMonthYear } from "@/lib/time";
import { formatMoney } from "@/lib/money";

/** Retired on the break page (Mosaic §9); the feed card and the link-preview caption drop it in Plan C Tasks 15a and 14. */
export const leftText = (open: number, total: number) => `${open} of ${total} left`;
/** The checkout count (Mosaic §9): open numbered lines, "12 to go". A text swap, never rolled. */
export const toGoText = (open: number) => `${open} to go`;
/** The media row (Mosaic §8): "50 lines, $5 a line". */
export const mediaText = (lineCount: number, priceCents: number) => `${lineCount} lines, ${formatMoney(priceCents)} a line`;
export const payWithinText = (hours: number) => `Pay within ${hours} ${plural(hours, "hour", "hours")}.`;

/** The one name for the host on a break page: display name, else "@handle", else "the host". */
export const hostLabel = (h: { displayName: string | null; handle: string | null }) =>
  h.displayName ?? (h.handle ? `@${h.handle}` : "the host");

/** "Hosted by @jim. New host." on the break page and on feed cards. */
export const hostedByText = (hostRef: string, trust: string) => `Hosted by ${hostRef}. ${trust}.`;

/** "Pay within 24 hours. Hosted by @jim. New host." The pay window only means something while the break is open. */
export function smallLineText(status: string, paymentWindowHours: number, hostRef: string, trust: string): string {
  const hosted = hostedByText(hostRef, trust);
  return status === "open" ? `${payWithinText(paymentWindowHours)} ${hosted}` : hosted;
}

export function youHaveText(numbers: readonly number[]): string | null {
  if (numbers.length === 0) return null;
  return numbers.length === 1 ? `You have line ${numbers[0]}.` : `You have ${joinAnd(numbers)}.`;
}

/** Interim trust line (design §5.3) until the reputation plan adds "98% would buy again". */
export function trustText(t: { breaksRun: number; since: Date }): string {
  return t.breaksRun < 5 ? "New host" : `${t.breaksRun} breaks run since ${formatMonthYear(t.since)}`;
}

/**
 * The host record (Mosaic §9) on the profile and in the ledger header: counts only, and no other state words.
 * "41 breaks run since Mar 2026. 40 draws verified." Never "0 breaks run" (Plan B).
 */
export function hostRecordText(t: { breaksRun: number; drawsVerified: number; since: Date }): string {
  if (t.breaksRun === 0) return "No breaks run yet.";
  return `${t.breaksRun} ${plural(t.breaksRun, "break", "breaks")} run since ${formatMonthYear(t.since)}. ${t.drawsVerified} ${plural(t.drawsVerified, "draw", "draws")} verified.`;
}

/** Retired with the profile's move to the wall (Plan C Task 15b): hostRecordText replaces it. */
export function profileTrustText(t: { breaksRun: number; since: Date }): string {
  if (t.breaksRun === 0) return "New host. No breaks run yet.";
  if (t.breaksRun < 5) return `New host. ${t.breaksRun} ${plural(t.breaksRun, "break", "breaks")} run.`;
  return `${t.breaksRun} breaks run since ${formatMonthYear(t.since)}.`;
}

/** The platform §9 stall line, written as the first design writes it: no em-dash, no retired state word. */
export const stallText = (days: number) => `Closed ${days} ${plural(days, "day", "days")} ago, not drawn yet.`;

/** The record, then the stall line while a Closed break has waited 3 days or more for its draw: never only good news. */
export function hostRecordLines(t: { breaksRun: number; drawsVerified: number; since: Date; stalledSince: Date | null }, now: Date): string[] {
  const days = t.stalledSince ? daysSince(t.stalledSince, now) : null;
  return days !== null && days >= 3 ? [hostRecordText(t), stallText(days)] : [hostRecordText(t)];
}

export const pastText = (n: number) => (n === 0 ? "No past breaks yet." : `${n} past ${plural(n, "break", "breaks")}.`);

export function orList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

export function prizeLines(prizes: readonly { rank: number; itemId: string | null }[], items: readonly { id: string; name: string }[]): string[] {
  const nameOf = new Map(items.map((i) => [i.id, i.name]));
  const byRank = new Map<number, string[]>();
  for (const p of prizes) {
    const name = p.itemId ? nameOf.get(p.itemId) : undefined;
    if (name) byRank.set(p.rank, [...(byRank.get(p.rank) ?? []), name]);
  }
  return [...byRank.entries()].sort(([a], [b]) => a - b).map(([rank, names]) => {
    const who = rank === 1 ? "Top spot gets" : `${ordinal(rank)} place gets`;
    return names.length === 1 ? `${who} ${names[0]}.` : `${who} a choice: ${orList(names)}.`;
  });
}

const PICKING: Record<ClaimMode, string> = {
  pick_or_random: "Pick your lines or take random ones.",
  pick_only: "Pick your lines. No randoms.",
  straight: "Straight fill. Lines go out in order.",
};
export const pickingText = (mode: ClaimMode) => PICKING[mode];

export const perPersonText = (max: number | null) => (max === null ? "No limit per person." : `Up to ${max} ${plural(max, "line", "lines")} per person.`);

export const closesText = (hostName: string) => `When every line is paid, the break closes and ${hostName} runs the draw.`;
