/**
 * The Mosaic motion tokens (spec §4 "Space, shape, motion") as numbers, for the few places JS times something: the
 * pay sheet's open delay, the per-landing count and reveal-plan.ts. CSS reads the same values from tokens.css;
 * motion.test.ts keeps the two in step. Every value is the spec's; never retype one elsewhere.
 */
export const MOTION = {
  press: 70, unpress: 120, drop: 160, squash: 80, settle: 120, glint: 220, others: 120, sent: 180, set: 140, seat: 100,
  release: 200, strike: 200, banner: 180, lights: 300, beat: 300, beatTop: 800, throw: 260, throwSettle: 140,
  shake: 120, gap: 550, lamp: 600, reduced: 150, staggerOwn: 50, staggerOthers: 30,
} as const;

/** reveal-plan.ts takes the tokens as a parameter so tests can pin totals against them. */
export type DurationTokens = { readonly [K in keyof typeof MOTION]: number };

export const EASE = { in: "cubic-bezier(.55,0,1,.45)", out: "cubic-bezier(.2,.7,.3,1)", over: "cubic-bezier(.3,1.5,.5,1)", inout: "ease-in-out" } as const;

/** The custom property each token lives under in tokens.css. */
export const MOTION_VAR: Record<keyof typeof MOTION, string> = {
  press: "--dur-press", unpress: "--dur-unpress", drop: "--dur-drop", squash: "--dur-squash", settle: "--dur-settle",
  glint: "--dur-glint", others: "--dur-others", sent: "--dur-sent", set: "--dur-set", seat: "--dur-seat",
  release: "--dur-release", strike: "--dur-strike", banner: "--dur-banner", lights: "--dur-lights", beat: "--dur-beat",
  beatTop: "--dur-beat-top", throw: "--dur-throw", throwSettle: "--dur-throw-settle", shake: "--dur-shake",
  gap: "--dur-gap", lamp: "--dur-lamp", reduced: "--dur-reduced", staggerOwn: "--stagger-own", staggerOthers: "--stagger-others",
};
export const EASE_VAR: Record<keyof typeof EASE, string> = { in: "--ease-in", out: "--ease-out", over: "--ease-over", inout: "--ease-inout" };

/** Where JS times something it checks reduced motion itself; CSS honours it on its own (globals.css). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
