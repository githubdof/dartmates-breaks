import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { ImageResponse } from "next/og";
import type { OgCell, OgModel } from "@/domain/breaks/og";
import { DEFAULT_KIT, type Kit } from "@/domain/flights";
import { OG_FONTS } from "./fonts";
import { fillerCount, OG_SIZE, ogImage } from "./image";

// No PNG byte snapshots: the renderer's bytes differ across platforms (recorded ruling 25). Every status renders in two
// kits to a 1200 × 630 PNG. With OG_PREVIEW=1, one PNG per status and kit goes to .superpowers/og-preview/ for a by-eye
// check (spec §12: the default and one other kit); that folder is never committed.
const PREVIEW_DIR = ".superpowers/og-preview";
const KITS: [string, Kit][] = [["default", DEFAULT_KIT], ["plum-lime", { dark: "plum", light: "lime" }]];
const fifty = (f: (n: number) => Omit<OgCell, "number">): OgCell[] => Array.from({ length: 50 }, (_, i) => ({ number: i + 1, ...f(i + 1) }));
const model = (o: Partial<OgModel>): OgModel => ({
  title: "Target Nexus 90% 22g, full set", caption: "50 to go, $5 a line", hostedBy: "Hosted by @jim",
  kit: DEFAULT_KIT, heat: 0, columns: 8, cells: fifty(() => ({ tone: "open" })), ...o,
});
const PLACES: Record<number, 1 | 2 | 3> = { 23: 1, 14: 2, 9: 3 };
const STATUSES: Record<string, Partial<OgModel>> = {
  "open-0": {},
  // 25 of 50 claimed (heat step 2): taken and paid alternate, one reserved for a mini.
  "open-50": { caption: "25 to go, $5 a line", heat: 2, cells: fifty((n) => ({ tone: n > 25 ? "open" : n === 25 ? "reserved" : n % 2 ? "taken" : "paid" })) },
  closed: { caption: "Closed. Every line is paid.", heat: 4, cells: fifty(() => ({ tone: "paid" })) },
  ran: { caption: "Ran Oct 14. Anyone can check the draw.", heat: 4, cells: fifty((n) => (PLACES[n] ? { tone: "won", place: PLACES[n] } : { tone: "paid" })) },
};

describe("the link-preview image (Mosaic §6)", () => {
  it("fills the last row's empty slots, and short boards, with wall-2 slots", () => {
    expect(fillerCount(50, 8)).toBe(6);
    expect(fillerCount(48, 8)).toBe(0);
    expect(fillerCount(2, 4)).toBe(2);
  });
  for (const [status, o] of Object.entries(STATUSES)) {
    for (const [kitName, kit] of KITS) {
      it(`${status} in the ${kitName} kit renders a 1200 × 630 PNG`, async () => {
        const png = Buffer.from(await new ImageResponse(ogImage(model({ ...o, kit })), { ...OG_SIZE, fonts: OG_FONTS }).arrayBuffer());
        expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
        // The IHDR chunk: width, then height, as big-endian 32-bit integers at bytes 16 and 20.
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
        if (process.env.OG_PREVIEW === "1") {
          mkdirSync(PREVIEW_DIR, { recursive: true });
          writeFileSync(`${PREVIEW_DIR}/${status}-${kitName}.png`, png);
        }
      }, 30_000);
    }
  }
});
