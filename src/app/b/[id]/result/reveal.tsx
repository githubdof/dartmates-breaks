"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FLIGHT_COLOURS, type HeatStep, type Kit } from "@/domain/flights";
import type { Place } from "@/domain/draws/places";
import { Grid } from "@/components/grid/grid";
import { CallerBanner } from "@/components/break/caller-banner";
import { Button } from "@/components/button";
import { MOTION, prefersReducedMotion } from "@/lib/motion";
import type { ResultCell } from "./board-cells";
import { DART_TIP, dartAngle, dartAt, easeIn } from "./dart";
import { bannerText, placeCall, revealPlan, revealStateAt } from "./reveal-plan";
import { readGate } from "./reveal-clock";
import { useRevealClock } from "./use-reveal-clock";

type Props = {
  breakId: string;
  lineCount: number;
  /** The viewer's view of the board (member or kit, §6), won places set: the final state, server-rendered. */
  cells: ResultCell[];
  kit: Kit;
  heat: HeatStep;
  /** The audited order, top spot first. */
  order: number[];
  /** The prize places (placesOf, Task 6): one dart each, 3rd first. */
  places: readonly Place[];
  handleOf: Record<number, string>;
  hostName: string;
  view: "member" | "kit";
  /** "Top spot: line 7" and the winner's handle: in the DOM from the start, out of sight while the reveal plays. */
  headline: ReactNode;
  /** The full order and anything else that would spoil the throws. */
  after: ReactNode;
};

/**
 * The result page's reveal (Mosaic §7). The final state is server-rendered and readable without JavaScript. The
 * reveal plays once per viewer (Replay afterwards); reduced motion never plays it. Per-cell motion is CSS; the dart's
 * path is the one JS tween. The deal layer (chips, dart, banner) is aria-hidden; each call is announced politely.
 */
