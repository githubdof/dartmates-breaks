import type { PhotoSrc } from "@/photos/urls";

/** A photo as the viewer shows it; `caption` is the place and item it is tagged to, or null when untagged. */
export type ViewerPhoto = PhotoSrc & { caption: string | null };

export const positionText = (index: number, count: number): string => `Photo ${index + 1} of ${count}`;
export const viewerCaption = (tag: string | null, index: number, count: number): string =>
  `${tag ? `${tag}. ` : ""}${positionText(index, count)}.`;
export const neighbours = (index: number, count: number): { prev: number | null; next: number | null } => ({
  prev: index > 0 ? index - 1 : null,
  next: index < count - 1 ? index + 1 : null,
});
/** The slide a scroll came to rest on: the nearest whole slide, inside the strip; null before layout or with none. */
export const landedSlide = (scrollLeft: number, slideWidth: number, count: number): number | null =>
  slideWidth > 0 && count > 0 ? Math.max(0, Math.min(count - 1, Math.round(scrollLeft / slideWidth))) : null;
export const countText = (n: number): string => `${n} ${n === 1 ? "photo" : "photos"}`;
export const plateButtonName = (n: number, updated: boolean): string => `${updated ? "Updated, " : ""}${countText(n)} of the prizes`;
