import { readFileSync } from "node:fs";
import { join } from "node:path";

// Static TTFs (§6): the image renderer cannot use next/font, and these never reach a browser. next.config.ts traces
// assets/og into the route's bundle. Read on the first image, not at module load, so a missing file is an error the
// route can answer (404), not a module that fails to load (500).
const read = (file: string) => readFileSync(join(process.cwd(), "assets", "og", file));

type OgFont = { name: string; data: Buffer; weight: 500 | 600 | 800; style: "normal" };
let cached: OgFont[] | null = null;

export function ogFonts(): OgFont[] {
  cached ??= [
    { name: "Big Shoulders Display", data: read("BigShouldersDisplay-800.ttf"), weight: 800, style: "normal" },
    { name: "Barlow Condensed", data: read("BarlowCondensed-600.ttf"), weight: 600, style: "normal" },
    { name: "Barlow", data: read("Barlow-500.ttf"), weight: 500, style: "normal" },
  ];
  return cached;
}
