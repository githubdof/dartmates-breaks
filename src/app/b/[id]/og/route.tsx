import { ImageResponse } from "next/og";
import { db } from "@/db/client";
import { getBreakPage } from "@/domain/breaks/queries";
import { drawPlacesForPreview } from "@/domain/draws/queries";
import { placesOf } from "@/domain/draws/places";
import { ogModel, type OgDraw, type OgModel, type OgPage } from "@/domain/breaks/og";
import { leadPhotos } from "@/domain/photos/queries";
import { isUuid } from "@/lib/is-uuid";
import { ogFonts } from "./fonts";
import { OG_SIZE, ogImage } from "./image";
import { leadPhotoDataUri } from "./photo";

// sharp (the lead photo's PNG transcode) needs Node.
export const runtime = "nodejs";

const notFound = () => new Response("Not found", { status: 404 });

/**
 * GET /b/{id}/og: the link-preview PNG (Mosaic §6). It never reads the session, so a crawler, a stranger and the
 * break's own host all get the same kit-view image; drafts 404 for everyone. For a ran break it reads the draw's
 * order, prize ranks and time (drawPlacesForPreview: no handle, no item name), and only the places reach ogModel.
 * The lead photo (photos spec §8.4): its only network call is the lead's 640 variant on the project's own Storage host,
 * and the renderer gets it as a data URI, never a URL. A failed lead read or fetch draws the preview without the photo.
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
  // In a transaction of its own: a failed statement would abort the page's, and the catch above would answer 404.
  // A failed read is no photo (ruling 31).
  const lead = found ? await db.transaction((tx) => leadPhotos(tx, [id])).then((r) => r.get(id) ?? null, () => null) : null;
  const m = found ? ogModel({ ...found.page, lead }, new Date(), found.draw) : null;
  if (!m) return notFound();
  // Outside any transaction; null on any failure (leadPhotoDataUri never throws).
  const photo = m.photo ? await leadPhotoDataUri(id, m.photo.prefix) : null;
  // Drawn here, not while streaming: ImageResponse renders inside its body stream, after a 200 is already sent, so a
  // missing font or a renderer error would reach the crawler as a broken image. Either answers 404, as above.
  // A plate the renderer cannot draw is no photo: one more try without it, so the photo never fails the preview.
  return (await render(m, photo)) ?? (photo ? await render(m, null) : null) ?? notFound();
}

/** The PNG, fully rendered (arrayBuffer) so a renderer error is caught here, not mid-stream; null on any error. */
async function render(m: OgModel, photo: string | null): Promise<Response | null> {
  try {
    const image = new ImageResponse(ogImage(m, photo), { ...OG_SIZE, fonts: ogFonts(), headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } });
    const png = await image.arrayBuffer();
    return new Response(png, { status: 200, headers: image.headers });
  } catch {
    return null;
  }
}
