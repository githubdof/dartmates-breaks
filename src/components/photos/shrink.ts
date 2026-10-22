import { UNREADABLE_NOTICE } from "./strip-state";

export const MAX_EDGE = 2048;
export const JPEG_QUALITY = 0.85;

export class CannotRead extends Error {
  constructor() { super(UNREADABLE_NOTICE); this.name = "CannotRead"; }
}

/** The size that fits the long edge within `maxEdge`, never upscaling. */
export function fitWithin(w: number, h: number, maxEdge = MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Decodes with the orientation applied, shrinks to 2048 px and re-encodes as JPEG. Throws CannotRead. */
export async function shrinkForUpload(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new CannotRead();
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new CannotRead();
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) throw new CannotRead();
    return blob;
  } finally {
    bitmap.close();
  }
}
