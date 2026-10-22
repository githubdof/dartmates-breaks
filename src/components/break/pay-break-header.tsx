import type { PhotoSrc } from "@/photos/urls";
import { Plate } from "@/components/photos/plate";

/** The break's lead plate and title at the top of the pay sheet, so the sheet says which break it is for. Nothing without a photo. */
export function PayBreakHeader({ title, photo }: { title: string; photo: PhotoSrc | null }) {
  if (!photo) return null;
  return (
    <div data-testid="pay-break" className="flex items-center gap-3">
      <Plate photo={photo} size={40} surface="paper" decorative />
      <p className="line-clamp-2 min-w-0 font-semibold">{title}</p>
    </div>
  );
}
