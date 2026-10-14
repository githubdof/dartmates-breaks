"use client";
import { useEffect, useId, useRef } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Full-screen (host ledger) instead of a bottom sheet. */
  full?: boolean;
  testId?: string;
  hideTitle?: boolean;
};

/** Native <dialog> with showModal(): focus is trapped, Escape closes, the backdrop closes, focus returns to the opener. */
export function Sheet({ open, onClose, title, children, full = false, testId, hideTitle = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  useEffect(() => () => { document.documentElement.style.overflow = ""; }, []);

  const handleClose = () => {
    document.documentElement.style.overflow = "";
    // Return focus to the opener; if it unmounted meanwhile (the claim button became "You owe"), to the bar.
    const el = opener.current;
    const target = el instanceof HTMLElement && el.isConnected && el !== document.body
      ? el
      : document.querySelector<HTMLElement>("[data-sticky-bar] button, [data-sticky-bar] a");
    target?.focus();
    if (open) onClose();
  };

  // `open:flex` (not `flex`): a display utility on a closed <dialog> would override display: none.
  // The header stays put and the body scrolls inside the sheet, so the sheet never exceeds 85dvh.
  const shape = full
    ? "m-0 h-dvh max-h-dvh w-full max-w-none bg-paper open:flex open:flex-col sm:mx-auto sm:max-w-[960px]"
    : "m-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-card bg-card shadow-sheet open:flex open:flex-col sm:mx-auto sm:mb-auto sm:max-w-[600px] sm:rounded-card";

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-testid={testId}
      onClose={handleClose}
      onClick={(e) => { if (e.target === e.currentTarget) ref.current?.close(); }}
      className={`${shape} overscroll-contain p-0 text-ink`}
    >
      <div className={`flex min-h-14 shrink-0 items-center justify-between gap-4 border-b border-wire px-4 ${full ? "bg-paper" : "bg-card"}`}>
        <h2 id={titleId} className={hideTitle ? "sr-only" : "text-headline font-semibold"}>{title}</h2>
        <button type="button" onClick={() => ref.current?.close()} className="-mr-2 inline-flex min-h-11 items-center px-2 text-small font-semibold underline underline-offset-4">
          Close
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-safe">{children}</div>
    </dialog>
  );
}
