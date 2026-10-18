import { LAMP, type HeatStep } from "@/domain/flights";

const RGBA = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/;

/**
 * How far the lamp reaches past the board (recorded ruling 18): 32 px above and below, 16 px to each side, which is the
 * screen edge at 390 and 360, so nothing scrolls sideways. globals.css .board-lamp writes it as its inset; a render test
 * keeps the two in step. Thumbnails reach 12 px (.thumb-lamp).
 */
export const LAMP_POSITION = "-32px -16px";

/**
 * The lamp (Mosaic §4 Heat): one warm white whose hue never changes. The gradient takes LAMP's colour at full alpha and
 * the step becomes the layer's opacity, so a step change is an opacity transition on one layer (--dur-lamp) and never
 * a background change. The server renders the final opacity, so nothing transitions on mount.
 */
export function lampLayer(step: HeatStep): { backgroundImage: string; opacity: number } {
  const m = RGBA.exec(LAMP[step].replace(/\s+/g, ""));
  if (!m) throw new Error(`LAMP[${step}] is not an rgba() string`);
  return { backgroundImage: `radial-gradient(ellipse at center, rgba(${m[1]},${m[2]},${m[3]},1), transparent 70%)`, opacity: Number(m[4]) };
}
