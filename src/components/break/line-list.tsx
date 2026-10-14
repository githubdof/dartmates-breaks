import type { GridCell } from "@/domain/breaks/grid";
import { cellStateWord } from "@/components/grid/cell-label";

/** The screenshot surface: title and link on top, one row per line; holders only where the server sent them. */
export function LineList({ cells, title, shareUrl }: { cells: GridCell[]; title: string; shareUrl: string }) {
  return (
    <div className="rounded-card border border-wire bg-card p-4">
      <p className="font-condensed text-headline font-semibold">{title}</p>
      <p className="break-all text-small text-ink-2">{shareUrl}</p>
      <ol aria-label="Lines" className="mt-3 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {cells.map((c) => (
          <li key={c.number} className="flex min-h-6 items-center gap-3 border-b border-wire-2 text-small">
            <span className="w-8 font-condensed text-grid font-semibold tabular">{c.number}</span>
            <span className="min-w-0 flex-1 truncate">{c.holder ? `@${c.holder}` : ""}</span>
            <span className="text-ink-2">{cellStateWord(c)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
