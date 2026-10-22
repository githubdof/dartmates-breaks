import Link from "next/link";
import type { FeedBreak, ThumbCell } from "@/domain/breaks/feed";
import { formatMoney } from "@/lib/money";
import { hostedByText, toGoText, trustText } from "@/components/break/frame-copy";
import { KitThumb } from "@/components/kit-thumb";
import { kitThumbCells } from "@/components/kit-thumb-model";
import { Plate } from "@/components/photos/plate";
import type { PhotoSrc } from "@/photos/urls";

/**
 * A feed card on the wall (Mosaic §8): the kit-framed thumbnail under the break's lamp, then the title, "12 to go",
 * "$5 a line" and the host. No fill bar: the framed thumbnail is the fill. The feed, the landing page and the host
 * profile all use it, so every card is framed in its own host's kit. With a lead photo the plate takes the thumbnail's
 * 108 px slot and the kit board shrinks to the corner, so the fill still shows and the caption never moves.
 */
export function BreakCard({ b, cells, photo }: { b: FeedBreak; cells: ThumbCell[]; photo?: PhotoSrc | null }) {
  const hostRef = b.host.handle ? `@${b.host.handle}` : b.host.displayName ?? "the host";
  return (
    <li data-testid="break-card">
      <Link href={`/b/${b.id}`} className="flex items-center gap-3 py-2">
        <span data-testid="card-media" className={`relative block w-[108px] shrink-0${photo ? " h-[108px]" : ""}`}>
          {photo ? (
            <>
              <Plate photo={photo} size={96} surface="board" decorative />
              <span className="absolute right-0 bottom-0 block"><KitThumb cells={kitThumbCells(cells)} kit={b.kit} heat={b.heat} size={48} /></span>
            </>
          ) : (
            <KitThumb cells={kitThumbCells(cells)} kit={b.kit} heat={b.heat} size={96} />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="line-clamp-2 font-semibold" style={{ color: "var(--board-text)" }}>{b.title}</span>
          <span className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-condensed text-[20px] leading-6 font-semibold tabular" style={{ color: "var(--board-text)" }}>{toGoText(b.open)}</span>
            <span className="text-small" style={{ color: "var(--board-text-2)" }}>{formatMoney(b.linePriceCents)} a line</span>
          </span>
          <span className="text-small" style={{ color: "var(--board-text-3)" }}>{hostedByText(hostRef, trustText(b.host))}</span>
        </span>
      </Link>
    </li>
  );
}
