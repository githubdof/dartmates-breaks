import Link from "next/link";
import type { FeedBreak, ThumbCell } from "@/domain/breaks/feed";
import { formatMoney } from "@/lib/money";
import { hostedByText, toGoText, trustText } from "@/components/break/frame-copy";
import { KitThumb } from "@/components/kit-thumb";
import { kitThumbCells } from "@/components/kit-thumb-model";

/**
 * A feed card on the wall (Mosaic §8): the kit-framed thumbnail under the break's lamp, then the title, "12 to go",
 * "$5 a line" and the host. No fill bar: the framed thumbnail is the fill. The feed, the landing page and the host
 * profile all use it, so every card is framed in its own host's kit.
 */
export function BreakCard({ b, cells, onPaper = false }: { b: FeedBreak; cells: ThumbCell[]; onPaper?: boolean }) {
  // The host profile is still on paper until Task 15b: it keeps the paper inks, everywhere else the wall inks.
  const ink = onPaper
    ? { main: "var(--ink)", price: "var(--ink-2)", host: "var(--ink-2)" }
    : { main: "var(--board-text)", price: "var(--board-text-2)", host: "var(--board-text-3)" };
  const hostRef = b.host.handle ? `@${b.host.handle}` : b.host.displayName ?? "the host";
  return (
    <li data-testid="break-card">
      <Link href={`/b/${b.id}`} className="flex items-center gap-3 py-2">
        <KitThumb cells={kitThumbCells(cells)} kit={b.kit} heat={b.heat} size={96} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="line-clamp-2 font-semibold" style={{ color: ink.main }}>{b.title}</span>
          <span className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-condensed text-[20px] leading-6 font-semibold tabular" style={{ color: ink.main }}>{toGoText(b.open)}</span>
            <span className="text-small" style={{ color: ink.price }}>{formatMoney(b.linePriceCents)} a line</span>
          </span>
          <span className="text-small" style={{ color: ink.host }}>{hostedByText(hostRef, trustText(b.host))}</span>
        </span>
      </Link>
    </li>
  );
}
