import { describe, it, expect } from "vitest";
import { MOTION } from "@/lib/motion";
import {
  bannerText, beatCall, chipGap, dealGateScript, placeCall, placeLabel, revealPlan, revealStateAt, seenKey, setupCall, setupMs, throwOrder, topSpotText,
  type Place,
} from "./reveal-plan";

const order50 = [23, 14, 9, ...Array.from({ length: 50 }, (_, i) => i + 1).filter((n) => ![23, 14, 9].includes(n))];
/** The prize places 1..n, as placesOf gives them for a break with n contiguous prize ranks. */
const upTo = (n: number): Place[] => ([1, 2, 3] as Place[]).slice(0, n);
const after = (lines: number, n: number) => revealPlan(order50.slice(0, lines), upTo(n)).total - setupMs(lines);
const at = (plan: ReturnType<typeof revealPlan>, kind: string) => plan.steps.filter((s) => s.kind === kind);

describe("revealPlan: the totals (Review Focus 4)", () => {
  it("keeps the set-up (house lights plus the read-out) at 1.8 s or less, for every board size", () => {
    for (let lines = 2; lines <= 55; lines++) expect(setupMs(lines)).toBeLessThanOrEqual(1800 + 1e-6);
    expect(setupMs(50)).toBe(MOTION.lights + 1500);
    expect(chipGap(50)).toBe(30);
    expect(chipGap(10)).toBe(30);
    expect(chipGap(60)).toBe(25);
  });
  it("takes about 1.6 s for one prize and about 4.2 s for three after the read-out; 3.38 s and 6.04 s in all at 50 lines", () => {
    expect(after(50, 1)).toBe(1580); // 800 + 260 + 80 + 140, then the 300 ms lift
    expect(after(50, 2)).toBe(2910);
    expect(after(50, 3)).toBe(4240); // 780 + 550 + 780 + 550 + 1280 + 300
    expect(revealPlan(order50, upTo(1)).total).toBe(3380); // 1800 of set-up + 1580
    expect(revealPlan(order50, upTo(3)).total).toBe(6040); // 1800 of set-up + 4240
  });
  it("throws 3rd, then 2nd, then the top spot, with beats of 300, 300 and 800 ms", () => {
    const plan = revealPlan(order50, upTo(3));
    expect(at(plan, "throw").map((s) => [s.place, s.number])).toEqual([[3, 9], [2, 14], [1, 23]]);
    const beats = at(plan, "beat");
    expect(at(plan, "throw").map((s, i) => s.at - beats[i].at)).toEqual([300, 300, 800]);
    expect(at(plan, "land").map((s, i) => s.at - at(plan, "throw")[i].at)).toEqual([260, 260, 260]);
    expect(at(plan, "call").map((s) => s.at)).toEqual(at(plan, "land").map((s) => s.at));
    // --dur-gap from one throw's settle to the next beat
    expect(beats[1].at - (at(plan, "land")[0].at + MOTION.squash + MOTION.throwSettle)).toBe(MOTION.gap);
  });
  it("skips places with no prize, and places with no line", () => {
    expect(throwOrder([7, 2, 5], [1, 2])).toEqual([{ place: 2, number: 2 }, { place: 1, number: 7 }]);
    expect(throwOrder([7, 2], [1, 2, 3])).toEqual([{ place: 2, number: 2 }, { place: 1, number: 7 }]);
    expect(throwOrder([7], [1, 2, 3])).toEqual([{ place: 1, number: 7 }]);
    // Prize ranks need not be contiguous: a 3rd-place prize with no 2nd throws 3rd, then the top spot.
    expect(throwOrder([7, 2, 5], [1, 3])).toEqual([{ place: 3, number: 5 }, { place: 1, number: 7 }]);
  });
});

describe("revealStateAt: what the board shows at a time", () => {
  const plan = revealPlan(order50, upTo(3));
  it("dims at once, reads the order out, lands each bull at its throw, lifts at the end", () => {
    expect(revealStateAt(plan, 0)).toEqual({ lights: true, chips: 0, landed: [], banner: { kind: "setup" }, done: false });
    expect(revealStateAt(plan, MOTION.lights).chips).toBe(1);
    const firstLand = at(plan, "land")[0].at;
    expect(revealStateAt(plan, firstLand - 1).landed).toEqual([]);
    expect(revealStateAt(plan, firstLand)).toMatchObject({ lights: true, landed: [9], banner: { kind: "call", place: 3, number: 9 } });
    expect(revealStateAt(plan, at(plan, "lights-up")[0].at).lights).toBe(false);
  });
  it("Skip is the final state, reached in one step: every bull in the DOM, the lights up, the top-spot call", () => {
    const final = revealStateAt(plan, Number.POSITIVE_INFINITY);
    expect(final).toEqual({ lights: false, chips: 50, landed: [9, 14, 23], banner: { kind: "call", place: 1, number: 23 }, done: true });
    expect(revealStateAt(plan, plan.total)).toEqual(final);
  });
  it("never cycles a number: the chips are the order, once each, and only ever grow; each bull lands once", () => {
    expect(at(plan, "chip").map((s) => s.number)).toEqual(order50);
    let chips = 0, landed = 0;
    for (let t = 0; t <= plan.total; t += 5) {
      const s = revealStateAt(plan, t);
      expect(s.chips).toBeGreaterThanOrEqual(chips);
      expect(s.landed.length).toBeGreaterThanOrEqual(landed);
      expect(new Set(s.landed).size).toBe(s.landed.length);
      chips = s.chips; landed = s.landed.length;
    }
  });
});

