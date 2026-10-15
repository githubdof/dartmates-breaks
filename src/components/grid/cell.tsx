import type { CSSProperties } from "react";
import { FLIGHT_COLOURS, type FlightShape } from "@/domain/flights";
import { cellLabel, type CellData } from "./cell-label";
import { cellMetrics } from "./cell-metrics";

/** md: the board. xs: legend mini cells (16 px). thumb: feed and hero thumbnails (no number, no glyph). */
export type CellSize = "md" | "xs" | "thumb";
/** member: holders' flights, which shapeGrid set; kit: the host's kit only, for anyone who holds no line here (Mosaic §6). */
export type BoardView = "member" | "kit";

type Props = {
  cell: CellData;
  view?: BoardView;
  size?: CellSize;
  /** A fixed pixel size (legend, previews, render tests). Without it the cell fills its track and container queries size it. */
  px?: number;
  selected?: boolean;
  /** Sniped: a selected line someone else just took (client-only, until the next tap). */
  struck?: boolean;
  disabled?: boolean;
  label?: string;
  testId?: string;
  tabIndex?: number;
  onPress?: (n: number) => void;
};

type CSSVars = CSSProperties & Record<`--${string}`, string>;
type GlyphKind = "filled" | "outline" | "on-face" | "kit" | "kit-paid" | "won" | "won-kit";

/** Which glyph the §5 table puts top-right, if any. Overdue: the "!" takes its place. Kit view: always the standard shape. */
function glyphOf(c: CellData, view: BoardView): { kind: GlyphKind; shape: FlightShape } | null {
  if (c.overdue) return null;
  if (c.place) return view === "member" && c.flight ? { kind: "won", shape: c.flight.shape } : { kind: "won-kit", shape: "standard" };
  if (c.state === "open" || c.state === "reserved") return null;
  if (view === "kit") return { kind: c.state === "paid" ? "kit-paid" : "kit", shape: "standard" };
  if (!c.flight) return null;
  if (c.state === "paid") return { kind: "on-face", shape: c.flight.shape };
  return { kind: c.mine && c.state === "taken" ? "outline" : "filled", shape: c.flight.shape };
}

/**
 * --face, --num and --fc (Mosaic §7): the pre-rendered overlay's colour, the number's ink on it, the glyph's fill.
 * Set on every claimed cell so the paid overlay can fade in. The kit view never sets --fc (no flight leaves shapeGrid for it).
 */
function faceVars(c: CellData, view: BoardView): CSSVars {
  if (c.state === "open" || c.state === "reserved") return {};
  if (view === "kit") return { "--face": "var(--kit-dark)", "--num": "var(--board-cream)" };
  if (!c.flight) return {};
  const f = FLIGHT_COLOURS[c.flight.colour];
  return { "--face": f.face, "--num": f.ink, "--fc": f.face };
}

function sizeVars(size: CellSize, px: number | undefined, c: CellData): CSSVars | undefined {
  if (size === "xs") return { "--g": "8px", "--gi": "1px" }; // legend minis, recorded ruling 20
  if (size === "thumb") return { "--disc": "48%" }; // thumbnails, recorded ruling 20
  if (px === undefined) return undefined;
  const m = cellMetrics(px, { mine: c.mine, place: c.place ?? null });
  return { "--g": `${m.glyph}px`, "--gi": `${m.inset}px`, "--disc": `${m.disc}px`, "--ns": `${m.num}px` };
}

