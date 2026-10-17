export type Point = { x: number; y: number };

/** CSS's cubic-bezier as a function of time: bisect for the curve parameter at x = t, return its y. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const at = (a: number, b: number, s: number) => 3 * (1 - s) * (1 - s) * s * a + 3 * (1 - s) * s * s * b + s * s * s;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let lo = 0, hi = 1;
    for (let i = 0; i < 32; i++) { const mid = (lo + hi) / 2; if (at(x1, x2, mid) < t) lo = mid; else hi = mid; }
    return at(y1, y2, (lo + hi) / 2);
  };
}

/** --ease-in, the throw's easing (§4): the dart accelerates into the board. */
export const easeIn = cubicBezier(0.55, 0, 1, 0.45);

/** The dart's angle, in degrees: set once at launch and never turned (§7 never list: no spinning, no turning). */
export const dartAngle = (from: Point, to: Point): number => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;

/** Where the point is at eased progress `e`: on the one straight line from the oche to the cell. */
export const dartAt = (from: Point, to: Point, e: number): Point => (e >= 1 ? to : { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });

/** The tip of the dart in its own 56 × 14 SVG box: the point that travels the line, and the rotation's origin. */
export const DART_TIP: Point = { x: 56, y: 7 };
