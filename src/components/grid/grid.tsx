import type { CSSProperties } from "react";
import type { GridCell } from "@/domain/breaks/grid";
import { DEFAULT_KIT, FLIGHT_COLOURS, type HeatStep, type Kit } from "@/domain/flights";
import { Cell, type BoardView } from "./cell";
import { lampLayer } from "./lamp";
import { GRID_COLS, GRID_MAX_W, gridTier } from "./layout";

/** A board cell: the server's GridCell plus, on the result page only, its place (public there, Mosaic §5). */
export type BoardCell = GridCell & { place?: 1 | 2 | 3 | null };

/** --kit-dark and --kit-light from the kit's palette keys: the frame and the kit view's faces read them. */
export function kitVars(kit: Kit): CSSProperties {
  return { "--kit-dark": FLIGHT_COLOURS[kit.dark].face, "--kit-light": FLIGHT_COLOURS[kit.light].face } as CSSProperties;
}

type Props = {
  cells: BoardCell[];
  lineCount: number;
  /** e.g. "Lines, 12 to go" */
  label: string;
  /** member when the viewer sees holders (shapeGrid's showHolders), else kit (Mosaic §6). */
  view?: BoardView;
  /** The host's surround; the default kit (Blue with Yellow) until the host picks one. */
  kit?: Kit;
  /** The lamp's step; null draws no lamp. */
  heat?: HeatStep | null;
  selected?: ReadonlySet<number>;
  struck?: ReadonlySet<number>;
  /** Selection reached the viewer's allowance: unselected open cells become aria-disabled. */
  disabledOpen?: boolean;
  /** Straight fill or not open: open cells cannot be selected. */
  readOnly?: boolean;
  onPress?: (n: number) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  /** The roving tab stop, owned by the caller (arrow keys). Falls back to the first selected, then the first open cell. */
  focusNumber?: number | null;
};

/**
 * The board (Mosaic §4, §5): cells wired in steel inside the host's surround, the lamp behind. The frame is a
 * box-shadow spread into the page gutter (globals.css .board-frame), so the grid keeps its full width. Bonus lines sit
 * on their own wired row below the frame (recorded ruling 18).
 */
export function Grid({ cells, lineCount, label, view = "member", kit = DEFAULT_KIT, heat = null, selected, struck, disabledOpen = false, readOnly = false, onPress, onKeyDown, focusNumber: rovingNumber = null }: Props) {
  const tier = gridTier(lineCount);
  const numbered = cells.filter((c) => !c.bonus);
  const bonus = cells.filter((c) => c.bonus);
  const focusNumber = !onPress
    ? undefined
    : rovingNumber !== null && cells.some((c) => c.number === rovingNumber)
      ? rovingNumber
      : (numbered.find((c) => selected?.has(c.number)) ?? numbered.find((c) => c.state === "open") ?? numbered[0])?.number;

  const renderCell = (c: BoardCell) => {
    const isSelected = selected?.has(c.number) ?? false;
    const disabled = c.state !== "open" || readOnly || (disabledOpen && !isSelected);
    return (
      <Cell
        key={c.number}
        cell={c}
        view={view}
        selected={isSelected}
        struck={struck?.has(c.number) ?? false}
        disabled={disabled}
        onPress={onPress}
        testId={onPress ? `cell-${c.number}` : undefined}
        tabIndex={onPress ? (c.number === focusNumber ? 0 : -1) : undefined}
      />
    );
  };

  return (
    <div role="group" aria-label={label} onKeyDown={onKeyDown} data-view={view} style={kitVars(kit)} className={`@container relative w-full ${GRID_MAX_W[tier]} touch-manipulation`}>
      {heat !== null && <span aria-hidden data-testid="lamp" className="board-lamp" style={lampLayer(heat)} />}
      <div data-grid-rows data-testid="board-frame" className={`board-frame relative grid ${GRID_COLS[tier]}`}>{numbered.map(renderCell)}</div>
      {bonus.length > 0 && (
        <>
          <p className="mt-6 text-micro font-medium text-[var(--board-text-2)]">Bonus</p>
          <div className={`board-wire relative mt-1 grid ${GRID_COLS[tier]}`}>{bonus.map(renderCell)}</div>
        </>
      )}
    </div>
  );
}
