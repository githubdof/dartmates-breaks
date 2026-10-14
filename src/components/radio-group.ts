import type { KeyboardEvent } from "react";

/**
 * The ARIA radio group keys: arrows move (and wrap), Home and End jump to the ends. Null for any other key.
 * Pure index arithmetic, shared by SegmentedControl and FilterChips through `radioKeyDown`.
 */
export function radioKeyIndex(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowLeft":
    case "ArrowUp": return (index - 1 + count) % count;
    case "ArrowRight":
    case "ArrowDown": return (index + 1) % count;
    case "Home": return 0;
    case "End": return count - 1;
    default: return null;
  }
}

/** One tab stop per group: the checked option, or the first when none is checked. */
export function radioTabIndex(on: boolean, index: number, anyOn: boolean): 0 | -1 {
  return on || (!anyOn && index === 0) ? 0 : -1;
}

/** onKeyDown for a role="radiogroup": selects the next option and moves focus to its button. */
export function radioKeyDown<T>(e: KeyboardEvent<HTMLElement>, values: readonly T[], value: T, onChange: (v: T) => void): void {
  const current = Math.max(0, values.indexOf(value));
  const next = radioKeyIndex(e.key, current, values.length);
  if (next === null) return;
  e.preventDefault();
  onChange(values[next]);
  e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
}
