import { useCallback, useEffect, useRef, useState } from "react";
import { startReveal, type RevealHandlers } from "./reveal-clock";
import type { RevealPlan } from "./reveal-plan";

const FINAL = Number.POSITIVE_INFINITY;

/**
 * The reveal's clock (Mosaic §7): `t` is ms since house lights down, Infinity the final state. The run's effect owns
 * the timers and returns their cancel as its cleanup, so a re-run of the effect (Strict Mode, Fast Refresh) restarts
 * the run and a real unmount stops it. `play` starts a run from house lights down; `skip` ends it at the final state.
 */
export function useRevealClock(plan: RevealPlan, handlers: Omit<RevealHandlers, "onTime">) {
  const [t, setT] = useState(FINAL);
  // 0: no run. Each play takes the next number, so Replay restarts the effect even from a finished run.
  const [run, setRun] = useState(0);
  const h = useRef(handlers);
  h.current = handlers;
  const cancel = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (run === 0) return;
    const stop = startReveal(plan, {
      onTime: setT,
      onStep: (s) => h.current.onStep(s),
      onEnd: () => { setT(FINAL); h.current.onEnd(); },
      onStop: () => h.current.onStop(),
    }, { setTimeout: (fn, ms) => window.setTimeout(fn, ms), clearTimeout: (id) => window.clearTimeout(id) });
    cancel.current = stop;
    return stop;
  }, [run, plan]);

  const play = useCallback(() => { cancel.current?.(); setT(0); setRun((r) => r + 1); }, []);
  /** Cancel at once (no timer may land after the click), then the final state; the effect's cleanup is then a no-op. */
  const skip = useCallback(() => { cancel.current?.(); cancel.current = null; setT(FINAL); setRun(0); }, []);
  return { t, play, skip };
}
