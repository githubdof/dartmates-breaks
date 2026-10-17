import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { contrast, luminance } from "@/lib/contrast";
import {
  DARK_COLOURS, DEFAULT_KIT, FLIGHT_COLOURS, FLIGHT_SHAPES, LAMP, LIGHT_COLOURS, TOKENS,
  flightOf, heatStep, inkFor, isFlightColour, isFlightShape, kitFor, type FlightColour, type FlightShape,
} from "./flights";

const colours = Object.keys(FLIGHT_COLOURS) as FlightColour[];
const shapes = Object.keys(FLIGHT_SHAPES) as FlightShape[];
const CREAM = TOKENS.boardCream;
const INK = TOKENS.boardInk;
/** Spec §4's table, "Contrast at 18 px / 600". */
const SPEC_CONTRAST: Record<FlightColour, number> = { petrol: 6.8, blue: 7.6, plum: 8.7, yellow: 11.5, orange: 8.0, lime: 10.9, sky: 9.7, pink: 9.4 };

/** Bounding box of a path written with absolute M, L, C and Z only (every number is part of an x, y pair). */
function box(path: string) {
  const n = (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const xs = n.filter((_, i) => i % 2 === 0);
  const ys = n.filter((_, i) => i % 2 === 1);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

describe("the flight set (Mosaic §4)", () => {
  it("keeps its stored keys in order: eight colours in two tiers, four shapes, 32 flights", () => {
    expect(colours).toEqual(["petrol", "blue", "plum", "yellow", "orange", "lime", "sky", "pink"]);
    expect(shapes).toEqual(["standard", "kite", "slim", "pear"]);
    expect(DARK_COLOURS).toEqual(["petrol", "blue", "plum"]);
    expect(LIGHT_COLOURS).toEqual(["yellow", "orange", "lime", "sky", "pink"]);
    expect(colours.filter((c) => FLIGHT_COLOURS[c].tier === "dark")).toEqual(DARK_COLOURS);
    expect(colours.length * shapes.length).toBe(32);
    expect(colours.map((c) => FLIGHT_COLOURS[c].label)).toEqual(["Petrol", "Blue", "Plum", "Yellow", "Orange", "Lime", "Sky", "Pink"]);
  });

  it("reads every face at 5:1 or better against its number ink, at every cell size (Review Focus 3)", () => {
    // Contrast does not depend on the cell size, and the board has no sheen (Mosaic §2): the face is the number's whole background.
    for (const c of colours) {
      const { face, ink } = FLIGHT_COLOURS[c];
      const other = ink === CREAM ? INK : CREAM;
      expect(contrast(face, ink), c).toBeGreaterThanOrEqual(5);
      expect(contrast(face, ink), `${c} uses the better of the two inks`).toBeGreaterThan(contrast(face, other));
      expect(Math.abs(contrast(face, ink) - SPEC_CONTRAST[c]), `${c} matches the spec's table`).toBeLessThan(0.1);
    }
  });

  it("follows the ink rule and leaves out the mid tones", () => {
    for (const c of colours) {
      const { face, ink, tier } = FLIGHT_COLOURS[c];
      expect(ink, c).toBe(inkFor(face));
      expect(tier === "dark", c).toBe(ink === CREAM);
      const l = luminance(face);
      expect(l < 0.15 || l > 0.24, `${c} luminance ${l.toFixed(3)} is outside 0.15 to 0.24`).toBe(true);
    }
  });

  it("never uses red, green, black, cream or a board colour as a face", () => {
    const banned: string[] = [TOKENS.red, TOKENS.green, "#E8102E", "#16A34A", TOKENS.boardRing, TOKENS.boardInk, TOKENS.boardWall, TOKENS.boardWall2, TOKENS.boardCream, TOKENS.boardCream2, "#000000", "#FFFFFF"];
    for (const c of colours) expect(banned, c).not.toContain(FLIGHT_COLOURS[c].face.toUpperCase());
  });

  it("draws each shape inside the 16 × 16 box with the spec's aspect ratio", () => {
    // standard 15 × 11 (1.36), pear 13 × 13 (1.0), kite 10 × 15 (0.67), slim 6 × 15 (0.40).
    const RATIO: Record<FlightShape, number> = { standard: 1.36, pear: 1.0, kite: 0.67, slim: 0.4 };
    for (const s of shapes) {
      const b = box(FLIGHT_SHAPES[s].path);
      expect(b.minX >= 0 && b.minY >= 0 && b.maxX <= 16 && b.maxY <= 16, `${s} fits the box`).toBe(true);
      expect((b.maxX - b.minX) / (b.maxY - b.minY), s).toBeCloseTo(RATIO[s], 2);
    }
    expect(shapes.map((s) => FLIGHT_SHAPES[s].label)).toEqual(["Standard", "Kite", "Slim", "Pear"]);
  });

  it("knows the stored keys and nothing else", () => {
    expect(isFlightColour("blue")).toBe(true);
    expect(isFlightColour("red")).toBe(false);
    expect(isFlightColour("constructor")).toBe(false);
    expect(isFlightShape("pear")).toBe(true);
    expect(isFlightShape("dart")).toBe(false);
    expect(flightOf({ flightColour: "sky", flightShape: "kite" })).toEqual({ colour: "sky", shape: "kite" });
    expect(() => flightOf({ flightColour: "red", flightShape: "kite" })).toThrow(/Unknown flight red-kite/);
  });
});

describe("kits (Mosaic §4)", () => {
  it("pair one dark and one light colour: 15 kits, Blue with Yellow by default", () => {
    expect(DEFAULT_KIT).toEqual({ dark: "blue", light: "yellow" });
    expect(DARK_COLOURS.length * LIGHT_COLOURS.length).toBe(15);
    expect(kitFor({ kitDark: "petrol", kitLight: "pink" })).toEqual({ dark: "petrol", light: "pink" });
    expect(kitFor({ kitDark: null, kitLight: null })).toEqual(DEFAULT_KIT);
    expect(kitFor({ kitDark: "petrol", kitLight: null })).toEqual(DEFAULT_KIT);
    expect(kitFor({ kitDark: "yellow", kitLight: "blue" })).toEqual(DEFAULT_KIT); // tiers swapped
    expect(kitFor({ kitDark: "red", kitLight: "pink" })).toEqual(DEFAULT_KIT);
  });
  it("show the light pinstripe on the wall at 7.7:1 or more; a dark glyph on the wall is under 3:1, hence its cream keyline", () => {
    for (const c of LIGHT_COLOURS) expect(contrast(FLIGHT_COLOURS[c].face, TOKENS.boardWall), c).toBeGreaterThanOrEqual(7.7);
    for (const c of DARK_COLOURS) expect(contrast(FLIGHT_COLOURS[c].face, TOKENS.boardWall), c).toBeLessThan(3);
  });
});

describe("heat (Mosaic §4)", () => {
  it("steps at a quarter, a half and three quarters claimed, and takes the top step only when closed", () => {
    expect(heatStep(38, 50, false)).toBe(0); // 12 of 50 claimed
    expect(heatStep(37, 50, false)).toBe(1); // 13 of 50
    expect(heatStep(25, 50, false)).toBe(2); // 25 of 50
    expect(heatStep(13, 50, false)).toBe(2); // 37 of 50
    expect(heatStep(12, 50, false)).toBe(3); // 38 of 50
    expect(heatStep(0, 50, false)).toBe(3); // every line claimed, not yet closed
    expect(heatStep(0, 50, true)).toBe(4);
    expect(heatStep(50, 50, false)).toBe(0);
    expect(heatStep(0, 0, false)).toBe(0);
  });
  it("is one warm white whose alpha only rises, never above 0.20", () => {
    expect(LAMP).toEqual({
      0: "rgba(255,232,200,0.06)", 1: "rgba(255,232,200,0.095)", 2: "rgba(255,232,200,0.13)", 3: "rgba(255,232,200,0.165)", 4: "rgba(255,232,200,0.20)",
    });
    const parsed = ([0, 1, 2, 3, 4] as const).map((s) => LAMP[s].match(/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/)!);
    expect(new Set(parsed.map((m) => m.slice(1, 4).join()))).toEqual(new Set(["255,232,200"]));
    const alphas = parsed.map((m) => Number(m[4]));
    for (let i = 1; i < alphas.length; i++) expect(alphas[i]).toBeGreaterThan(alphas[i - 1]);
    expect(Math.max(...alphas)).toBeLessThanOrEqual(0.2);
  });
});

describe("the stored keys match migration 0004", () => {
  it("has the palette's keys in its CHECK lists and its random defaults", () => {
    const text = readFileSync(new URL("../db/migrations/0004_flights_kits.sql", import.meta.url), "utf8");
    const list = (name: string) => text.match(new RegExp(`"${name}" CHECK \\([^)]* in \\(([^)]*)\\)\\)`))?.[1].split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(list("users_flight_colour_chk")).toEqual(Object.keys(FLIGHT_COLOURS));
    expect(list("users_flight_shape_chk")).toEqual(Object.keys(FLIGHT_SHAPES));
    expect(list("host_profiles_kit_dark_chk")).toEqual(DARK_COLOURS);
    expect(list("host_profiles_kit_light_chk")).toEqual(LIGHT_COLOURS);
    const defaults = [...text.matchAll(/array\[([^\]]*)\]/g)].map((m) => m[1].split(",").map((s) => s.trim().replace(/'/g, "")));
    expect(defaults).toEqual([Object.keys(FLIGHT_COLOURS), Object.keys(FLIGHT_SHAPES)]);
  });
});
