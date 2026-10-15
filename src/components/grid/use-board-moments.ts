"use client";
import { useEffect, useState } from "react";
import type { GridCell } from "@/domain/breaks/grid";
import type { CellMoment } from "./cell-moments";
import { MOMENT_CLEAR_MS, stepMoments, type BoardSnap, type MomentState, type PendingClaim } from "./board-moments";

const NONE: ReadonlyMap<number, CellMoment> = new Map();
const NO_GHOSTS: ReadonlyMap<number, GridCell> = new Map();
type Shown = {
  moments: ReadonlyMap<number, CellMoment>;
  from: ReadonlyMap<number, GridCell>;
  landed: readonly number[];
  /** The map the last moving change produced; it changes only when a new run of moments starts. */
  played: ReadonlyMap<number, CellMoment>;
};

/**
 * The moments of the latest change to the board, against what this viewer saw last (Mosaic §3). The first render has
 * no earlier board, so it plays nothing. A change that moves cells replaces the map: cells still mid-moment snap to
 * their new final state. A change that moves nothing (a fresh strike array, a refresh with no change) keeps the map in
 * play, with only the cells that really changed set still; with nothing in play it builds no map at all. The map
 * clears after MOMENT_CLEAR_MS, so data-moment, will-change and the ghosts never outstay the motion. `claim` is the
 * island's pending claim: whichever renders first, the refreshed props or the action's answer, the claim's lines drop
 * when they turn the viewer's (recorded ruling 34). `landed` tells the island to clear it.
 */
export function useBoardMoments(next: BoardSnap, claim: PendingClaim | null): Shown {
  const [state, setState] = useState<MomentState>(() => ({ snap: next, moments: NONE, from: NO_GHOSTS, landed: [], played: NONE }));
  const current = stepMoments(state, next, claim);
  if (current !== state) setState(current); // adjusting state while rendering: React re-renders before it commits, so no stale frame
  const shown = current.moments;
  useEffect(() => {
    if (shown.size === 0) return;
    const id = window.setTimeout(() => setState((s) => (s.moments === shown ? { ...s, moments: NONE, from: NO_GHOSTS } : s)), MOMENT_CLEAR_MS);
    return () => window.clearTimeout(id);
  }, [shown]);
  return { moments: current.moments, from: current.from, landed: current.landed, played: current.played };
}
