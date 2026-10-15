import { ImageResponse } from "next/og";
import { db } from "@/db/client";
import { getBreakPage } from "@/domain/breaks/queries";
import { getDrawResult } from "@/domain/draws/queries";
import { placesOf } from "@/domain/draws/places";
import { ogModel, type OgDraw, type OgPage } from "@/domain/breaks/og";
import { isUuid } from "@/lib/is-uuid";
import { OG_FONTS } from "./fonts";
import { OG_SIZE, ogImage } from "./image";

/**
 * GET /b/{id}/og: the link-preview PNG (Mosaic §6). It never reads the session, so a crawler, a stranger and the
 * break's own host all get the same kit-view image; drafts 404 for everyone. For a ran break it reads the draw's
 * places and time, and nothing else of it reaches ogModel.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  let found: { page: OgPage; draw: OgDraw | null } | null;
  try {
    found = await db.transaction(async (tx) => {
      const page = await getBreakPage(tx, id);
      if (!page) return null;
      if (page.break.status !== "drawn") return { page, draw: null };
      const res = await getDrawResult(tx, id);
      if (!res) return { page, draw: null };
      // The won places (placesOf, Task 6) ride on Task 5's OgPage.places; the draw adds only when it ran.
      return { page: { ...page, places: placesOf(res.ranking, res.awards.map((a) => a.rank)) }, draw: { ranAt: res.draw.createdAt } };
    });
  } catch {
    // A crawler gets no image rather than a bare 500.
    return new Response(null, { status: 404 });
  }
  const m = found ? ogModel(found.page, new Date(), found.draw) : null;
  if (!m) return new Response("Not found", { status: 404 });
  return new ImageResponse(ogImage(m), { ...OG_SIZE, fonts: OG_FONTS, headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } });
}
