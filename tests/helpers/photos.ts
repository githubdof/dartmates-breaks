import { eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks } from "@/db/schema";
import { issueUploadTicket, recordProcessedPhoto } from "@/domain/photos/commands";
import type { PhotoLocation } from "@/domain/photos/types";
import type { Caller } from "@/domain/types";
import { VARIANT_WIDTHS, variantPath } from "@/storage/buckets";
import type { PhotoStorage } from "@/storage/photo-storage";
import { newPhotoPrefix } from "@/photos/variants";

/**
 * A recorded photo with its three files, for tests that only need rows and files (no sharp): an upload is issued,
 * three small placeholder bodies go to the variant paths in the bucket the break's status implies, and
 * recordProcessedPhoto records it there (1600 × 1200, alt "Darts" unless given).
 */
export async function seedPhoto(tx: Tx, s: PhotoStorage, caller: Caller, breakId: string, o: { slot?: string | null; alt?: string } = {}): Promise<{
  photoId: string; prefix: string; location: PhotoLocation;
}> {
  const now = new Date();
  const [{ status }] = await tx.select({ status: breaks.status }).from(breaks).where(eq(breaks.id, breakId));
  const location = status === "draft" ? "photos-draft" : "photos";
  const { ticketId } = await issueUploadTicket(tx, caller, { breakId, now });
  const prefix = newPhotoPrefix(breakId);
  for (const w of VARIANT_WIDTHS) await s.put(location, variantPath(prefix, w), Buffer.from(`variant ${w}`), "image/webp");
  const r = await recordProcessedPhoto(tx, caller, {
    ticketId, prefix, location, width: 1600, height: 1200, slot: o.slot ?? null, alt: o.alt ?? "Darts", now,
  });
  return { photoId: r.photoId, prefix, location: r.location };
}
