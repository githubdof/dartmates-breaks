import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { contrast, readTokens } from "@/lib/contrast";

const css = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf8");
const t = readTokens(css);

describe("design tokens", () => {
  it("defines every design colour exactly", () => {
    expect(t).toMatchObject({
      paper: "#F6F5F1", card: "#FFFFFF", ink: "#000000", "ink-2": "#5C5A55", "wire-strong": "#86827A",
      wire: "#C9C6BE", "wire-2": "#E6E4DE", green: "#1E7A4C", red: "#C8102E",
    });
  });
  it("keeps every text pair at 4.5:1 or more", () => {
    // ["card", "ink"]: every paid cell's number is white on black, the viewer's own included (recorded erratum 1).
    const pairs: [string, string][] = [["ink", "paper"], ["ink-2", "paper"], ["ink-2", "card"], ["card", "green"], ["card", "red"], ["green", "paper"], ["red", "card"], ["card", "ink"]];
    for (const [fg, bg] of pairs) expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
  it("never puts a green number on a black cell", () => {
    // Owner ruling (recorded erratum 1): green on ink measures 3.9:1, so a paid cell that is yours keeps a white
    // number and shows "mine" with the white corner flag and "yours" in its name. Do not bring the green back.
    expect(contrast(t.green, t.ink)).toBeLessThan(4.5);
  });
  it("keeps state-bearing edges at 3:1 or more", () => {
    expect(contrast(t["wire-strong"], t.card)).toBeGreaterThanOrEqual(3);
    expect(contrast(t["wire-strong"], t.paper)).toBeGreaterThanOrEqual(3);
  });
  it("maps the tokens through @theme inline and has no tailwind config file", () => {
    expect(css).toContain("@theme inline");
    expect(css).toContain("--color-ink-2: var(--ink-2)");
    for (const f of ["tailwind.config.ts", "tailwind.config.js", "tailwind.config.mjs", "tailwind.config.cjs"]) expect(existsSync(f)).toBe(false);
  });
});
