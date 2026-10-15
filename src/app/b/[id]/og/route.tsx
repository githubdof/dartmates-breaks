import { ImageResponse } from "next/og";
import { db } from "@/db/client";
import { getBreakPage } from "@/domain/breaks/queries";
import { ogModel, type OgTone } from "@/domain/breaks/og";
import { isUuid } from "@/lib/is-uuid";

// Board tokens (src/app/tokens.css) as literals: the image renderer reads no CSS variables.
const PAPER = "#F6F5F1";
const CARD = "#FFFFFF";
const INK = "#000000";
const INK_2 = "#5C5A55";
const WIRE_STRONG = "#86827A";
const WIRE = "#C9C6BE";
// Taken (and sent) is the `wire` tone with the number on a white chip (design §4), so it reads apart from the white
// open cells at a glance; the near-white wire-2 repeated the 1.27:1 open-versus-taken problem (design §10).
const TONE: Record<OgTone, { bg: string; fg: string; chip: boolean }> = {
  open: { bg: CARD, fg: INK, chip: false },
  taken: { bg: WIRE, fg: INK_2, chip: true },
  paid: { bg: INK, fg: CARD, chip: false },
  reserved: { bg: CARD, fg: INK_2, chip: false },
};
const GRID_PX = 500;

/**
 * GET /b/{id}/og: the link-preview PNG (design §6). It never reads the session, so a crawler, a stranger and the
 * break's own host all get the same anonymous image; drafts 404 for everyone.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  let page: Awaited<ReturnType<typeof getBreakPage>>;
  try {
    page = await db.transaction((tx) => getBreakPage(tx, id));
  } catch {
    // A crawler gets no image rather than a bare 500.
    return new Response(null, { status: 404 });
  }
  const m = page ? ogModel(page, new Date()) : null;
  if (!m) return new Response("Not found", { status: 404 });
  const cell = Math.floor(GRID_PX / m.columns);
  // A long title steps down a size and stops at three lines.
  const titlePx = m.title.length <= 40 ? 60 : 44;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: 56, padding: 64, background: PAPER, color: INK }}>
        {/* Wires: the grid's background shows through a 1 px margin around each cell. The renderer sizes boxes
            border-box, so the width adds the 1 px padding on each side or the last column wraps. */}
        <div style={{ display: "flex", flexWrap: "wrap", width: cell * m.columns + 2, background: WIRE_STRONG, padding: 1 }}>
          {m.cells.map((c) => (
            <div key={c.number} style={{ display: "flex", width: cell, height: cell, padding: 1 }}>
              <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", background: TONE[c.tone].bg, color: TONE[c.tone].fg, fontSize: Math.round(cell * 0.42) }}>
                {TONE[c.tone].chip ? (
                  <div style={{ display: "flex", background: CARD, borderRadius: 4, padding: `0 ${Math.round(cell * 0.08)}px` }}>{String(c.number)}</div>
                ) : String(c.number)}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 28 }}>
          <div style={{ display: "flex", fontSize: titlePx, lineHeight: 1.1, overflow: "hidden", maxHeight: Math.ceil(titlePx * 1.1 * 3) }}>{m.title}</div>
          <div style={{ display: "flex", fontSize: 40, color: INK_2 }}>{m.caption}</div>
          <div style={{ display: "flex", fontSize: 32 }}>Breaks</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
  );
}
