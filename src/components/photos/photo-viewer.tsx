"use client";
import { useEffect, useRef } from "react";
import { neighbours, positionText, viewerCaption, type ViewerPhoto } from "./viewer-model";

type Props = { photos: ViewerPhoto[]; index: number; onIndex(i: number): void; onClose(): void; opener: HTMLElement | null };

const arrow = "inline-flex size-11 items-center justify-center rounded-full bg-card text-ink shadow-sheet";

/**
 * Full-screen photo viewer: a native modal <dialog> holding a scroll-snap strip. Loaded only by dynamic import.
 * Escape and Close both ask the parent through `onClose`, which unmounts this; the effect cleanup then closes the
 * dialog, releases the scroll lock and returns focus to the opener.
 */
export function PhotoViewer({ photos, index, onIndex, onClose, opener }: Props) {
  // The observer is made once per strip; a fresh one reports every slide at once, which would undo a button press mid-scroll.
  const report = useRef(onIndex);
  useEffect(() => { report.current = onIndex; });
  const dialog = useRef<HTMLDialogElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const current = useRef(index);
  const count = photos.length;
  const nb = neighbours(index, count);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (!d.open) d.showModal();
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
      if (d.open) d.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [opener]);

  // Scroll the strip to `index` (instantly on open) whenever the index changed by anything but a swipe.
  const flight = useRef<number | null>(null);
  const flightTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scrollTo = (i: number, first: boolean) => {
    const el = strip.current;
    // "auto" follows the CSS: smooth only where motion is allowed.
    if (!el) return;
    if (!first) {
      // The observer must not report the slides the scroll passes on its way; see the observer below.
      flight.current = i;
      clearTimeout(flightTimer.current);
      flightTimer.current = setTimeout(() => { flight.current = null; }, 1200); // scrollend is not everywhere
    }
    el.scrollTo({ left: i * el.clientWidth, behavior: first ? "instant" : "auto" });
  };
  useEffect(() => {
    if (current.current !== index) scrollTo(index, false);
    current.current = index;
  }, [index, count]);
  useEffect(() => { scrollTo(index, true); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- first open only

  // A swipe changes the visible slide; report it.
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.intersectionRatio >= 0.6) { // a crossing downwards also reports isIntersecting
          const i = Number((e.target as HTMLElement).dataset.slide);
          // While a button or key scroll is in flight only its target counts; reaching it ends the flight.
          if (flight.current !== null && i !== flight.current) continue;
          if (i === flight.current) flight.current = null;
          if (i !== current.current) { current.current = i; report.current(i); }
        }
      }
    }, { root: el, threshold: 0.6 });
    el.querySelectorAll("[data-slide]").forEach((s) => io.observe(s));
    const landed = () => { flight.current = null; };
    el.addEventListener("scrollend", landed);
    return () => { io.disconnect(); el.removeEventListener("scrollend", landed); clearTimeout(flightTimer.current); };
  }, [count]);

  // When the focused arrow disappears at an end, focus the one that remains (or Close).
  const go = (to: number | null, from: "prev" | "next") => {
    if (to === null) return;
    const after = neighbours(to, count);
    const gone = from === "prev" ? after.prev === null : after.next === null;
    onIndex(to);
    if (gone) {
      const other = from === "prev" ? "viewer-next" : "viewer-prev";
      requestAnimationFrame(() => (dialog.current?.querySelector<HTMLElement>(`[data-testid=${other}]`) ?? closeBtn.current)?.focus());
    }
  };

  return (
    <dialog
      ref={dialog} data-testid="photo-viewer" data-photo-viewer-root aria-label="Photos"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClose={() => { if (!dialog.current?.open) onClose(); }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") { e.preventDefault(); go(nb.prev, "prev"); }
        else if (e.key === "ArrowRight") { e.preventDefault(); go(nb.next, "next"); }
      }}
      className="m-0 h-dvh max-h-dvh w-screen max-w-none overflow-hidden bg-board-wall-2 p-0 text-[var(--board-text)] open:flex open:flex-col"
    >
      <div className="flex min-h-14 shrink-0 items-center justify-between gap-4 px-4 pt-[env(safe-area-inset-top)]">
        <p className="min-w-0 text-small">{viewerCaption(photos[index]?.caption ?? null, index, count)}</p>
        <button ref={closeBtn} type="button" onClick={onClose} className="-mr-2 inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-small font-semibold underline underline-offset-4">
          Close
        </button>
      </div>
      <div className="relative min-h-0 flex-auto">
        <div ref={strip} data-testid="viewer-strip" tabIndex={0} role="group" aria-label="Photo strip" className="focus-visible:outline-2 focus-visible:-outline-offset-2 flex h-full snap-x snap-mandatory overflow-x-auto overscroll-contain motion-safe:scroll-smooth">
          {photos.map((p, i) => (
            <div key={p.src} data-slide={i} className="flex h-full w-full shrink-0 snap-center items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- variants are pre-sized */}
              <img
                src={p.src} srcSet={p.srcSet} sizes="100vw" alt={p.alt}
                loading={Math.abs(i - index) <= 1 ? "eager" : "lazy"} decoding="async"
                style={{ maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto" }}
                className="block object-contain"
              />
            </div>
          ))}
        </div>
        {nb.prev !== null && (
          <button type="button" data-testid="viewer-prev" aria-label="Previous photo" onClick={() => go(nb.prev, "prev")} className={`${arrow} absolute left-2 top-1/2 -translate-y-1/2`}>
            <span aria-hidden>{"‹"}</span>
          </button>
        )}
        {nb.next !== null && (
          <button type="button" data-testid="viewer-next" aria-label="Next photo" onClick={() => go(nb.next, "next")} className={`${arrow} absolute right-2 top-1/2 -translate-y-1/2`}>
            <span aria-hidden>{"›"}</span>
          </button>
        )}
      </div>
      <p role="status" aria-live="polite" data-testid="viewer-announce" className="sr-only">{positionText(index, count)}</p>
    </dialog>
  );
}
