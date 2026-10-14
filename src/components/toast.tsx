"use client";

export type ToastOffset = "bar" | "sheet-action" | "none";

/** Where the snackbar sits: above the claim bar, above a sheet's sticky bottom action, or at the bottom edge. */
const BOTTOM: Record<ToastOffset, string> = {
  bar: "calc(var(--bar-total, calc(var(--bar-h) + max(12px, env(safe-area-inset-bottom)))) + 8px)",
  "sheet-action": "calc(68px + max(12px, env(safe-area-inset-bottom)) + 8px)",
  none: "max(12px, env(safe-area-inset-bottom))",
};

/** Polite snackbar. Render it inside the sheet that owns it (outside elements are inert under a modal). */
export function Toast({ message, action, onAction, offset = "bar" }: { message: string | null; action?: string; onAction?: () => void; offset?: ToastOffset }) {
  return (
    <div role="status" aria-live="polite" style={{ bottom: BOTTOM[offset] }} className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4">
      {message && (
        <div className="pointer-events-auto flex min-h-11 max-w-[568px] items-center gap-4 rounded-card bg-ink px-4 py-2 text-small text-card">
          <span>{message}</span>
          {action && onAction && <button type="button" onClick={onAction} className="min-h-11 font-semibold underline underline-offset-4">{action}</button>}
        </div>
      )}
    </div>
  );
}
