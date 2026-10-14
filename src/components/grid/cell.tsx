import { cellLabel, type CellData } from "./cell-label";

export type CellSize = "md" | "sm" | "xs";

type Props = {
  cell: CellData;
  size?: CellSize;
  /** Standalone cell (legend, mini cells): border on all four sides. */
  boxed?: boolean;
  selected?: boolean;
  /** A selected line someone else just took. */
  struck?: boolean;
  disabled?: boolean;
  label?: string;
  testId?: string;
  tabIndex?: number;
  onPress?: (n: number) => void;
};

const NUMBER_SIZE: Record<CellSize, string> = { md: "text-grid", sm: "text-[13px] leading-none", xs: "hidden" };

function numberColour(c: CellData): string {
  // Paid cells are always white on black, yours included: green on ink is 3.9:1 (recorded erratum 1).
  // "Mine" on a paid cell is the white corner flag plus "yours" in the accessible name.
  if (c.state === "paid") return "text-card";
  if (c.overdue) return "text-ink"; // overdue (host only): ink number on the chip
  if (c.state === "taken" || c.state === "reserved") return "text-ink-2";
  return "text-ink";
}

/** One board segment. Shape carries state (design §4): hatch, dashed edge, ink face, corner flag, glyphs. */
export function Cell({ cell, size = "md", boxed = false, selected = false, struck = false, disabled = false, label, testId, tabIndex, onPress }: Props) {
  const paidFace = cell.state === "paid";
  const hatched = cell.state === "taken" || cell.state === "sent";
  const face = paidFace ? "bg-ink" : hatched ? "bg-hatch" : "bg-card";
  const edge = boxed ? "border border-wire-strong" : "border-r border-b border-wire-strong";
  const chip = hatched || cell.state === "reserved";
  const flag = size === "xs" ? "border-l-[5px] border-t-[5px]" : "border-l-[10px] border-t-[10px]";
  const glyphs = size !== "xs";

  const body = (
    <>
      <span aria-hidden className={`${NUMBER_SIZE[size]} font-condensed font-semibold tabular ${chip ? "bg-card px-0.5" : ""} ${numberColour(cell)} ${struck ? "line-through decoration-red decoration-2" : ""}`}>
        {cell.number}
      </span>
      {cell.state === "sent" && <span aria-hidden className="pointer-events-none absolute inset-0 border-2 border-dashed border-ink" />}
      {cell.overdue && <span aria-hidden className="pointer-events-none absolute inset-0 border-2 border-red" />}
      {cell.overdue && glyphs && <span aria-hidden className="absolute right-1 bottom-0.5 text-micro font-semibold text-red">!</span>}
      {cell.state === "reserved" && <span aria-hidden className="pointer-events-none absolute inset-0.5 border-[3px] border-double border-wire-strong" />}
      {cell.state === "reserved" && glyphs && <span aria-hidden className="absolute top-0.5 left-1 text-micro text-ink-2">m</span>}
      {selected && <span aria-hidden className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_3px_var(--ink)]" />}
      {/* Selected keeps weight 600: 700 is not loaded (recorded erratum 2); the ring and the check carry it. */}
      {selected ? (
        glyphs && <span aria-hidden className="absolute top-0 right-0.5 text-micro font-semibold text-ink">✓</span>
      ) : cell.mine ? (
        <span aria-hidden className={`absolute top-0 right-0 h-0 w-0 border-l-transparent ${flag} ${paidFace ? "border-t-card" : "border-t-green"}`} />
      ) : cell.bonus && glyphs ? (
        <span aria-hidden className={`absolute top-0 right-1 text-micro font-semibold ${paidFace ? "text-card" : "text-ink"}`}>+</span>
      ) : null}
      {/* Bonus and mine: the flag takes the corner, so the "+" moves to the bottom left and both marks survive. */}
      {!selected && cell.mine && cell.bonus && glyphs && (
        <span aria-hidden className={`absolute bottom-0.5 left-1 text-micro font-semibold ${paidFace ? "text-card" : "text-ink"}`}>+</span>
      )}
    </>
  );

  const base = `relative flex aspect-square w-full items-center justify-center select-none ${face} ${edge} transition-colors duration-[120ms] motion-reduce:transition-none`;
  if (!onPress) {
    return <div role="img" aria-label={label ?? cellLabel(cell)} className={base}>{body}</div>;
  }
  return (
    <button
      type="button"
      data-cell={cell.number}
      data-testid={testId}
      data-state={cell.state}
      aria-label={label ?? cellLabel(cell)}
      aria-pressed={cell.state === "open" ? selected : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={tabIndex}
      onClick={() => onPress(cell.number)}
      className={`${base} touch-manipulation focus-visible:z-10 ${disabled ? "cursor-default" : "cursor-pointer"}`}
    >
      {body}
    </button>
  );
}
