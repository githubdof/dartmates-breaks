import { seenKey, type RevealPlan, type RevealStep } from "./reveal-plan";

export type RevealHandlers = {
  /** The clock reached `t` (ms since lights down). */
  onTime: (t: number) => void;
  /** A step of the plan is due (throw, land, call…), in plan order. */
  onStep: (step: RevealStep) => void;
  /** The reveal reached its end on its own. */
  onEnd: () => void;
  /** The run was cancelled (Skip, a Replay, an unmount, Strict Mode's simulated unmount): undo its side channels. */
  onStop: () => void;
};
export type TimerClock = { setTimeout: (fn: () => void, ms: number) => number; clearTimeout: (id: number) => void };

/**
 * One run of the reveal: a timer per distinct step time, then the end. Returns the cancel, which the run's effect uses
 * as its cleanup, so React's re-run (Strict Mode in dev, Fast Refresh) restarts the clock instead of losing it.
 * Idempotent: Skip cancels at once, and the effect's cleanup may cancel the same run again.
 */
export function startReveal(plan: RevealPlan, h: RevealHandlers, clock: TimerClock): () => void {
  const ids: number[] = [];
  // A restarted run (a re-run of its effect) starts again from house lights down, never from where the last one stood.
  h.onTime(0);
  for (const at of [...new Set(plan.steps.map((s) => s.at))].filter((x) => x > 0)) {
    ids.push(clock.setTimeout(() => {
      h.onTime(at);
      for (const s of plan.steps) if (s.at === at) h.onStep(s);
    }, at));
  }
  ids.push(clock.setTimeout(h.onEnd, plan.total));
  let live = true;
  return () => {
    if (!live) return;
    live = false;
    ids.forEach((id) => clock.clearTimeout(id));
    h.onStop();
  };
}

type GateStore = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void };

/**
 * The once-per-viewer gate, read once per break: "play" for a first-time viewer without reduced motion, "still"
 * otherwise, and null when this break's gate was already read (a re-run of the same mount, whose decision stands in
 * state). Storage blocked: never force the reveal.
 */
export function readGate(read: { current: string | null }, breakId: string, store: GateStore, reduced: boolean): "play" | "still" | null {
  if (read.current === breakId) return null;
  read.current = breakId;
  let seen = true;
  try {
    seen = store.getItem(seenKey(breakId)) === "1";
    store.setItem(seenKey(breakId), "1");
  } catch {
    seen = true;
  }
  return !seen && !reduced ? "play" : "still";
}
