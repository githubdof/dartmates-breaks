import type { Allowance } from "@/domain/breaks/grid";
import type { ClaimMode } from "@/domain/breaks/rules";
import type { BreakStatus } from "@/components/status-word";
import { formatMoney } from "@/lib/money";
import { plural } from "@/lib/list";
import { selectionSummary } from "./selection";

export type BarInput = {
  status: BreakStatus;
  signedIn: boolean;
  claimMode: ClaimMode;
  selected: readonly number[];
  priceCents: number;
  openCount: number;
  allowance: Allowance;
  /** Unpaid lines not yet marked sent. */
  owe: { cents: number; numbers: readonly number[] } | null;
  justSent: boolean;
  hostName: string;
  payee: string;
  closedDaysAgo: number | null;
};

export type Bar =
  | { kind: "none" }
  | { kind: "message"; text: string }
  | { kind: "result" }
  | { kind: "selection"; summary: string; action: "claim" | "sign-in"; label: string }
  | { kind: "owe"; summary: string }
  | { kind: "idle"; note: string | null; stepper: { max: number; action: "random" | "next" } | null; lastN: number | null; hint: string | null; signIn: boolean };

export function limitText(a: Allowance): string {
  const lines = `${a.limit} ${plural(a.limit, "line", "lines")}`;
  switch (a.reason) {
    case "per_person": return `You can hold ${lines} in this break.`;
    case "host": return `Hosts can hold ${lines} in their own break.`;
    case "global": return `You can have ${a.limit} unpaid lines across breaks. Pay for some first.`;
  }
}

export const stepLabel = (action: "random" | "next", count: number) =>
  action === "next" ? (count === 1 ? "Claim the next line" : `Claim the next ${count}`) : `Claim ${count} random`;
export const lastLabel = (n: number) => (n === 1 ? "Take the last line" : `Take the last ${n}`);

/** The sticky bar has one job at a time (design §5.4). */
export function claimBar(i: BarInput): Bar {
  switch (i.status) {
    case "draft": return { kind: "none" };
    case "filled":
      return { kind: "message", text: i.closedDaysAgo !== null && i.closedDaysAgo >= 3 ? `Closed ${i.closedDaysAgo} days ago, not drawn yet.` : `Closed. Every line is paid. Waiting for ${i.hostName} to run the draw.` };
    case "drawing": return { kind: "message", text: `${i.hostName} started the draw. The result is in about a minute.` };
    case "drawn": return { kind: "result" };
    case "cancelled": return { kind: "message", text: `Cancelled by ${i.hostName}. Your refund comes from ${i.hostName}, not Breaks.` };
    case "open": break;
  }
  const n = i.selected.length;
  if (n > 0) {
    const lines = `${n} ${plural(n, "line", "lines")}`;
    return { kind: "selection", summary: selectionSummary(i.selected, i.priceCents), action: i.signedIn ? "claim" : "sign-in", label: i.signedIn ? `Claim ${lines}` : `Sign in to claim ${lines}` };
  }
  if (i.owe && i.owe.numbers.length > 0) return { kind: "owe", summary: `You owe ${formatMoney(i.owe.cents)} to ${i.payee}` };
  const note = i.justSent ? `Sent. ${i.hostName} will tick you off when it arrives.` : null;
  if (!i.signedIn) {
    // Signed out with nothing selected still gets a way in: on straight fill it is the only one.
    return { kind: "idle", note, stepper: null, lastN: null, hint: i.claimMode === "straight" ? "Straight fill. Sign in, then say how many." : "Tap the open lines you want.", signIn: true };
  }
  // Hosts cannot claim in a break under 10 lines (10% rounds down to 0): say nothing rather than "0 lines".
  if (i.allowance.reason === "host" && i.allowance.limit === 0) return { kind: "idle", note, stepper: null, lastN: null, hint: null, signIn: false };
  const max = Math.min(i.openCount, i.allowance.remaining);
  const limit = i.allowance.remaining === 0 ? limitText(i.allowance) : null;
  if (i.claimMode === "straight") {
    return { kind: "idle", note, stepper: max > 0 ? { max, action: "next" } : null, lastN: null, hint: limit ?? "Straight fill. Say how many; you get the next open numbers.", signIn: false };
  }
  const lastN = i.openCount > 0 && i.openCount <= 5 && i.allowance.remaining >= i.openCount ? i.openCount : null;
  const stepper = i.claimMode === "pick_or_random" && max > 0 ? { max, action: "random" as const } : null;
  return { kind: "idle", note, stepper, lastN, hint: limit ?? (i.claimMode === "pick_only" ? "Tap the open lines you want." : null), signIn: false };
}
