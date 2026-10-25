import { env } from "@/lib/env";
import { BUCKETS, PREFIX_PATTERN, publicVariantUrl } from "@/storage/buckets";

/** How long the preview waits for the lead photo before drawing without it (photos spec §8.4). */
export const OG_PHOTO_TIMEOUT_MS = 2000;
/** The most the preview reads of the lead photo's 640 variant; past it, no photo (photos spec §8.4). */
export const OG_PHOTO_MAX_BYTES = 512 * 1024;
/** The format the renderer gets the plate in (rulings 15 and 31; settled by image.test.ts's probe). */
// PNG: the probe found the renderer (Satori in next/og) draws a PNG data URI but no WebP one, so the 640 WebP is transcoded.
export const OG_PHOTO_FORMAT: "webp" | "png" = "png";

/** RIFF....WEBP: the first 12 bytes of every WebP file. */
const isWebp = (b: Buffer) => b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";

/**
 * The fetched WebP as a PNG data URI (ruling 15), for a renderer that cannot draw WebP. sharp is loaded only on this
 * path. Null on any error (a corrupt file, more than 12 megapixels, a decode past 8 seconds); never throws.
 */
export async function toPngDataUri(webp: Buffer): Promise<string | null> {
  try {
    const { default: sharp } = await import("sharp");
    const png = await sharp(webp, { limitInputPixels: 12_000_000, failOn: "error" }).timeout({ seconds: 8 }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Reads a body up to `cap` bytes; null past it (the rest is cancelled, not read). */
async function readCapped(body: ReadableStream<Uint8Array>, cap: number): Promise<Buffer | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * The break's lead photo as a data URI for the link preview (photos spec §8.4), so the renderer never fetches. The
 * one URL fetched is the prefix's 640 variant in the public `photos` bucket on the project's own Storage host, and only
 * for a photo prefix of this break; no redirects, a timeout and a byte cap. Null on anything else, so the preview draws
 * without the photo; never throws.
 */
export async function leadPhotoDataUri(
  breakId: string,
  prefix: string,
  opts: { fetcher?: typeof fetch; timeoutMs?: number; format?: "webp" | "png" } = {},
): Promise<string | null> {
  const { fetcher = fetch, timeoutMs = OG_PHOTO_TIMEOUT_MS, format = OG_PHOTO_FORMAT } = opts;
  try {
    if (!PREFIX_PATTERN.test(prefix) || !prefix.startsWith(`${breakId}/`)) return null;
    const url = publicVariantUrl(prefix, 640);
    if (!url.startsWith(`${env().SUPABASE_URL}/storage/v1/object/public/${BUCKETS.public}/`)) return null;
    const res = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "error", cache: "no-store" });
    if (!res.ok || !res.body) return null;
    const length = Number(res.headers.get("content-length") ?? NaN);
    if (length > OG_PHOTO_MAX_BYTES) {
      await res.body.cancel().catch(() => undefined);
      return null;
    }
    const bytes = await readCapped(res.body, OG_PHOTO_MAX_BYTES);
    if (!bytes || !isWebp(bytes)) return null;
    return format === "png" ? await toPngDataUri(bytes) : `data:image/webp;base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}
