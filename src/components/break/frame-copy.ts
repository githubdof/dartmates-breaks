import type { ClaimMode } from "@/domain/breaks/rules";
import { joinAnd, ordinal, plural } from "@/lib/list";
import { formatMonthYear } from "@/lib/time";

export const leftText = (open: number, total: number) => `${open} of ${total} left`;
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
 * The profile's one-sentence trust line (design §5.9, interim). Never "0 breaks run"; the date only from 5 breaks on,
 * where the page drops its separate "On Breaks since" line so the date is never said twice.
 */
export function profileTrustText(t: { breaksRun: number; since: Date }): string {
  if (t.breaksRun === 0) return "New host. No breaks run yet.";
  if (t.breaksRun < 5) return `New host. ${t.breaksRun} ${plural(t.breaksRun, "break", "breaks")} run.`;
  return `${t.breaksRun} breaks run since ${formatMonthYear(t.since)}.`;
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
