import { describe, it, expect } from "vitest";
import { cubicBezier, dartAngle, dartAt, easeIn } from "./dart";

describe("the neutral dart (§7 Draw: each throw)", () => {
  it("accelerates into the board on --ease-in, from 0 to 1, never backwards", () => {
    expect(easeIn(0)).toBe(0);
    expect(easeIn(1)).toBe(1);
    expect(easeIn(0.5)).toBeLessThan(0.5);
    let last = 0;
    for (let t = 0; t <= 1; t += 0.01) { const e = easeIn(t); expect(e).toBeGreaterThanOrEqual(last - 1e-9); last = e; }
    expect(cubicBezier(0, 0, 1, 1)(0.3)).toBeCloseTo(0.3, 3);
  });
  it("flies one straight line, point first, at one angle fixed at launch", () => {
    const from = { x: 195, y: 360 }, to = { x: 60, y: 40 };
    for (const e of [0, 0.25, 0.5, 0.9, 1]) {
      const p = dartAt(from, to, e);
      // collinear with from and to: the cross product is zero
      expect((p.x - from.x) * (to.y - from.y) - (p.y - from.y) * (to.x - from.x)).toBeCloseTo(0, 6);
    }
    expect(dartAt(from, to, 1)).toEqual(to);
    expect(dartAngle(from, to)).toBeCloseTo((Math.atan2(-320, -135) * 180) / Math.PI, 9);
    expect(dartAngle({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
  });
});
