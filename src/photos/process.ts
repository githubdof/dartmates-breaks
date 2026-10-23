import sharp from "sharp";
import { VARIANT_WIDTHS, type VariantWidth } from "@/storage/buckets";

/** The largest incoming file the finalise route downloads: 5 MiB, the `incoming` bucket's limit (photos spec §5.5). */
export const MAX_INCOMING_BYTES = 5 * 1024 * 1024;

/** Every refusal of an upload's bytes: wrong magic bytes, a format libvips reads differently, too many pixels, corrupt
 *  data or a timeout (photos spec §5.3 step 2). Never a raw sharp error. */
export class UnsupportedImage extends Error {}

/** A re-encoded photo: `width`/`height` are the 1600 variant's actual pixel size (photos spec §4), `variants` follow
 *  `VARIANT_WIDTHS` order and each `width` is the label, the body may be smaller (no upscaling, plan ruling 4). */
export type Processed = { width: number; height: number; variants: { width: VariantWidth; body: Buffer }[] };

// One image at a time per function instance, and no libvips operation cache (photos spec §5.3).
sharp.concurrency(1);
sharp.cache(false);

/** Every pipeline carries its own bound; a timeout is refused as `UnsupportedImage` (plan ruling 29). */
const PIPELINE_TIMEOUT = { seconds: 8 };
/** 12 megapixels: a 4000 × 3000 photo passes, one more column does not (photos spec §5.3 step 2). */
const MAX_INPUT_PIXELS = 12e6;
/** WebP quality: this plan's choice, the spec pins none. */
const WEBP_QUALITY = 80;

type Format = "jpeg" | "png" | "webp";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The format the magic bytes claim, or null. Shorter than 12 bytes is null: no real photo is that small. */
function sniff(buf: Buffer): Format | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 8).equals(PNG_SIGNATURE)) return "png";
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "webp";
  return null;
}

/** Re-encodes an upload into three upright, metadata-free WebP variants (photos spec §5.3 steps 2–3, §10). Magic bytes
 *  are checked before sharp sees anything, and the decoded format must match them, so libvips never picks a format
 *  on its own (no SVG, GIF, TIFF, HEIF/AVIF, PDF). A polyglot JPEG is accepted: its variants hold pixels only (plan
 *  ruling 32). Throws `UnsupportedImage` for every refusal. */
export async function processPhoto(input: Buffer): Promise<Processed> {
  const claimed = sniff(input);
  if (!claimed) throw new UnsupportedImage("unsupported image");
  try {
    const img = sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
      // "error", not "warning", on purpose (plan ruling 29): it refuses corrupt data such as a truncated JPEG, but lets
      // through the harmless warnings ordinary phone JPEGs often carry. Do not tighten it to "warning".
      failOn: "error",
      pages: 1,
      animated: false,
    }).timeout(PIPELINE_TIMEOUT);
    const { format } = await img.metadata();
    if (format !== claimed) throw new UnsupportedImage("unsupported image");

    // EXIF orientation applied to the pixels; nothing below keeps any metadata, so the tag is dropped with the rest.
    const base = img.rotate();
    const variants: Processed["variants"] = [];
    let largest = { width: 0, height: 0 };
    for (const width of VARIANT_WIDTHS) {
      const { data, info } = await base
        .clone()
        .timeout(PIPELINE_TIMEOUT)
        .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer({ resolveWithObject: true });
      variants.push({ width, body: data });
      largest = { width: info.width, height: info.height };
    }
    return { ...largest, variants };
  } catch (cause) {
    if (cause instanceof UnsupportedImage) throw cause;
    throw new UnsupportedImage("unsupported image", { cause });
  }
}
