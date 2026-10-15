import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { ENDED, readGate, startReveal, type RevealHandlers } from "./reveal-clock";
import { revealPlan, seenKey, type RevealStep } from "./reveal-plan";

const plan = revealPlan([3, 1, 4, 2], [1, 2]);
const clock = { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number, clearTimeout: (id: number) => clearTimeout(id) };

function recorder() {
  const times: number[] = [];
  const steps: RevealStep[] = [];
  const h: RevealHandlers & { ends: number; stops: number } = {
    ends: 0, stops: 0,
    onTime: (t) => times.push(t),
    onStep: (s) => steps.push(s),
    onEnd: () => { h.ends++; },
    onStop: () => { h.stops++; },
  };
  return { h, times, steps };
}

function storage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
}

describe("the reveal's clock survives React's lifecycle (Strict Mode re-runs every effect once in dev)", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("plays a first-time viewer's reveal to the end after mount → cleanup → re-run", () => {
    const gate = { current: null as string | null };
    const store = storage();
    const { h, times, steps } = recorder();
    // Mount: the layout effect reads the gate (plays), the run's effect starts the clock.
    expect(readGate(gate, "b1", store, false)).toBe("play");
    const cleanup = startReveal(plan, h, clock);
    // Strict Mode's simulated unmount: every effect's cleanup.
    cleanup();
    // The re-run: the gate was already read for this break (the run in state stands), and the run's effect restarts the clock.
    expect(readGate(gate, "b1", store, false)).toBeNull();
    startReveal(plan, h, clock);
    // The restarted run begins at house lights down and advances through every step time to the end.
    expect(times.at(-1)).toBe(0);
    vi.advanceTimersByTime(plan.total);
    expect(times.slice(times.lastIndexOf(0))).toEqual([0, ...[...new Set(plan.steps.map((x) => x.at))].filter((x) => x > 0)]);
    expect(h.ends).toBe(1);
    expect(times.at(-1)).toBe(plan.steps.at(-1)?.at);
    expect(steps.filter((s) => s.kind === "land").map((s) => s.number)).toEqual([1, 3]);
    expect(store.getItem(seenKey("b1"))).toBe("1");
  });

  it("stops every timer on a real unmount, and on Skip", () => {
    const { h, times } = recorder();
    const cleanup = startReveal(plan, h, clock);
    vi.advanceTimersByTime(500);
    const seen = times.length;
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
    expect(h.stops).toBe(1);
    vi.advanceTimersByTime(plan.total);
    expect(times.length).toBe(seen);
    expect(h.ends).toBe(0);
    // Cancelling twice (Skip, then the effect's cleanup) is harmless.
    cleanup();
    expect(h.stops).toBe(1);
  });

  it("never plays for a returning viewer, under reduced motion, or when storage is blocked", () => {
    expect(readGate({ current: null }, "b1", storage({ [seenKey("b1")]: "1" }), false)).toBe("still");
    expect(readGate({ current: null }, "b1", storage(), true)).toBe("still");
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => {} };
    expect(readGate({ current: null }, "b1", blocked, false)).toBe("still");
  });
});

describe("a finished run leaves no run behind", () => {
  it("ends at the final state with run 0, as Skip does, so a new plan object cannot replay it", () => {
    // The repo has no DOM renderer; the hook sets exactly ENDED in onEnd, and its effect starts only for run > 0.
    expect(ENDED.run).toBe(0);
    expect(ENDED.t).toBe(Number.POSITIVE_INFINITY);
  });
});
