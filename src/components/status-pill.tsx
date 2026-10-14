import { statusWord, type BreakStatus } from "./status-word";

const TONE: Record<BreakStatus, string> = {
  draft: "border-wire-strong text-ink-2",
  open: "border-ink text-ink",
  filled: "border-ink bg-ink text-card",
  drawing: "border-wire-strong text-ink",
  drawn: "border-green text-green",
  cancelled: "border-red text-red",
};

/** The word carries the state; the border and fill only reinforce it. */
export function StatusPill({ status }: { status: string }) {
  const tone = TONE[status as BreakStatus] ?? TONE.draft;
  return <span className={`inline-flex h-6 items-center rounded-full border px-2.5 text-micro font-medium ${tone}`}>{statusWord(status)}</span>;
}
