import { it, expect } from "vitest";
import { dealDelays, dealGateScript, liftDelay, DEAL_MS, placeLabel, seenKey, topSpotText } from "./reveal-plan";

it("deals the order worst first so the top spot lands last, within about 1.5 s", () => {
  expect(dealDelays(3)).toEqual([240, 120, 0]);
  const fifty = dealDelays(50);
  expect(fifty[0]).toBe(Math.max(...fifty));
  expect(fifty[49]).toBe(0);
  expect(fifty[0]).toBeLessThanOrEqual(DEAL_MS);
  expect(dealDelays(1)).toEqual([0]);
});

it("lifts the top spot after its own deal-in", () => {
  expect(liftDelay(3)).toBe(480);
  expect(liftDelay(1)).toBe(240);
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
    // The script runs against these stand-ins for the browser globals it names.
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
