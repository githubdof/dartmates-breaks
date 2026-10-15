import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");

/** Every @keyframes block: name → its body (nested braces matched). */
function keyframes(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 1, i = re.lastIndex;
    while (depth > 0 && i < src.length) { if (src[i] === "{") depth++; else if (src[i] === "}") depth--; i++; }
    out.set(m[1], src.slice(re.lastIndex, i - 1));
  }
  return out;
}

describe("per-cell motion is CSS on transform and opacity only (Mosaic §7, Global Constraints: Motion)", () => {
  it("animates no other property in any of the board's keyframes", () => {
    const frames = keyframes(css);
    for (const name of ["land", "squash", "glint", "fadein", "set", "seat", "pull", "strike"]) expect(frames.has(name), name).toBe(true);
    for (const [name, body] of frames) {
      const props = [...body.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]);
      for (const p of props) expect(["transform", "translate", "scale", "opacity", "animation-timing-function"], `${name}: ${p}`).toContain(p);
    }
  });
  it("never transitions a background or a colour", () => {
    expect(css).not.toMatch(/transition(-property)?\s*:[^;]*(background|color)/);
  });
  it("draws each ghost while its moment plays and hides it once the moment ends (§7 Paid: the old ink holds only until the fade ends)", () => {
    const frames = keyframes(css);
    /** Opacity of a keyframe at progress p (from/to only, linear between). */
    const opacityAt = (name: string, p: number) => {
      const body = frames.get(name) ?? "";
      const from = Number(/from\s*\{[^}]*opacity:\s*([\d.]+)/.exec(body)?.[1]);
      const to = Number(/to\s*\{[^}]*opacity:\s*([\d.]+)/.exec(body)?.[1]);
      return from + (to - from) * p;
    };
    /** Timing functions at x outside the before phase: step-start is 1 everywhere (even at 0), step-end only at 1; easings keep 0 and 1. */
    const ease = (fn: string, x: number) => (fn === "step-start" ? 1 : fn === "step-end" ? (x >= 1 ? 1 : 0) : x);
    for (const moment of ["sent", "paid", "paid-undo", "release"]) {
      const rule = new RegExp(`\\[data-moment="${moment}"\\] > \\.bc-ghost \\{[^}]*animation:\\s*([^;]+);`).exec(css)?.[1] ?? "";
      expect(rule, moment).not.toBe("");
      const name = rule.trim().split(/\s+/)[0];
      const fn = (/(step-start|step-end|ease-in-out|ease-out|ease-in|linear|var\(--ease-[a-z]+\))/.exec(rule)?.[1] ?? "linear");
      const reverse = /\breverse\b/.test(rule);
      // After the moment (fill forwards): iteration progress 1, directed progress 0 when reversed.
      const end = opacityAt(name, ease(fn, reverse ? 0 : 1));
      // Just after the moment starts: the old cell is still drawn.
      const start = opacityAt(name, ease(fn, reverse ? 0.99 : 0.01));
      expect(end, `${moment} ghost at the end`).toBe(0);
      if (moment === "paid") expect(start, "paid ghost while the overlay fades").toBe(1);
      else expect(start, `${moment} ghost at the start`).toBeGreaterThan(0.9);
    }
  });
  it("makes every moment instant under reduced motion (no delay, no glint, no ghost)", () => {
    const blocks = css.split("@media (prefers-reduced-motion: reduce)").slice(1);
    expect(blocks.some((b) => b.includes("[data-moment], [data-moment] *") && b.includes(".bc-glint, .bc-ghost { display: none; }"))).toBe(true);
    expect(blocks.some((b) => b.includes(".caller-banner[data-play] { animation: none !important; }"))).toBe(true);
  });
});