export function Reveal(p: Props) {
  const plan = useMemo(() => revealPlan(p.order, p.places), [p.order, p.places]);
  const [canReplay, setCanReplay] = useState(false);
  const [ready, setReady] = useState(false);
  const [said, setSaid] = useState({ text: "", n: 0 });
  // Skip lifts the lights in one short fade (data-skip); the chips stay as the scorer's column once read out.
  const [skipped, setSkipped] = useState(false);
  const [played, setPlayed] = useState(false);
  // The impacts' own timers (each clears its cell's data-impact); the run's timers live in useRevealClock.
  const timers = useRef<number[]>([]);
  const raf = useRef<number | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const dart = useRef<SVGSVGElement>(null);
  const replayRef = useRef<HTMLDivElement>(null);
  const focusReplay = useRef(false);
  const gate = useRef<string | null>(null);

  const cellEl = (n: number) => stage.current?.querySelector<HTMLElement>(`[data-cell="${n}"]`) ?? null;

  /** A run ended early or restarted: the dart, the impacts and their timers go with it. */
  const stop = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current.length = 0;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    if (dart.current) dart.current.style.opacity = "0";
    stage.current?.querySelectorAll<HTMLElement>("[data-impact]").forEach((el) => { delete el.dataset.impact; });
  };

  /** One neutral dart from the oche (bottom centre of the frame) to the cell: a straight line, one fixed angle, ease-in. */
  const throwDart = (n: number) => {
    const st = stage.current, el = dart.current, target = cellEl(n);
    if (!st || !el || !target) return;
    const frame = st.querySelector<HTMLElement>('[data-testid="board-frame"]') ?? st;
    const s0 = st.getBoundingClientRect(), f = frame.getBoundingClientRect(), c = target.getBoundingClientRect();
    const from = { x: f.left + f.width / 2 - s0.left, y: f.bottom - s0.top };
    const to = { x: c.left + c.width / 2 - s0.left, y: c.top + c.height / 2 - s0.top };
    const angle = dartAngle(from, to); // fixed once, here
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / MOTION.throw);
      const at = dartAt(from, to, easeIn(k));
      el.style.transform = `translate(${at.x - DART_TIP.x}px, ${at.y - DART_TIP.y}px) rotate(${angle}deg)`;
      el.style.opacity = k < 1 ? "1" : "0";
      raf.current = k < 1 ? requestAnimationFrame(step) : null;
    };
    raf.current = requestAnimationFrame(step);
  };

  /** Impact: the cell takes its won state (React, from `landed`); here it squashes, settles and shakes once. */
  const impact = (n: number, place: Place) => {
    const target = cellEl(n);
    if (dart.current) dart.current.style.opacity = "0";
    if (!target) return;
    target.dataset.impact = String(place);
    timers.current.push(window.setTimeout(() => { delete target.dataset.impact; }, MOTION.squash + MOTION.throwSettle + MOTION.shake));
  };

  const clock = useRevealClock(plan, {
    onStep: (x) => {
      if (x.kind === "throw") throwDart(x.number as number);
      if (x.kind === "land") impact(x.number as number, x.place as Place);
      if (x.kind === "call") setSaid((v) => ({ text: placeCall(x.place as Place, x.number as number, p.handleOf[x.number as number]), n: v.n + 1 }));
    },
    onEnd: () => { focusReplay.current = true; },
    onStop: stop,
  });
  const { t } = clock;
  const playing = Number.isFinite(t);
  const s = revealStateAt(plan, t);

  const play = () => {
    setSkipped(false);
    setPlayed(true);
    clock.play();
  };
  /** Skip: the final state in the same frame, every bull in the DOM, the lights up in one short fade; focus goes to Replay. */
  const skip = () => { focusReplay.current = true; setSkipped(true); clock.skip(); };

  const playRef = useRef(play);
  playRef.current = play;

  // Before paint, so neither a hard load (the gate script) nor a client navigation shows the result before the lights go
  // down. Read once per break (readGate): Strict Mode's re-run of this effect keeps the first run's decision, and the
  // run's own effect (useRevealClock) restarts the clock it cancelled.
  useLayoutEffect(() => {
    let store: Pick<Storage, "getItem" | "setItem">;
    try { store = window.localStorage; } catch { store = { getItem: () => "1", setItem: () => {} }; }
    const gateSays = readGate(gate, p.breakId, store, prefersReducedMotion());
    if (gateSays === null) return;
    setCanReplay(true);
    if (gateSays === "play") playRef.current();
    setReady(true);
  }, [p.breakId]);
  useLayoutEffect(() => { if (ready) delete document.documentElement.dataset.deal; }, [ready]);
  useEffect(() => {
    if (playing || !focusReplay.current) return;
    focusReplay.current = false;
    replayRef.current?.querySelector("button")?.focus();
  }, [playing]);

  // The board as the throws have left it: a won cell keeps its pre-draw look until its dart lands.
  const landedKey = s.landed.join(",");
  const shown = useMemo(() => {
    const landed = new Set(landedKey ? landedKey.split(",").map(Number) : []);
    return p.cells.map((c) => (c.place !== null && !landed.has(c.number) ? { ...c, place: null } : c));
  }, [p.cells, landedKey]);

  const b = s.banner;
  const called = b?.kind === "call" ? shown.find((c) => c.number === b.number) ?? null : null;
  // Member view: the winner's flight beside the handle (§6, the one exception). Kit view: text, the place's colour.
  const flight = p.view === "member" && called ? called.flight : null;
  const rule = b?.kind !== "call" ? "var(--kit-dark)" : flight ? FLIGHT_COLOURS[flight.colour].face : b.place === 1 ? "var(--red)" : "var(--green)";
  const text = b ? bannerText(b, { hostName: p.hostName, lines: p.lineCount, handleOf: p.handleOf }) : null;

  return (
    <section aria-labelledby="top-spot" data-reveal-final data-playing={playing || undefined} className="relative mt-2">
      <div ref={replayRef} className="relative z-20 flex min-h-11 justify-end">
        {playing
          ? <Button variant="secondary" onClick={skip} data-testid="reveal-skip">Skip</Button>
          : canReplay && <Button variant="secondary" onClick={() => { if (!prefersReducedMotion()) play(); }} data-testid="reveal-replay">Replay the draw</Button>}
      </div>
      <div data-reveal-text>{p.headline}</div>
      <div ref={stage} data-skip={skipped || undefined} className="relative mt-6">
        <div data-lights={s.lights ? "down" : undefined} className="relative">
          {/* The viewer's view (§6), the host's kit, and the lamp at the break's step (Grid draws it, Task 8). */}
          <Grid cells={shown} lineCount={p.lineCount} label="Lines" view={p.view} kit={p.kit} heat={p.heat} />
        </div>
        <svg ref={dart} aria-hidden viewBox="0 0 56 14" width={56} height={14} className="pointer-events-none absolute top-0 left-0 z-30"
          style={{ opacity: 0, transformOrigin: `${DART_TIP.x}px ${DART_TIP.y}px` }}>
          <path d="M0 7 L14 3 L14 11 Z" fill="var(--board-cream)" />
          <path d="M14 5 h20 v4 h-20 z" fill="var(--board-steel)" />
          <path d="M34 5.5 h16 v3 h-16 z" fill="var(--board-steel)" />
          <path d="M50 7 L56 7" stroke="var(--board-steel)" strokeWidth={1.2} />
        </svg>
      </div>
      <div className="mt-4 min-h-10">
        {text && <CallerBanner key={text} text={text} rule={rule} flight={flight} play={playing} />}
      </div>
      {(playing || played) && (
        <ol aria-hidden data-testid="deal" className="mt-3 flex min-h-7 flex-wrap gap-1">
          {p.order.slice(0, s.chips).map((n) => (
            <li key={n} className="rounded-input bg-[var(--board-wall-2)] px-1.5 py-0.5 font-condensed text-small font-semibold text-[color:var(--board-text-2)] tabular">{n}</li>
          ))}
        </ol>
      )}
      <p role="status" aria-live="polite" className="sr-only"><span key={said.n}>{said.text}</span></p>
      <div data-reveal-text>{p.after}</div>
    </section>
  );
}
