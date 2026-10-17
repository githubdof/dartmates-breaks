import { luminance } from "@/lib/contrast";

/**
 * The flight set, the host kits and the lamp (Mosaic spec §4, §10). Colour and shape keys are stored in
 * users.flight_colour / flight_shape and host_profiles.kit_dark / kit_light (migration 0004): the set may grow, but a
 * key is never reordered or renamed. All 32 flights and all 15 kits are open to everyone from day one. Faces are never
 * red or green: those are the board's ring colours.
 */
export type FlightColour = "petrol" | "blue" | "plum" | "yellow" | "orange" | "lime" | "sky" | "pink";
export type FlightShape = "standard" | "kite" | "slim" | "pear";
export type Flight = { colour: FlightColour; shape: FlightShape };

/** The ink rule: cream numbers on faces with luminance below 0.186, ink above. */
export function inkFor(face: string): "#FBF7EE" | "#15130F" {
  return luminance(face) < 0.186 ? "#FBF7EE" : "#15130F";
}

export const FLIGHT_COLOURS: Record<FlightColour, { face: string; ink: "#FBF7EE" | "#15130F"; tier: "dark" | "light"; label: string }> = {
  petrol: { face: "#0B5E7A", ink: "#FBF7EE", tier: "dark", label: "Petrol" },
  blue: { face: "#2340C4", ink: "#FBF7EE", tier: "dark", label: "Blue" },
  plum: { face: "#82195F", ink: "#FBF7EE", tier: "dark", label: "Plum" },
  yellow: { face: "#F7C51B", ink: "#15130F", tier: "light", label: "Yellow" },
  orange: { face: "#F5913A", ink: "#15130F", tier: "light", label: "Orange" },
  lime: { face: "#AED445", ink: "#15130F", tier: "light", label: "Lime" },
  sky: { face: "#7CC4EE", ink: "#15130F", tier: "light", label: "Sky" },
  pink: { face: "#F4A0C4", ink: "#15130F", tier: "light", label: "Pink" },
};

/**
 * One silhouette per shape in a 16 × 16 box, absolute M, L, C and Z only. Boxes spaced so they survive blur:
 * standard 15 × 11 (wide, a shallow notch at the top), kite 10 × 15 (a diamond), slim 6 × 15, pear 13 × 13 (a
 * teardrop, round at the top).
 */
export const FLIGHT_SHAPES: Record<FlightShape, { path: string; label: string }> = {
  standard: { path: "M0.5 2.5 L8 4.5 L15.5 2.5 L15.5 13.5 L0.5 13.5 Z", label: "Standard" },
  kite: { path: "M8 0.5 L13 6 L8 15.5 L3 6 Z", label: "Kite" },
  slim: { path: "M8 0.5 L11 4.5 L11 15.5 L5 15.5 L5 4.5 Z", label: "Slim" },
  pear: { path: "M8 14.5 C5 12 1.5 9.5 1.5 6.5 C1.5 3.5 4.5 1.5 8 1.5 C11.5 1.5 14.5 3.5 14.5 6.5 C14.5 9.5 11 12 8 14.5 Z", label: "Pear" },
};

export const DARK_COLOURS: readonly FlightColour[] = ["petrol", "blue", "plum"];
export const LIGHT_COLOURS: readonly FlightColour[] = ["yellow", "orange", "lime", "sky", "pink"];

/** The per-break collision rule (Mosaic §5): its shape order, and the colour pairs that blur under colour-blind simulation. */
export const COLLISION_ORDER: readonly FlightShape[] = ["standard", "pear", "kite", "slim"];
export const WATCHED_PAIR: Readonly<Partial<Record<FlightColour, FlightColour>>> = { yellow: "lime", lime: "yellow", petrol: "plum", plum: "petrol" };

const COLOUR_KEYS: readonly string[] = Object.keys(FLIGHT_COLOURS);
const SHAPE_KEYS: readonly string[] = Object.keys(FLIGHT_SHAPES);
export function isFlightColour(s: string): s is FlightColour {
  return COLOUR_KEYS.includes(s);
}
export function isFlightShape(s: string): s is FlightShape {
  return SHAPE_KEYS.includes(s);
}

/** A stored flight. Migration 0004's CHECKs keep both columns to these keys, so anything else is a bug, not input. */
export function flightOf(u: { flightColour: string; flightShape: string }): Flight {
  if (!isFlightColour(u.flightColour) || !isFlightShape(u.flightShape)) throw new Error(`Unknown flight ${u.flightColour}-${u.flightShape}`);
  return { colour: u.flightColour, shape: u.flightShape };
}

export type Kit = { dark: FlightColour; light: FlightColour };
export const DEFAULT_KIT: Kit = { dark: "blue", light: "yellow" };

/** The host's kit from host_profiles. None, a half-set pair or a pair in the wrong tiers reads as the default, Blue with Yellow. */
export function kitFor(p: { kitDark: string | null; kitLight: string | null }): Kit {
  const { kitDark: dark, kitLight: light } = p;
  if (dark && light && isFlightColour(dark) && isFlightColour(light) && DARK_COLOURS.includes(dark) && LIGHT_COLOURS.includes(light)) return { dark, light };
  return { ...DEFAULT_KIT };
}

export type HeatStep = 0 | 1 | 2 | 3 | 4;

/**
 * The lamp's step (Mosaic §4 Heat). Numbered lines only; claimed means not open (taken, sent, paid or reserved for a
 * mini), which is listFeed.open. Closed from Closed on (closed, running draw, ran), so it is frozen through the draw.
 */
export function heatStep(open: number, total: number, closed: boolean): HeatStep {
  if (closed) return 4;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(3, Math.floor((4 * (total - open)) / total))) as HeatStep;
}

/** One warm white whose alpha only rises; CSS (--lamp-0 to --lamp-4) and the link preview share these strings. */
export const LAMP: Record<HeatStep, string> = {
  0: "rgba(255,232,200,0.06)",
  1: "rgba(255,232,200,0.095)",
  2: "rgba(255,232,200,0.13)",
  3: "rgba(255,232,200,0.165)",
  4: "rgba(255,232,200,0.20)",
};

/** Every board hex of tokens.css, once, for renderers that read no CSS variables (the OG route). Pinned by tokens.test.ts. */
export const TOKENS = {
  boardWall: "#17161A",
  boardWall2: "#221F26",
  boardCream: "#FBF7EE",
  boardCream2: "#EEE8DA",
  boardInk: "#15130F",
  boardInk2: "#5A5246",
  boardSteel: "#7A7D84",
  boardRing: "#0F0E0C",
  boardText2: "#D4CEC3",
  boardText3: "#B3ADA3",
  red: "#C8102E",
  green: "#1E7A4C",
} as const;
