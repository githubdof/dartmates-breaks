import { it, expect } from "vitest";
import { dealDelays, dealGateScript, DEAL_MS, placeLabel, seenKey, topSpotText } from "./reveal-plan";

it("deals the order worst first so the top spot lands last, within about 1.5 s", () => {
  expect(dealDelays(3)).toEqual([240, 120, 0]);
  const fifty = dealDelays(50);
  expect(fifty[0]).toBe(Math.max(...fifty));
  expect(fifty[49]).toBe(0);
  expect(fifty[0]).toBeLessThanOrEqual(DEAL_MS);
  expect(dealDelays(1)).toEqual([0]);
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
