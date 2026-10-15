import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { contrast, readTokens } from "@/lib/contrast";
import { PAPER_THEME_COLOR, WALL_THEME_COLOR, wallViewport } from "./wall";
import { DEFAULT_KIT, FLIGHT_COLOURS, LAMP, TOKENS } from "@/domain/flights";

const read = (f: string) => readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8");
const css = read("./tokens.css");
const globals = read("./globals.css");
const fonts = read("./fonts.ts");
const t = readTokens(css);
/** `--name: value;` whatever the value (readTokens keeps `#RRGGBB` only). */
const raw = (name: string) => css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();

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

describe("Mosaic board tokens (Mosaic spec §4)", () => {
  it("adds every board colour under a new name, exactly, and the default kit", () => {
    expect(t).toMatchObject({
      "board-wall": "#17161A", "board-wall-2": "#221F26", "board-cream": "#FBF7EE", "board-cream-2": "#EEE8DA",
      "board-ink": "#15130F", "board-ink-2": "#5A5246", "board-steel": "#7A7D84", "board-ring": "#0F0E0C",
      "board-text-2": "#D4CEC3", "board-text-3": "#B3ADA3", "kit-dark": "#2340C4", "kit-light": "#F7C51B",
    });
    expect(raw("board-text")).toBe("var(--board-cream)");
  });
  it("has the lamp's five literal steps", () => {
    expect([0, 1, 2, 3, 4].map((i) => raw(`lamp-${i}`))).toEqual([
      "rgba(255,232,200,0.06)", "rgba(255,232,200,0.095)", "rgba(255,232,200,0.13)", "rgba(255,232,200,0.165)", "rgba(255,232,200,0.20)",
    ]);
  });
  it("reads cream text on the wall at 8:1 or more (Review Focus 3)", () => {
    // Spec §4: 16.8:1, 11.5:1 and 8.1:1.
    for (const fg of ["board-cream", "board-text-2", "board-text-3"]) expect(contrast(t[fg], t["board-wall"]), `${fg} on the wall`).toBeGreaterThanOrEqual(8);
  });
  it("keeps the steel wire at 3:1 or more on the wall and on cream (Review Focus 3)", () => {
    // Spec §4: 4.4:1 on the wall, 3.9:1 on cream.
    expect(contrast(t["board-steel"], t["board-wall"])).toBeGreaterThanOrEqual(3);
    expect(contrast(t["board-steel"], t["board-cream"])).toBeGreaterThanOrEqual(3);
  });
  it("keeps the numbers on cream and on the reserved face at 4.5:1 or more", () => {
    expect(contrast(t["board-ink"], t["board-cream"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t["board-ink-2"], t["board-cream-2"])).toBeGreaterThanOrEqual(4.5); // spec: 6.3:1
  });
  it("keeps the place rings on the cream disc at the 3:1 non-text floor", () => {
    // Measured: red 5.5:1, green 4.98:1 (the spec rounds it to 5.0:1).
    expect(contrast(t.red, t["board-cream"])).toBeGreaterThanOrEqual(3);
    expect(contrast(t.green, t["board-cream"])).toBeGreaterThanOrEqual(3);
  });
  it("has the complete motion token set", () => {
    const MOTION: Record<string, string> = {
      "dur-press": "70ms", "dur-unpress": "120ms", "dur-drop": "160ms", "dur-squash": "80ms", "dur-settle": "120ms",
      "dur-glint": "220ms", "dur-others": "120ms", "dur-sent": "180ms", "dur-set": "140ms", "dur-seat": "100ms",
      "dur-release": "200ms", "dur-strike": "200ms", "dur-banner": "180ms", "dur-lights": "300ms", "dur-beat": "300ms",
      "dur-beat-top": "800ms", "dur-throw": "260ms", "dur-throw-settle": "140ms", "dur-shake": "120ms", "dur-gap": "550ms",
      "dur-lamp": "600ms", "dur-reduced": "150ms", "stagger-own": "50ms", "stagger-others": "30ms",
      "ease-in": "cubic-bezier(.55,0,1,.45)", "ease-out": "cubic-bezier(.2,.7,.3,1)", "ease-over": "cubic-bezier(.3,1.5,.5,1)", "ease-inout": "ease-in-out",
    };
    for (const [name, value] of Object.entries(MOTION)) expect(raw(name), name).toBe(value);
  });
  it("maps the board colours, the display face and its sizes through @theme inline", () => {
    for (const name of ["board-wall", "board-wall-2", "board-cream", "board-cream-2", "board-ink", "board-ink-2", "board-steel", "board-ring", "board-text", "board-text-2", "board-text-3", "kit-dark", "kit-light"]) {
      expect(css, name).toContain(`--color-${name}: var(--${name});`);
    }
    expect(css).toContain("--font-shoulders: var(--font-big-shoulders), var(--font-barlow-condensed), ui-sans-serif, sans-serif;");
    expect(raw("text-wall-title")).toBe("32px"); expect(raw("text-wall-title--line-height")).toBe("32px");
    expect(raw("text-caller")).toBe("26px"); expect(raw("text-caller--line-height")).toBe("28px");
    expect(raw("text-checkout")).toBe("22px"); expect(raw("text-checkout--line-height")).toBe("24px");
    expect(raw("text-wall-display")).toBe("40px"); expect(raw("text-wall-display--line-height")).toBe("40px");
  });
  it("paints the wall only where a route opts in with data-wall", () => {
    // Later tasks use --board-wall on board layers (the house-lights dim), so count only page backgrounds.
    expect([...globals.matchAll(/background-color: var\(--board-wall\)/g)]).toHaveLength(1);
    expect(globals).toMatch(/html:has\(\[data-wall\]\),\s*html:has\(\[data-wall\]\) body\s*\{\s*background-color: var\(--board-wall\);\s*\}/);
    // The shared footer keeps its contrast on the wall (its text-ink-2 would read about 2.6:1 there).
    expect(globals).toMatch(/html:has\(\[data-wall\]\) footer\s*\{\s*color: var\(--board-text-2\);\s*\}/);
  });
  it("pins Big Shoulders to its Display cut wherever it is drawn (Mosaic §4 type)", () => {
    // The opsz axis would otherwise follow the font size, and the 22 px count and the 26 px caller would draw an
    // intermediate cut. 72 is the axis maximum (Step 1).
    expect(globals).toMatch(/\.font-shoulders,\s*\.caller-banner\s*\{\s*font-variation-settings: "opsz" 72;\s*font-weight: 800;\s*\}/);
    expect(globals).not.toContain("font-optical-sizing");
  });
  it("sets theme-color to the wall on wall routes and to paper elsewhere", () => {
    expect(WALL_THEME_COLOR).toBe(t["board-wall"]);
    expect(PAPER_THEME_COLOR).toBe(t.paper);
    expect(wallViewport).toEqual({ themeColor: t["board-wall"] });
  });
  it("loads five font files: Barlow 400, 500, 600, Barlow Condensed 600, and Big Shoulders as one variable file", () => {
    expect(fonts).toMatch(/Barlow\(\{[^}]*weight: \["400", "500", "600"\]/);
    expect(fonts).toMatch(/Barlow_Condensed\(\{[^}]*weight: \["600"\]/);
    expect(fonts).toMatch(/Big_Shoulders\(\{[^}]*weight: "variable"[^}]*axes: \["opsz"\][^}]*preload: false/);
    expect(fonts).not.toMatch(/weight: \[[^\]]*"700"/);
  });
});
describe("flights.ts repeats tokens.css exactly (the link preview reads no CSS variables)", () => {
  const CSS_NAME: Record<keyof typeof TOKENS, string> = {
    boardWall: "board-wall", boardWall2: "board-wall-2", boardCream: "board-cream", boardCream2: "board-cream-2", boardInk: "board-ink",
    boardInk2: "board-ink-2", boardSteel: "board-steel", boardRing: "board-ring", boardText2: "board-text-2", boardText3: "board-text-3",
    red: "red", green: "green",
  };
  it("has every board hex once in TOKENS", () => {
    for (const k of Object.keys(TOKENS) as (keyof typeof TOKENS)[]) expect(TOKENS[k], k).toBe(t[CSS_NAME[k]]);
    const named = new Set(Object.values(CSS_NAME));
    expect(Object.keys(t).filter((k) => k.startsWith("board-") && !named.has(k))).toEqual([]);
  });
  it("has the lamp's steps in LAMP and the default kit in the kit tokens", () => {
    for (const s of [0, 1, 2, 3, 4] as const) expect(LAMP[s], `lamp-${s}`).toBe(raw(`lamp-${s}`));
    expect(t["kit-dark"]).toBe(FLIGHT_COLOURS[DEFAULT_KIT.dark].face);
    expect(t["kit-light"]).toBe(FLIGHT_COLOURS[DEFAULT_KIT.light].face);
  });
});
