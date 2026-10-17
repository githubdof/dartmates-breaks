import Link from "next/link";
import { StatusPill } from "@/components/status-pill";

/**
 * One break in the plain history on /me (Mosaic §9): the title, its state word and the pill. No cells, no totals of
 * lines bought, money spent or wins, no win rate: a win shows once, on that break's result and as the state word.
 */
export function MyHistoryRow({ breakId, title, status, stateLine }: { breakId: string; title: string; status: string; stateLine: string }) {
  return (
    <li data-testid="me-history-row" className="flex min-h-11 items-center justify-between gap-3 py-1">
      <Link href={`/b/${breakId}`} className="inline-flex min-h-11 min-w-0 items-center underline-offset-4 hover:underline">{title}</Link>
      <span className="flex shrink-0 items-center gap-2 text-small">
        <span data-testid="my-state">{stateLine}</span>
        <StatusPill status={status} />
      </span>
    </li>
  );
}
