import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { ImageResponse } from "next/og";
import type { OgCell, OgModel } from "@/domain/breaks/og";
import { DEFAULT_KIT, LAMP, type Kit } from "@/domain/flights";
import { ogFonts } from "./fonts";
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

// The element tree with every function component called, so a test reads the styles the renderer gets.
type El = { type: unknown; props: { style?: Record<string, unknown>; children?: unknown } };
const isEl = (x: unknown): x is El => typeof x === "object" && x !== null && "props" in x;
function expand(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(expand);
  if (!isEl(x)) return x;
  if (typeof x.type === "function") return expand((x.type as (p: unknown) => unknown)(x.props));
  return { ...x, props: { ...x.props, children: expand(x.props.children) } };
}
function find(x: unknown, test: (e: El) => boolean): El[] {
  if (Array.isArray(x)) return x.flatMap((c) => find(c, test));
  if (!isEl(x)) return [];
  return [...(test(x) ? [x] : []), ...find(x.props.children, test)];
}
const numberDisc = (tree: unknown, n: number) => find(tree, (e) => e.props.children === String(n) && e.props.style?.borderRadius === "50%")[0];

describe("the preview's bull and lamp (review fix round 1)", () => {
  const ran = (columns: number) => expand(ogImage(model({ ...STATUSES.ran, columns })));
  it("keeps the top-spot number inside its inner ring: 0.4 × the disc; 2nd and 3rd at 16/26", () => {
    // 8 columns: 62 px cells, a 30 px disc, a 3 px ring, a 2 px gap: a 14 px centre, so a 12 px number.
    const t8 = ran(8);
    expect(numberDisc(t8, 23).props.style?.fontSize).toBe(12);
    expect(numberDisc(t8, 14).props.style?.fontSize).toBe(18);
    expect(numberDisc(t8, 9).props.style?.fontSize).toBe(18);
    // 4 columns: 125 px cells, a 60 px disc and a 30 px centre, so a 24 px number.
    expect(numberDisc(ran(4), 23).props.style?.fontSize).toBe(24);
  });
  it("lights the whole preview from the board's side, at the break's heat step, not only the board column", () => {
    for (const heat of [0, 2, 4] as const) {
      const root = expand(ogImage(model({ heat }))) as El;
      expect(root.props.style?.backgroundImage).toBe(`radial-gradient(ellipse at 26% 50%, ${LAMP[heat]}, transparent 70%)`);
      const [boardColumn] = root.props.children as El[];
      expect(boardColumn.props.style?.backgroundImage).toBeUndefined();
    }
  });
});

describe("the link-preview image (Mosaic §6)", () => {
  it("fills the last row's empty slots, and short boards, with wall-2 slots", () => {
    expect(fillerCount(50, 8)).toBe(6);
    expect(fillerCount(48, 8)).toBe(0);
    expect(fillerCount(2, 4)).toBe(2);
  });
  for (const [status, o] of Object.entries(STATUSES)) {
    for (const [kitName, kit] of KITS) {
      it(`${status} in the ${kitName} kit renders a 1200 × 630 PNG`, async () => {
        const png = Buffer.from(await new ImageResponse(ogImage(model({ ...o, kit })), { ...OG_SIZE, fonts: ogFonts() }).arrayBuffer());
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
