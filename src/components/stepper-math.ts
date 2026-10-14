export function clampStep(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function stepState(value: number, min: number, max: number): { canDec: boolean; canInc: boolean } {
  return { canDec: value > min, canInc: value < max };
}

/** While typing: commit only a whole number inside the bounds; null means "keep the draft, don't commit yet". */
export function draftValue(draft: string, min: number, max: number): number | null {
  const t = draft.trim();
  if (!/^\d{1,4}$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}

/** On blur or Enter: clamp whatever was typed; anything that is not a number keeps the last good value. */
export function commitDraft(draft: string, min: number, max: number, fallback: number): number {
  const t = draft.trim();
  return clampStep(/^\d+$/.test(t) ? Number(t) : fallback, min, max);
}
