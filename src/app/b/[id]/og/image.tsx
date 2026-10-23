import type { OgCell, OgModel } from "@/domain/breaks/og";
import { FLIGHT_COLOURS, LAMP, TOKENS } from "@/domain/flights";

export const OG_SIZE = { width: 1200, height: 630 } as const;
/** The grid box. The ×2 frame (24 px of spread) sits in the 64 px padding, leaving 40 px (§6). */
export const GRID_PX = 500;
const PAD = 64;
/** The lead photo plate's image side (photos spec §8.4): 200 px beside the board, 120 px on a ran break. */
export const OG_PLATE_PX = 200;
export const OG_PLATE_RAN_PX = 120;
/** The board plate ×2 (photos spec §8.0), as the frame is: a 6 px wall-2 mat inside a 2 px steel keyline. */
const PLATE_MAT = 6;
const PLATE_KEYLINE = 2;

/** Empty slots in the last row (and on boards under four lines): --board-wall-2, never the wire (Plan B deferred finding). */
export const fillerCount = (cells: number, columns: number): number => (columns - (cells % columns)) % columns;

/** The won cell's bull (§6): a cream disc at 0.48 × the cell; the place's ring at 0.05 × the cell; an ink number; no glyph. */
function Bull({ n, place, cell }: { n: number; place: 1 | 2 | 3; cell: number }) {
  const d = Math.round(cell * 0.48);
  const w = Math.max(2, Math.round(cell * 0.05));
  const colour = place === 1 ? TOKENS.red : TOKENS.green;
  // 2nd and 3rd: §5's 16 px number on a 26 px disc, the same share here. The top spot's double ring leaves a smaller
  // centre (0.48 of the disc at every size), so its number is 0.4 × the disc: 12 px in the 14 px centre at a 62 px cell.
  const fontSize = place === 1 ? Math.round(d * 0.4) : Math.round((d * 16) / 26);
  const disc = { display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: TOKENS.boardCream, color: TOKENS.boardInk, fontSize };
  if (place !== 1) return <div style={{ ...disc, width: d, height: d, border: `${w}px ${place === 3 ? "dashed" : "solid"} ${colour}` }}>{String(n)}</div>;
  // Double for the top spot: two red bands with a cream gap.
  const gap = Math.max(1, Math.round(w / 2));
  const inner = d - 2 * w - 2 * gap;
  return (
    <div style={{ ...disc, width: d, height: d, border: `${w}px solid ${colour}` }}>
      <div style={{ ...disc, width: inner, height: inner, border: `${w}px solid ${colour}` }}>{String(n)}</div>
    </div>
  );
}

function Cell({ c, size, dark, light }: { c: OgCell; size: number; dark: string; light: string }) {
  const face = c.tone === "paid" ? dark : c.tone === "reserved" ? TOKENS.boardCream2 : c.tone === "won" ? TOKENS.boardRing : TOKENS.boardCream;
  const ink = c.tone === "paid" ? TOKENS.boardCream : c.tone === "reserved" ? TOKENS.boardInk2 : TOKENS.boardInk;
  return (
    <div style={{ display: "flex", width: size, height: size, padding: 1 }}>
      <div style={{
        display: "flex", flex: 1, position: "relative", alignItems: "center", justifyContent: "center", background: face, color: ink,
        fontFamily: "Barlow Condensed", fontWeight: 600, fontSize: Math.round(size * 0.42),
        // Reserved: a 2 px steel inner border, so it never differs from open by number colour only.
        ...(c.tone === "reserved" ? { border: `2px solid ${TOKENS.boardSteel}` } : {}),
      }}>
        {c.tone === "won" && c.place ? <Bull n={c.number} place={c.place} cell={size} /> : String(c.number)}
        {/* Claimed: a 7 px kit-light band along the bottom with a 1 px ink keyline on its top edge (the hatch's stand-in). */}
        {c.tone === "taken" && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 8, background: light, borderTop: `1px solid ${TOKENS.boardInk}` }} />}
      </div>
    </div>
  );
}

