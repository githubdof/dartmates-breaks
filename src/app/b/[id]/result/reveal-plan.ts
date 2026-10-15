import { ordinal } from "@/lib/list";
import { MOTION, type DurationTokens } from "@/lib/motion";
import type { Place } from "@/domain/draws/places";

export type { Place } from "@/domain/draws/places";
export type RevealStep = { at: number; kind: "lights-down" | "chip" | "beat" | "throw" | "land" | "call" | "lights-up"; number?: number; place?: Place };
export type RevealPlan = { steps: RevealStep[]; total: number };
export type Banner = { kind: "setup" } | { kind: "beat"; place: Place } | { kind: "call"; place: Place; number: number };
export type RevealState = { lights: boolean; chips: number; landed: number[]; banner: Banner | null; done: boolean };

/** The read-out's spacing (§4: computed, not a token): min(30 ms, 1500 ms / lines), so it never takes more than 1.5 s. */
export const chipGap = (lines: number): number => Math.min(30, 1500 / Math.max(1, lines));
/** Set-up: the house lights, then the read-out. At most 1.8 s (pinned by a test). */
export const setupMs = (lines: number, tokens: DurationTokens = MOTION): number => tokens.lights + lines * chipGap(lines);

/**
 * The throws in order: 3rd, 2nd, the top spot. `places` is the break's prize places (from placesOf, Task 6), which need
 * not be contiguous; a place with no prize, or with no line in the draw, is skipped.
 */
export function throwOrder(order: readonly number[], places: readonly Place[]): { place: Place; number: number }[] {
  return ([3, 2, 1] as const).filter((pl) => places.includes(pl) && order[pl - 1] !== undefined).map((pl) => ({ place: pl, number: order[pl - 1] }));
}

/**
 * The reveal's timeline (§7). 0: house lights down. From --dur-lights: one chip per line of the audited order, an
 * even tempo. Then per prize: a beat (--dur-beat-top before the top spot), the throw, the landing and the call at the
 * same moment, then squash and settle (the shake runs inside the following gap); --dur-gap to the next beat.
 * Last: the lights come up over --dur-lights. Pure, so the totals are pinned by tests.
 */
export function revealPlan(order: readonly number[], places: readonly Place[], tokens: DurationTokens = MOTION): RevealPlan {
  const steps: RevealStep[] = [{ at: 0, kind: "lights-down" }];
  const gap = chipGap(order.length);
  order.forEach((n, i) => steps.push({ at: tokens.lights + i * gap, kind: "chip", number: n }));
  let t = setupMs(order.length, tokens);
  throwOrder(order, places).forEach(({ place, number }, i) => {
    if (i > 0) t += tokens.gap;
    steps.push({ at: t, kind: "beat", place });
    const thrown = t + (place === 1 ? tokens.beatTop : tokens.beat);
    steps.push({ at: thrown, kind: "throw", place, number });
    const land = thrown + tokens.throw;
    steps.push({ at: land, kind: "land", place, number }, { at: land, kind: "call", place, number });
    t = land + tokens.squash + tokens.throwSettle;
  });
  steps.push({ at: t, kind: "lights-up" });
  return { steps, total: t + tokens.lights };
}

/** The board at time `t` (ms since lights down). Infinity, and anything from `total` on, is the final state: Skip. */
export function revealStateAt(plan: RevealPlan, t: number): RevealState {
  const past = plan.steps.filter((s) => s.at <= t);
  let banner: Banner | null = null;
  for (const s of past) {
    if (s.kind === "lights-down") banner = { kind: "setup" };
    // Typed casts, not non-null assertions: beat and call steps always carry them (and the copy audit bans "!" in literals' lines).
    else if (s.kind === "beat") banner = { kind: "beat", place: s.place as Place };
    else if (s.kind === "call") banner = { kind: "call", place: s.place as Place, number: s.number as number };
  }
  return {
    lights: past.some((s) => s.kind === "lights-down") && !past.some((s) => s.kind === "lights-up"),
    chips: past.filter((s) => s.kind === "chip").length,
    landed: past.filter((s) => s.kind === "land").map((s) => s.number as number),
    banner,
    done: t >= plan.total,
  };
}

const WORDS: Record<Place, { beat: string; takes: string }> = {
  3: { beat: "For 3rd place…", takes: "takes 3rd place." },
  2: { beat: "For 2nd place…", takes: "takes 2nd place." },
  1: { beat: "For the top spot…", takes: "takes the top spot." },
};
/**
 * The caller copy (§7, complete). Never "You", never the prize or its value; the same for every viewer. Always the
 * handle: the entry's handleAtDraw, set when the draw is recorded (recorded ruling 22). There is no handle-less call.
 */
export const setupCall = (hostName: string, lines: number) => `${hostName}'s break. ${lines} lines. Game on.`;
export const beatCall = (place: Place) => WORDS[place].beat;
export const placeCall = (place: Place, line: number, handle: string) => `Line ${line}. @${handle} ${WORDS[place].takes}`;

export function bannerText(b: Banner, c: { hostName: string; lines: number; handleOf: Record<number, string> }): string {
  if (b.kind === "setup") return setupCall(c.hostName, c.lines);
  if (b.kind === "beat") return beatCall(b.place);
  return placeCall(b.place, b.number, c.handleOf[b.number]);
}

export const seenKey = (breakId: string) => `breaks.reveal.${breakId}`;
export const topSpotText = (line: number) => `Top spot: line ${line}`;
export const placeLabel = (rank: number) => (rank === 1 ? "Top spot" : ordinal(rank));

/**
 * Inline, pre-paint: mark <html data-deal> when this viewer will see the reveal, so CSS hides the final state
 * until Reveal has set the board to house lights down (no spoiler flash). Removed by Reveal, or after 4 s whatever happens.
 */
export function dealGateScript(breakId: string): string {
  return `try{if(!localStorage.getItem(${JSON.stringify(seenKey(breakId))})&&!matchMedia("(prefers-reduced-motion: reduce)").matches){document.documentElement.dataset.deal="1";setTimeout(function(){delete document.documentElement.dataset.deal},4000)}}catch(e){}`;
}
