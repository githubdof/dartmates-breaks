import type { GridCell } from "@/domain/breaks/grid";
import { Cell } from "./cell";
import { GRID_COLS, GRID_MAX_W, gridTier } from "./layout";

type Props = {
  cells: GridCell[];
  lineCount: number;
  /** e.g. "Lines, 19 of 50 open" */
  label: string;
  selected?: ReadonlySet<number>;
  struck?: ReadonlySet<number>;
  /** Selection reached the viewer's allowance: unselected open cells become aria-disabled. */
  disabledOpen?: boolean;
  /** Straight fill or not open: open cells cannot be selected. */
  readOnly?: boolean;
  onPress?: (n: number) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
};

/** The board laid flat: cells touch along shared wires, no gap; bonus lines sit on their own row after N. */
export function Grid({ cells, lineCount, label, selected, struck, disabledOpen = false, readOnly = false, onPress, onKeyDown }: Props) {
  const tier = gridTier(lineCount);
  const numbered = cells.filter((c) => !c.bonus);
  const bonus = cells.filter((c) => c.bonus);
  const focusNumber = onPress
    ? (numbered.find((c) => selected?.has(c.number)) ?? numbered.find((c) => c.state === "open") ?? numbered[0])?.number
    : undefined;

  const renderCell = (c: GridCell) => {
    const isSelected = selected?.has(c.number) ?? false;
    const disabled = c.state !== "open" || readOnly || (disabledOpen && !isSelected);
    return (
      <Cell
        key={c.number}
        cell={c}
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
    <div role="group" aria-label={label} onKeyDown={onKeyDown} className={`@container w-full ${GRID_MAX_W[tier]} touch-manipulation`}>
      <div data-grid-rows className={`grid ${GRID_COLS[tier]} border-t border-l border-wire-strong`}>{numbered.map(renderCell)}</div>
      {bonus.length > 0 && (
        <>
          <p className="mt-3 text-micro font-medium text-ink-2">Bonus</p>
          <div className={`mt-1 grid ${GRID_COLS[tier]} border-t border-l border-wire-strong`}>{bonus.map(renderCell)}</div>
        </>
      )}
    </div>
  );
}