/** The lead photo, square and cropped, never tinted (photos spec §8.0). `src` is a data URI: the renderer fetches nothing. */
function Plate({ src, side }: { src: string; side: number }) {
  return (
    <div style={{ display: "flex", alignSelf: "flex-start", padding: PLATE_MAT, background: TOKENS.boardWall2, border: `${PLATE_KEYLINE}px solid ${TOKENS.boardSteel}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the image renderer draws a plain img; next/image cannot run here */}
      <img src={src} width={side} height={side} alt="" style={{ width: side, height: side, objectFit: "cover" }} />
    </div>
  );
}

/**
 * The 1200 × 630 preview (§6): the board in the host's kit on the wall under the lamp, then the title, caption, host and
 * wordmark. With the lead photo (`photo`, a data URI, and `m.photo` both set) a plate heads the text column, smaller on
 * a ran break so the board and its bulls stay in front (photos spec §8.4); it never enters the board column.
 */
export function ogImage(m: OgModel, photo: string | null = null) {
  const dark = FLIGHT_COLOURS[m.kit.dark].face;
  const light = FLIGHT_COLOURS[m.kit.light].face;
  const cell = Math.floor(GRID_PX / m.columns);
  // A long title steps down a size and stops at three lines.
  const titlePx = m.title.length <= 40 ? 60 : 44;
  const plate = m.photo && photo ? photo : null;
  // A ran break is one whose board shows its bulls; the model carries no status.
  const plateSide = m.cells.some((c) => c.tone === "won") ? OG_PLATE_RAN_PX : OG_PLATE_PX;
  // While a plate shows, the title stops at two lines and the column closes up.
  const titleLines = plate ? 2 : 3;
  return (
    // The lamp lights the whole preview from over the board (26 % across, the board column's centre), so the glow
    // reaches past the frame and under the text; the alphas stay the spec's (0.06 to 0.20).
    <div style={{ width: "100%", height: "100%", display: "flex", background: TOKENS.boardWall, backgroundImage: `radial-gradient(ellipse at 26% 50%, ${LAMP[m.heat]}, transparent 70%)` }}>
      <div style={{ display: "flex", width: GRID_PX + 2 * PAD, height: "100%", alignItems: "center", justifyContent: "center" }}>
        {/* Wires: the steel background through a 1 px margin around each cell (the renderer sizes boxes border-box,
            so the width adds the 1 px padding on each side or the last column wraps). The frame is the surround ×2. */}
        <div style={{
          display: "flex", flexWrap: "wrap", width: cell * m.columns + 2, padding: 1, background: TOKENS.boardSteel,
          boxShadow: `0 0 0 2px ${TOKENS.boardSteel}, 0 0 0 14px ${TOKENS.boardRing}, 0 0 0 22px ${dark}, 0 0 0 24px ${light}`,
        }}>
          {m.cells.map((c) => <Cell key={c.number} c={c} size={cell} dark={dark} light={light} />)}
          {Array.from({ length: fillerCount(m.cells.length, m.columns) }, (_, i) => (
            <div key={`slot-${i}`} style={{ display: "flex", width: cell, height: cell, padding: 1 }}>
              <div style={{ display: "flex", flex: 1, background: TOKENS.boardWall2 }} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: plate ? 20 : 28, paddingRight: PAD }}>
        {plate && <Plate src={plate} side={plateSide} />}
        <div style={{ display: "flex", fontFamily: "Big Shoulders Display", fontWeight: 800, fontSize: titlePx, lineHeight: 1.1, color: TOKENS.boardCream, overflow: "hidden", maxHeight: Math.ceil(titlePx * 1.1 * titleLines) }}>{m.title}</div>
        <div style={{ display: "flex", fontFamily: "Big Shoulders Display", fontWeight: 800, fontSize: 40, color: TOKENS.boardText2 }}>{m.caption}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: "Barlow", fontWeight: 500, fontSize: 28, color: TOKENS.boardText3 }}>
          {m.hostedBy}
          <div style={{ display: "flex", width: 40, height: 20 }}>
            <div style={{ display: "flex", width: 20, height: 20, background: dark }} />
            <div style={{ display: "flex", width: 20, height: 20, background: light }} />
          </div>
        </div>
        <div style={{ display: "flex", fontFamily: "Barlow Condensed", fontWeight: 600, fontSize: 32, color: TOKENS.boardCream }}>Breaks</div>
      </div>
    </div>
  );
}
