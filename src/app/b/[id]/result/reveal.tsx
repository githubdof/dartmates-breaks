"use client";
import { useEffect, useState } from "react";

type Award = { rank: number; winnerHandle: string | null; itemName: string | null };

export function Reveal({ ranking, handleOf, awards }: { ranking: number[]; handleOf: Record<number, string>; awards: Award[] }) {
  const [shown, setShown] = useState(0); // reveal worst → best
  useEffect(() => {
    if (shown < ranking.length) {
      const t = setTimeout(() => setShown(shown + 1), Math.max(60, 1500 / ranking.length));
      return () => clearTimeout(t);
    }
  }, [shown, ranking.length]);
  const done = shown >= ranking.length;
  return (
    <div className="mt-3">
      {done && ranking.length > 0 && (
        <div className="rounded bg-green-700 p-4 text-white">
          <div className="text-sm">Winner</div>
          <div className="text-2xl font-bold">{handleOf[ranking[0]]} — line {ranking[0]}</div>
          {awards.filter((a) => a.rank > 1).map((a) => (
            <div key={a.rank} className="text-sm">#{a.rank}: {a.winnerHandle}{a.itemName ? ` — ${a.itemName}` : ""}</div>
          ))}
        </div>
      )}
      <ol className="mt-2 text-sm" reversed>
        {ranking.slice(ranking.length - shown).reverse().map((n, i) => (
          <li key={n} value={ranking.length - i}>Line {n} · {handleOf[n]}</li>
        ))}
      </ol>
      {!done && <button onClick={() => setShown(ranking.length)} className="mt-2 text-xs underline">Skip</button>}
    </div>
  );
}
