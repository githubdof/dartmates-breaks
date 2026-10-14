"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { dealDelays, liftDelay, placeLabel, seenKey, topSpotText } from "./reveal-plan";

type Award = { rank: number; winnerHandle: string | null; itemName: string | null };

/**
 * The final state is server-rendered and readable without JavaScript. The deal is a decorative,
 * aria-hidden layer played once per viewer (Replay afterwards); reduced motion skips it.
 */
export function Reveal({ breakId, ranking, handleOf, awards }: { breakId: string; ranking: number[]; handleOf: Record<number, string>; awards: Award[] }) {
  const [dealing, setDealing] = useState(false);
  const [lifted, setLifted] = useState(false);
  const [canReplay, setCanReplay] = useState(false);
  const [ready, setReady] = useState(false);
  const top = ranking[0];
  const replayRef = useRef<HTMLDivElement>(null);
  const skipped = useRef(false);

  // Before paint, so a client-side navigation never shows the result before the deal layer (the gate script only covers hard loads).
  useLayoutEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seen = true;
    try {
      seen = window.localStorage.getItem(seenKey(breakId)) === "1";
      window.localStorage.setItem(seenKey(breakId), "1");
    } catch {
      seen = true; // storage blocked: never force the animation
    }
    setCanReplay(true);
    if (!seen && !reduced) setDealing(true);
    setReady(true);
  }, [breakId]);

  // The deal layer (if any) is committed now: lift the pre-paint hide set by dealGateScript.
  useLayoutEffect(() => {
    if (ready) delete document.documentElement.dataset.deal;
  }, [ready]);

  useEffect(() => {
    if (!dealing) return;
    setLifted(false);
    const lift = window.setTimeout(() => setLifted(true), liftDelay(ranking.length));
    const end = window.setTimeout(() => setDealing(false), liftDelay(ranking.length) + 700);
    return () => { window.clearTimeout(lift); window.clearTimeout(end); };
  }, [dealing, ranking.length]);

  useEffect(() => {
    if (!dealing && skipped.current) { skipped.current = false; replayRef.current?.querySelector("button")?.focus(); }
  }, [dealing]);

  const delays = dealDelays(ranking.length);
  const winner = awards.find((a) => a.rank === 1);
  const others = awards.filter((a) => a.rank > 1);
  const handle = (n: number) => (handleOf[n] ? `@${handleOf[n]}` : "");

  return (
    <section aria-labelledby="top-spot" className="relative mt-2">
      <div ref={replayRef} className="relative z-20 flex min-h-11 justify-end">
        {dealing
          ? <Button variant="text" onClick={() => { skipped.current = true; setDealing(false); }} data-testid="reveal-skip">Skip</Button>
          : canReplay && <Button variant="text" onClick={() => { setLifted(false); setDealing(true); }} data-testid="reveal-replay">Replay the draw</Button>}
      </div>
      <div data-reveal-final>
      <h1 id="top-spot" data-testid="winner" className="font-condensed text-display font-semibold">{topSpotText(top)}</h1>
      <p className="text-headline font-semibold">{handle(top)}</p>
      {winner?.itemName && <p className="text-ink-2">Wins {winner.itemName}.</p>}
      {winner && !winner.itemName && <p className="text-ink-2">Picks one of the prize choices.</p>}
      <div aria-hidden className="mt-4 flex size-28 items-center justify-center bg-green font-condensed text-[56px] leading-none font-semibold text-card">{top}</div>
      {others.length > 0 && (
        <ul className="mt-4 space-y-1">
          {others.map((a) => <li key={a.rank}>{placeLabel(a.rank)} place: {a.winnerHandle ? `@${a.winnerHandle}` : "unknown"}{a.itemName ? `, ${a.itemName}` : ""}.</li>)}
        </ul>
      )}
      <h2 className="mt-6 text-headline font-semibold">Full order</h2>
      <ol className="mt-2 divide-y divide-wire-2 rounded-card border border-wire bg-card">
        {ranking.map((n, i) => (
          <li key={n} className="flex min-h-11 items-center gap-3 px-4 text-small">
            <span className="w-20 text-ink-2">{placeLabel(i + 1)}</span>
            <span className="w-16 font-condensed text-grid font-semibold tabular">Line {n}</span>
            <span className="min-w-0 truncate">{handle(n)}</span>
          </li>
        ))}
      </ol>
      </div>
      {dealing && (
        <div aria-hidden className="absolute inset-0 z-10 bg-paper pt-12">
          <div className="flex flex-wrap content-start gap-1">
            {ranking.map((n, i) => (
              <span
                key={n}
                className={`flex size-11 items-center justify-center border border-wire-strong font-condensed text-grid font-semibold ${i === 0 && lifted ? "animate-lift bg-green text-card" : "animate-deal bg-card text-ink"}`}
                style={{ animationDelay: i === 0 && lifted ? "0ms" : `${delays[i]}ms` }}
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
