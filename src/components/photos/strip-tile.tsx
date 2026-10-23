import type { PointerEventHandler } from "react";
import type { StripTile as Tile } from "./strip-state";

type Props = {
  tile: Tile;
  /** 0-based place in the strip; the tile's name for assistive technology is "photo {index + 1}". */
  index: number;
  lead: boolean;
  dragging: boolean;
  optionsOpen: boolean;
  panelId: string;
  onOptions(): void;
  onRetry(): void;
  onCancel(): void;
  onGripDown: PointerEventHandler<HTMLDivElement>;
  onGripUp: PointerEventHandler<HTMLDivElement>;
  onGripCancel: PointerEventHandler<HTMLDivElement>;
};

const RING = 2 * Math.PI * 16;
const overlayButton = "min-h-11 rounded-input bg-card px-3 text-small font-semibold text-ink";

/** One square of the strip: the picture (the local preview until the processed one arrives) and its state. */
export function StripTile({ tile, index, lead, dragging, optionsOpen, panelId, onOptions, onRetry, onCancel, onGripDown, onGripUp, onGripCancel }: Props) {
  const n = index + 1;
  const ready = tile.status === "ready";
  const img = ready ? tile.src : null;
  const shown = img?.src ?? tile.preview;
  return (
    <li
      data-testid="photo-tile" data-status={tile.status} data-photo-id={tile.photoId ?? ""} data-tile-key={tile.key}
      className={`relative aspect-square overflow-hidden rounded-input border border-wire-strong bg-wire-2 ${dragging ? "opacity-60" : ""}`}
    >
      {shown && (
        // eslint-disable-next-line @next/next/no-img-element -- a local preview or a Storage variant: nothing for the optimiser to do
        <img src={shown} srcSet={img?.srcSet} sizes="114px" alt={ready ? tile.alt : ""} className="size-full object-cover" draggable={false} />
      )}
      {lead && ready && <span className="absolute bottom-1 left-1 rounded-input bg-ink px-1.5 text-small font-semibold text-card">Lead</span>}
      {ready && (
        <>
          <div
            data-testid="photo-grip" aria-hidden="true" onPointerDown={onGripDown} onPointerUp={onGripUp} onPointerCancel={onGripCancel}
            className="absolute left-0 top-0 grid size-11 cursor-grab place-items-center bg-ink/55 text-card"
            style={{ touchAction: "none" }}
          >
            <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor"><circle cx="5" cy="3" r="1.4" /><circle cx="11" cy="3" r="1.4" /><circle cx="5" cy="8" r="1.4" /><circle cx="11" cy="8" r="1.4" /><circle cx="5" cy="13" r="1.4" /><circle cx="11" cy="13" r="1.4" /></svg>
          </div>
          <button
            type="button" data-testid={`photo-options-${n}`} aria-label={`Options for photo ${n}`} aria-expanded={optionsOpen} aria-controls={panelId} onClick={onOptions}
            className="absolute right-0 top-0 grid size-11 place-items-center bg-ink/55 text-card"
          >
            <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="13" cy="8" r="1.5" /></svg>
          </button>
        </>
      )}
      {(tile.status === "queued" || tile.status === "uploading") && (
        <div className="absolute inset-0 grid place-items-center bg-ink/40">
          <svg
            viewBox="0 0 36 36" width="44" height="44" role="progressbar" aria-label={`Uploading photo ${n}`}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(tile.progress * 100)}
          >
            <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="3" className="text-card" />
            <circle
              cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-card"
              strokeDasharray={RING} strokeDashoffset={RING * (1 - tile.progress)} transform="rotate(-90 18 18)"
            />
          </svg>
          <button type="button" onClick={onCancel} className="absolute bottom-0 min-h-11 px-3 text-small font-semibold text-card underline underline-offset-4">Cancel</button>
        </div>
      )}
      {tile.status === "finishing" && (
        <div className="absolute inset-0 grid place-items-center bg-ink/55 text-small font-semibold text-card" role="status">Finishing…</div>
      )}
      {tile.status === "failed" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 overflow-auto bg-ink/80 p-1 text-center text-small text-card">
          <p>{tile.error}</p>
          <div className="flex flex-wrap justify-center gap-1">
            {tile.retryable && <button type="button" onClick={onRetry} className={overlayButton}>Retry</button>}
            <button type="button" onClick={onCancel} className={overlayButton}>Cancel</button>
          </div>
        </div>
      )}
    </li>
  );
}
