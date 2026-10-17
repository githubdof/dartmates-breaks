import { cellLabel, type CellData } from "./cell-label";

export type PaperCellSize = "md" | "sm" | "xs";

type Props = {
  cell: CellData;
  size?: PaperCellSize;
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

const NUMBER_SIZE: Record<PaperCellSize, string> = { md: "text-grid", sm: "text-[13px] leading-none", xs: "hidden" };

/** The face and the number's ink by name: tests read them from data-face and data-ink, never from class names. */
type Face = "card" | "hatch" | "ink";
type NumberInk = "card" | "ink" | "ink-2";
const FACE_CLASS: Record<Face, string> = { card: "bg-card", hatch: "bg-hatch", ink: "bg-ink" };
const INK_CLASS: Record<NumberInk, string> = { card: "text-card", ink: "text-ink", "ink-2": "text-ink-2" };

function faceOf(c: CellData): Face {
  if (c.state === "paid") return "ink";
  if (c.state === "taken" || c.state === "sent") return "hatch";
  return "card";
}

function numberInk(c: CellData): NumberInk {
  // Paid cells are always white on black, yours included: green on ink is 3.9:1 (recorded erratum 1).
  // "Mine" on a paid cell is the white corner flag plus "yours" in the accessible name.
  if (c.state === "paid") return "card";
  if (c.overdue) return "ink"; // overdue (host only): ink number on the chip
  if (c.state === "taken" || c.state === "reserved") return "ink-2";
  return "ink";
}

/**
 * A cell on paper (ledger rows, the pay sheet, /me until Plan C Task 18): the first design's §4, unchanged on purpose
 * (Mosaic §1.1: "paper, ink and hatch mini cells, no flight, no kit, no glyph"). The board uses ./cell.
 */
export function PaperCell({ cell, size = "md", boxed = false, selected = false, struck = false, disabled = false, label, testId, tabIndex, onPress }: Props) {
  const face = faceOf(cell);
  const paidFace = face === "ink";
  const hatched = face === "hatch";
  const ink = numberInk(cell);
  const edge = boxed ? "border border-wire-strong" : "border-r border-b border-wire-strong";
  const chip = hatched || cell.state === "reserved";
  const flag = size === "xs" ? "border-l-[5px] border-t-[5px]" : "border-l-[10px] border-t-[10px]";
  const glyphs = size !== "xs";
  // What tests key on: the state and the shape tokens as data attributes, so a restyle never moves a selector.
  const data = {
    "data-state": cell.state,
    "data-face": face,
    "data-mine": cell.mine || undefined,
    "data-bonus": cell.bonus || undefined,
    "data-overdue": cell.overdue || undefined,
    "data-selected": selected || undefined,
    "data-struck": struck || undefined,
  };

  const body = (
    <>
      <span aria-hidden data-ink={ink} className={`${NUMBER_SIZE[size]} font-condensed font-semibold tabular ${chip ? "bg-card px-0.5" : ""} ${INK_CLASS[ink]} ${struck ? "line-through decoration-red decoration-2" : ""}`}>
        {cell.number}
      </span>
      {cell.state === "sent" && <span aria-hidden data-mark="sent-edge" className="pointer-events-none absolute inset-0 border-2 border-dashed border-ink" />}
      {cell.overdue && <span aria-hidden data-mark="overdue-edge" className="pointer-events-none absolute inset-0 border-2 border-red" />}
      {cell.overdue && glyphs && <span aria-hidden data-mark="overdue-glyph" className="absolute right-1 bottom-0.5 text-micro font-semibold text-red">!</span>}
      {cell.state === "reserved" && <span aria-hidden data-mark="reserved-rule" className="pointer-events-none absolute inset-0.5 border-[3px] border-double border-wire-strong" />}
      {cell.state === "reserved" && glyphs && <span aria-hidden data-mark="mini-label" className="absolute top-0.5 left-1 text-micro text-ink-2">m</span>}
      {selected && <span aria-hidden data-mark="selected-ring" className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_3px_var(--ink)]" />}
      {/* Selected keeps weight 600: 700 is not loaded (recorded erratum 2); the ring and the check carry it. */}
      {selected ? (
        glyphs && <span aria-hidden data-mark="check" className="absolute top-0 right-0.5 text-micro font-semibold text-ink">✓</span>
      ) : cell.mine ? (
        <span aria-hidden data-mark={paidFace ? "flag-card" : "flag-green"} className={`absolute top-0 right-0 h-0 w-0 border-l-transparent ${flag} ${paidFace ? "border-t-card" : "border-t-green"}`} />
      ) : cell.bonus && glyphs ? (
        <span aria-hidden data-mark="bonus-glyph" className={`absolute top-0 right-1 text-micro font-semibold ${paidFace ? "text-card" : "text-ink"}`}>+</span>
      ) : null}
      {/* Bonus and mine: the flag takes the corner, so the "+" moves to the bottom left and both marks survive. */}
      {!selected && cell.mine && cell.bonus && glyphs && (
        <span aria-hidden data-mark="bonus-glyph" className={`absolute bottom-0.5 left-1 text-micro font-semibold ${paidFace ? "text-card" : "text-ink"}`}>+</span>
      )}
    </>
  );

  const base = `relative flex aspect-square w-full items-center justify-center select-none ${FACE_CLASS[face]} ${edge} transition-colors duration-[120ms] motion-reduce:transition-none`;
  if (!onPress) {
    return <div role="img" aria-label={label ?? cellLabel(cell)} {...data} className={base}>{body}</div>;
  }
  return (
    <button
      type="button"
      data-cell={cell.number}
      data-testid={testId}
      {...data}
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