/** One board cell (Mosaic §5). Shape carries state; the face only adds hue. Styles: the board cell block in globals.css. */
export function Cell({ cell, view = "member", size = "md", px, selected = false, struck = false, disabled = false, label, testId, tabIndex, onPress }: Props) {
  const won = !!cell.place;
  const claimed = !won && (cell.state === "taken" || cell.state === "sent");
  const marks = size !== "thumb";
  const glyph = marks ? glyphOf(cell, view) : null;
  const flight = view === "member" ? cell.flight ?? null : null;
  const darkFace = won || (cell.state === "paid" && !!flight && FLIGHT_COLOURS[flight.colour].tier === "dark");
  const numClass = ["bc-num font-condensed font-semibold tabular", claimed && "bc-chip"].filter(Boolean).join(" ");
  // Task 3's named face and ink, with Mosaic values, so tests never key on a class name (recorded ruling 19).
  const face = won ? "won" : cell.state === "reserved" ? "reserved" : claimed ? "hatch" : cell.state === "paid" ? "face" : "cream";
  const numInk = won ? "ink" : cell.state === "reserved" ? "ink-2" : cell.state === "paid" ? (view === "kit" || darkFace ? "cream" : "ink") : "ink";

  const body = (
    <span aria-hidden className="bc-in" style={sizeVars(size, px, cell)}>
      <span className="bc-face" />
      {claimed && marks && <span className="bc-hatch" />}
      {claimed && view === "kit" && <span className="bc-band" data-mark="band" />}
      {cell.state === "reserved" && marks && <span className="bc-double" data-mark="reserved-rule" />}
      {cell.state === "reserved" && size === "md" && <span className="bc-m text-micro" data-mark="mini-label">m</span>}
      {won && <span className="bc-bull" data-place={cell.place} data-mark="bull"><span className="bc-bull-ring" /></span>}
      {/* No yours ring on a won cell: the bull and its place ring are the only extra mark (Mosaic §5, recorded ruling 19). */}
      {cell.mine && !won && marks && <span className="bc-ring" data-ring={darkFace ? "cream-out" : "ink-out"} data-mark="ring" />}
      {cell.overdue && marks && <span className="bc-overdue" data-mark="overdue-edge" />}
      {selected && <span className="bc-brackets" data-mark="brackets"><i /><i /><i /><i /></span>}
      {/* Weight 600 in every state, selected included: 700 is not loaded. */}
      {size === "md" && (
        <span className={numClass} data-ink={numInk}>
          {cell.number}
          {struck && <span className="bc-strike" data-mark="strike" />}
        </span>
      )}
      {cell.mine && cell.state === "sent" && marks && <span className="bc-sent" data-mark="sent" />}
      {glyph && (
        <svg className="bc-glyph" data-glyph={glyph.kind} viewBox="0 0 16 16">
          <use className="bc-knock" href={`#flight-${glyph.shape}`} />
          <use className="bc-mark" href={`#flight-${glyph.shape}`} />
        </svg>
      )}
      {cell.overdue && size === "md" && <span className="bc-bang text-micro font-semibold" data-mark="overdue-glyph">!</span>}
    </span>
  );

  const style: CSSVars = { ...faceVars(cell, view), ...(px !== undefined ? { width: px, height: px } : {}) };
  const data = {
    "data-state": cell.state,
    "data-size": size,
    "data-mine": cell.mine ? "true" : undefined,
    "data-won": cell.place ?? undefined,
    "data-flight": flight ? `${flight.colour}-${flight.shape}` : undefined,
    "data-face": face,
    "data-bonus": cell.bonus ? "true" : undefined,
    "data-overdue": cell.overdue ? "true" : undefined,
    "data-selected": selected ? "true" : undefined,
    "data-struck": struck ? "true" : undefined,
  };
  const name = label ?? cellLabel(cell, { struck, foldSent: true });
  const base = "bc relative block aspect-square w-full select-none";
  if (!onPress) {
    // data-cell on display roots too, so the reveal can find its target cells (Task 12b).
    return <div role="img" data-cell={cell.number} {...data} aria-label={name} style={style} className={base}>{body}</div>;
  }
  return (
    <button
      type="button"
      data-cell={cell.number}
      data-testid={testId}
      {...data}
      aria-label={name}
      aria-pressed={cell.state === "open" ? selected : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={tabIndex}
      onClick={() => onPress(cell.number)}
      style={style}
      className={`${base} touch-manipulation ${disabled ? "cursor-default" : "cursor-pointer"}`}
    >
      {body}
    </button>
  );
}