describe("the caller copy (complete, the same for every viewer)", () => {
  it("speaks only the lines of the set", () => {
    expect(setupCall("Jim", 50)).toBe("Jim's break. 50 lines. Game on.");
    expect([3, 2, 1].map((p) => beatCall(p as 1 | 2 | 3))).toEqual(["For 3rd place…", "For 2nd place…", "For the top spot…"]);
    expect(placeCall(3, 9, "liz")).toBe("Line 9. @liz takes 3rd place.");
    expect(placeCall(2, 14, "dave")).toBe("Line 14. @dave takes 2nd place.");
    expect(placeCall(1, 23, "mike")).toBe("Line 23. @mike takes the top spot.");
    const copy = { hostName: "Jim", lines: 50, handleOf: { 23: "mike" } };
    expect(bannerText({ kind: "setup" }, copy)).toBe("Jim's break. 50 lines. Game on.");
    expect(bannerText({ kind: "beat", place: 1 }, copy)).toBe("For the top spot…");
    expect(bannerText({ kind: "call", place: 1, number: 23 }, copy)).toBe("Line 23. @mike takes the top spot.");
  });
  it("never shows a banner outside the set (§7 never list): every banner of a three-prize reveal matches one of its lines", () => {
    // Always the handle (the entry's handleAtDraw): the copy set has no handle-less call (recorded ruling 22).
    const SET = [/^Jim's break\. \d+ lines\. Game on\.$/, /^For (3rd place|2nd place|the top spot)…$/, /^Line \d+\. @\w+ takes (3rd place|2nd place|the top spot)\.$/];
    const plan = revealPlan(order50, upTo(3));
    const copy = { hostName: "Jim", lines: 50, handleOf: Object.fromEntries(order50.map((n) => [n, `h${n}`])) };
    for (let t = 0; t <= plan.total; t += 10) {
      const b = revealStateAt(plan, t).banner;
      if (!b) continue;
      const text = bannerText(b, copy);
      expect(SET.some((re) => re.test(text)), text).toBe(true);
    }
  });
});

it("names places and keys the once-per-viewer flag by break", () => {
  expect([1, 2, 3, 4, 11, 21].map(placeLabel)).toEqual(["Top spot", "2nd", "3rd", "4th", "11th", "21st"]);
  expect(topSpotText(7)).toBe("Top spot: line 7");
  expect(seenKey("b1")).toBe("breaks.reveal.b1");
});

it("gates the pre-paint hide on the same once-per-viewer key and on reduced motion", () => {
  const js = dealGateScript("b1");
  expect(js).toContain(JSON.stringify(seenKey("b1")));
  expect(js).toContain("prefers-reduced-motion: reduce");
  expect(js).toContain("dataset.deal");
});

it("marks <html data-deal> only for a first-time viewer without reduced motion, lifts it after 4 s, and never throws", () => {
  const runGate = (o: { seen: string | null; reduced: boolean; storageThrows?: boolean }) => {
    const dataset: Record<string, string> = {};
    const timers: (() => void)[] = [];
    const localStorage = { getItem: () => { if (o.storageThrows) throw new Error("blocked"); return o.seen; } };
    const matchMedia = () => ({ matches: o.reduced });
    const document = { documentElement: { dataset } };
    const setTimeout = (fn: () => void) => { timers.push(fn); return 0; };
    new Function("localStorage", "matchMedia", "document", "setTimeout", dealGateScript("b1"))(localStorage, matchMedia, document, setTimeout);
    return { dataset, timers };
  };
  const first = runGate({ seen: null, reduced: false });
  expect(first.dataset.deal).toBe("1");
  first.timers.forEach((t) => t());
  expect(first.dataset.deal).toBeUndefined();
  expect(runGate({ seen: "1", reduced: false }).dataset.deal).toBeUndefined();
  expect(runGate({ seen: null, reduced: true }).dataset.deal).toBeUndefined();
  expect(() => runGate({ seen: null, reduced: false, storageThrows: true })).not.toThrow();
});
