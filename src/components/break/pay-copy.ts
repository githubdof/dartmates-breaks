import { formatMoney } from "@/lib/money";
import { joinAnd } from "@/lib/list";

export const SENT_HINT = "No need to comment Sent on Facebook.";
export const SENT_HINT_KEY = "breaks.sentHintSeen";

export const payHeadline = (cents: number, payee: string) => `Send ${formatMoney(cents)} to ${payee}`;
/** Follows "Pay by <LocalTime>" in the sheet; the deadline itself is rendered in the viewer's zone. */
export const releaseText = (hostName: string) => `or ${hostName} can release your lines.`;
/** Past the deadline: follows "Payment was due <LocalTime>." */
export const lateReleaseText = (hostName: string) => `${hostName} can release your lines now.`;
/** Who to pay: the Venmo handle, else the PayPal.me link, else the host's name. */
export const payeeFor = (h: { venmo?: string; paypal?: string }, hostName: string) => h.venmo ?? (h.paypal ? `paypal.me/${h.paypal}` : hostName);

/** The buyer's bonus lines that a give-back of `givingBack` takes with it: all of them once no numbered line is left (ruling 6). */
export function bonusGoesWith(held: readonly { number: number; bonus: boolean }[], givingBack: readonly number[]): number[] {
  const bonus = held.filter((l) => l.bonus).map((l) => l.number).sort((a, b) => a - b);
  const keepsNumbered = held.some((l) => !l.bonus && !givingBack.includes(l.number));
  return bonus.length > 0 && !keepsNumbered ? bonus : [];
}

/** The give-back confirm names the lines, and any bonus line that goes with them, so nothing leaves the grid unannounced. */
export function giveBackPrompt(numbers: readonly number[], bonusLost: readonly number[] = []): { text: string; confirm: string } {
  const bonus = bonusLost.length === 0 ? ""
    : bonusLost.length === 1 ? ` Your bonus line ${bonusLost[0]} goes too.`
    : ` Your bonus lines ${joinAnd(bonusLost)} go too.`;
  if (numbers.length === 1) return { text: `Give back line ${numbers[0]}? It goes back on the board.${bonus}`, confirm: "Give back 1 line" };
  return { text: `Give back lines ${joinAnd(numbers)}? They go back on the board.${bonus}`, confirm: `Give back ${numbers.length} lines` };
}

export const retryRandomLabel = (n: number) => (n === 1 ? "Take a random open line instead" : `Take ${n} random open lines instead`);

export const commitmentShort = (c: string | null) => (c ? c.slice(0, 12) : null);

type OweShape = { numbers: number[]; cents: number; payByIso: string | null; payByFallback: string | null; late: boolean; bonusLost?: number[] };

/** The provisional amount shown before refreshed props land: what was owed, plus the lines just got. Nothing got, nothing provisional. */
export function nextPendingOwe(base: OweShape | null, got: readonly number[], priceCents: number): OweShape | null {
  if (got.length === 0) return null;
  return {
    numbers: [...(base?.numbers ?? []), ...got].sort((x, y) => x - y),
    cents: (base?.cents ?? 0) + got.length * priceCents,
    payByIso: base?.payByIso ?? null,
    payByFallback: base?.payByFallback ?? null,
    late: base?.late ?? false,
    // Giving back every owed line, the new ones included, still leaves no numbered line: the same bonus lines go.
    bonusLost: base?.bonusLost,
  };
}
