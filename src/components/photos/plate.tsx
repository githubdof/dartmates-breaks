import type { PhotoSrc } from "@/photos/urls";

export type PlateSize = 40 | 48 | 64 | 96;

/**
 * A photo on the wall or on paper (photos spec §8.0). `size` is the image box. On the board it sits in a 3 px
 * `--board-wall-2` mat with a 1 px steel keyline (size + 8 outside); on paper only a keyline (size + 2). The image
 * crops to its square, carries the mat colour as its own background and is never rotated, filtered or tinted.
 */
export function Plate({ photo, size, surface, decorative }: { photo: PhotoSrc; size: PlateSize; surface: "board" | "paper"; decorative?: boolean }) {
  const outer = surface === "board" ? size + 8 : size + 2;
  const frame = surface === "board" ? "box-border border border-board-steel bg-board-wall-2 p-[3px]" : "box-border border border-wire-strong";
  return (
    <span data-testid="plate" data-size={size} data-surface={surface} className={`block shrink-0 ${frame}`} style={{ width: `${outer}px`, height: `${outer}px` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the variants are already sized; next/image would re-encode them */}
      <img
        src={photo.src} srcSet={photo.srcSet} sizes={`${size}px`} width={size} height={size}
        alt={decorative ? "" : photo.alt} loading="lazy" decoding="async"
        // Explicit CSS size: Tailwind's preflight (`height: auto; max-width: 100%`) would beat the attributes and stop the crop.
        style={{ width: `${size}px`, height: `${size}px`, maxWidth: "none" }}
        className="block bg-board-wall-2 object-cover"
      />
    </span>
  );
}
