import type { PhotoView } from "@/domain/photos/queries";
import type { StripPhoto } from "@/components/photos/strip-state";
import { photoSrc } from "./urls";
import type { PhotoStorage } from "@/storage/photo-storage";

/** A break's live photos as the strip shows them: the 160 px variant (signed for a draft's photos), in live order. */
export function toStripPhotos(storage: PhotoStorage, live: readonly PhotoView[]): Promise<StripPhoto[]> {
  return Promise.all(live.map(async (v): Promise<StripPhoto> => ({
    photoId: v.id, src: await photoSrc(storage, v, 160), slot: v.slot, alt: v.alt,
  })));
}
