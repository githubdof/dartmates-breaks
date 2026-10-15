import { readFileSync } from "node:fs";
import { join } from "node:path";

// Static TTFs read once at module load (§6): the image renderer cannot use next/font, and these never reach a browser.
// next.config.ts traces assets/og into the route's bundle.
const read = (file: string) => readFileSync(join(process.cwd(), "assets", "og", file));

export const OG_FONTS = [
  { name: "Big Shoulders Display", data: read("BigShouldersDisplay-800.ttf"), weight: 800 as const, style: "normal" as const },
  { name: "Barlow Condensed", data: read("BarlowCondensed-600.ttf"), weight: 600 as const, style: "normal" as const },
  { name: "Barlow", data: read("Barlow-500.ttf"), weight: 500 as const, style: "normal" as const },
];
