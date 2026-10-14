import Link from "next/link";
import type { FeedBreak, ThumbCell } from "@/domain/breaks/feed";
import { GridPreview } from "@/components/grid/grid-preview";
import { FillBar } from "@/components/fill-bar";
import { formatMoney } from "@/lib/money";
import { hostedByText, leftText, trustText } from "@/components/break/frame-copy";

/** A feed card (design §5.3): 96-pt mini grid, title, "19 of 50 left" with the fill bar, "$5 a line", host and trust line. */
export function BreakCard({ b, cells }: { b: FeedBreak; cells: ThumbCell[] }) {
  const hostRef = b.host.handle ? `@${b.host.handle}` : b.host.displayName ?? "the host";
  return (
    <li data-testid="break-card" className="rounded-card border border-wire bg-card">
      <Link href={`/b/${b.id}`} className="flex gap-3 p-3">
        <GridPreview count={b.lineCount} cells={cells.map((c) => ({ ...c, mine: false, overdue: false }))} size={96} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="line-clamp-2 font-semibold">{b.title}</span>
          <span className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-condensed text-[20px] leading-6 font-semibold tabular">{leftText(b.open, b.lineCount)}</span>
            <span className="text-small text-ink-2">{formatMoney(b.linePriceCents)} a line</span>
          </span>
          <FillBar total={b.lineCount} paid={b.paid} taken={b.taken} label={`${b.paid} of ${b.lineCount} paid, ${b.taken} taken`} />
          <span className="text-small text-ink-2">{hostedByText(hostRef, trustText(b.host))}</span>
        </span>
      </Link>
    </li>
  );
}
