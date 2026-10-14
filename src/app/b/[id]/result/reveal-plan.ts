import { ordinal } from "@/lib/list";

export const DEAL_MS = 1500;

/** Delay per rank position (0 = top spot). Worst rank is dealt first; the top spot last, then it lifts. */
export function dealDelays(count: number, total = DEAL_MS): number[] {
  if (count <= 1) return [0];
  const step = Math.min(120, total / count);
  return Array.from({ length: count }, (_, i) => Math.round((count - 1 - i) * step));
}

export const seenKey = (breakId: string) => `breaks.reveal.${breakId}`;
export const topSpotText = (line: number) => `Top spot: line ${line}`;
export const placeLabel = (rank: number) => (rank === 1 ? "Top spot" : ordinal(rank));

/**
 * Inline, pre-paint: mark <html data-deal> when this viewer will see the deal, so CSS hides the final state
 * until the deal layer covers it (no spoiler flash). Removed by Reveal, or after 4 s whatever happens.
 */
export function dealGateScript(breakId: string): string {
  return `try{if(!localStorage.getItem(${JSON.stringify(seenKey(breakId))})&&!matchMedia("(prefers-reduced-motion: reduce)").matches){document.documentElement.dataset.deal="1";setTimeout(function(){delete document.documentElement.dataset.deal},4000)}}catch(e){}`;
}
