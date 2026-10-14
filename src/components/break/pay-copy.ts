import { formatMoney } from "@/lib/money";
import { joinAnd } from "@/lib/list";

export const SENT_HINT = "No need to comment Sent on Facebook.";
export const SENT_HINT_KEY = "breaks.sentHintSeen";

export const payHeadline = (cents: number, payee: string) => `Send ${formatMoney(cents)} to ${payee}`;
/** Follows "Pay by <LocalTime>" in the sheet; the deadline itself is rendered in the viewer's zone. */
export const releaseText = (hostName: string) => `or ${hostName} can release your lines.`;

export function giveBackPrompt(numbers: readonly number[]): { text: string; confirm: string } {
  if (numbers.length === 1) return { text: `Give back line ${numbers[0]}? It goes back on the board.`, confirm: "Give back 1 line" };
  return { text: `Give back lines ${joinAnd(numbers)}? They go back on the board.`, confirm: `Give back ${numbers.length} lines` };
}

export const retryRandomLabel = (n: number) => (n === 1 ? "Take a random open line instead" : `Take ${n} random open lines instead`);

export const commitmentShort = (c: string | null) => (c ? c.slice(0, 12) : null);
