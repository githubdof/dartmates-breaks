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
    // Task 11b adds pull and strike to this list.
    for (const name of ["land", "squash", "glint", "fadein", "set", "seat"]) expect(frames.has(name), name).toBe(true);
    for (const [name, body] of frames) {
      const props = [...body.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]);
      for (const p of props) expect(["transform", "translate", "scale", "opacity", "animation-timing-function"], `${name}: ${p}`).toContain(p);
    }
  });
  it("never transitions a background or a colour", () => {
    expect(css).not.toMatch(/transition(-property)?\s*:[^;]*(background|color)/);
  });
  it("makes every moment instant under reduced motion (no delay, no glint, no ghost)", () => {
    const blocks = css.split("@media (prefers-reduced-motion: reduce)").slice(1);
    expect(blocks.some((b) => b.includes("[data-moment], [data-moment] *") && b.includes(".bc-glint, .bc-ghost { display: none; }"))).toBe(true);
  });
});
