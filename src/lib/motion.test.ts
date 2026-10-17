import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EASE, EASE_VAR, MOTION, MOTION_VAR } from "./motion";

// Whitespace and leading zeros do not matter: "cubic-bezier(0.55, 0, 1, 0.45)" is "cubic-bezier(.55,0,1,.45)".
const norm = (s: string) => s.replace(/\s+/g, "").replace(/(^|[(,:])0\./g, "$1.");
const css = norm(readFileSync(fileURLToPath(new URL("../app/tokens.css", import.meta.url)), "utf8"));

describe("motion tokens (Mosaic §4, the complete set)", () => {
  it("are the spec's values", () => {
    expect(MOTION).toEqual({
      press: 70, unpress: 120, drop: 160, squash: 80, settle: 120, glint: 220, others: 120, sent: 180, set: 140, seat: 100,
      release: 200, strike: 200, banner: 180, lights: 300, beat: 300, beatTop: 800, throw: 260, throwSettle: 140,
      shake: 120, gap: 550, lamp: 600, reduced: 150, staggerOwn: 50, staggerOthers: 30,
    });
    expect(EASE).toEqual({ in: "cubic-bezier(.55,0,1,.45)", out: "cubic-bezier(.2,.7,.3,1)", over: "cubic-bezier(.3,1.5,.5,1)", inout: "ease-in-out" });
  });
  it("match tokens.css one for one, so CSS and JS never drift", () => {
    for (const k of Object.keys(MOTION) as (keyof typeof MOTION)[]) expect(css, MOTION_VAR[k]).toContain(`${MOTION_VAR[k]}:${MOTION[k]}ms;`);
    for (const k of Object.keys(EASE) as (keyof typeof EASE)[]) expect(css, EASE_VAR[k]).toContain(norm(`${EASE_VAR[k]}:${EASE[k]};`));
  });
});
