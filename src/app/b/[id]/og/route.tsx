import { ImageResponse } from "next/og";
import { db } from "@/db/client";
import { getBreakPage } from "@/domain/breaks/queries";
import { drawPlacesForPreview } from "@/domain/draws/queries";
import { placesOf } from "@/domain/draws/places";
import { ogModel, type OgDraw, type OgPage } from "@/domain/breaks/og";
import { isUuid } from "@/lib/is-uuid";
import { ogFonts } from "./fonts";
import { OG_SIZE, ogImage } from "./image";

const notFound = () => new Response("Not found", { status: 404 });

/**
 * GET /b/{id}/og: the link-preview PNG (Mosaic §6). It never reads the session, so a crawler, a stranger and the
 * break's own host all get the same kit-view image; drafts 404 for everyone. For a ran break it reads the draw's
 * order, prize ranks and time (drawPlacesForPreview: no handle, no item name), and only the places reach ogModel.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  let found: { page: OgPage; draw: OgDraw | null } | null;
  try {
    found = await db.transaction(async (tx) => {
      const page = await getBreakPage(tx, id);
      if (!page) return null;
      if (page.break.status !== "drawn") return { page, draw: null };
      const ran = await drawPlacesForPreview(tx, id);
      if (!ran) return { page, draw: null };
      // The won places (placesOf, Task 6) ride on Task 5's OgPage.places; the draw adds only when it ran.
      return { page: { ...page, places: placesOf(ran.ranking, ran.ranks) }, draw: { ranAt: ran.ranAt } };
    });
  } catch {
    // A crawler gets no image rather than a bare 500.
    return notFound();
  }
  const m = found ? ogModel(found.page, new Date(), found.draw) : null;
  if (!m) return notFound();
  // Drawn here, not while streaming: ImageResponse renders inside its body stream, after a 200 is already sent, so a
  // missing font or a renderer error would reach the crawler as a broken image. Either answers 404, as above.
  try {
    const image = new ImageResponse(ogImage(m), { ...OG_SIZE, fonts: ogFonts(), headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } });
    const png = await image.arrayBuffer();
    return new Response(png, { status: 200, headers: image.headers });
  } catch {
    return notFound();
  }
}
