/**
 * A server action threw (dropped connection, 5xx) instead of answering. The action may well have committed, so the
 * caller refreshes the props and says so in this note rather than letting the page fall to the error boundary.
 */
export const NETWORK_NOTE = "Couldn't reach Breaks. Check your connection; the board is refreshed.";

/** Fully offline: no refresh happened, so the note says only what to do. */
export const OFFLINE_NOTE = "You're offline. Check your connection, then try again.";

/** Offline, router.refresh() itself fails and Next falls back to a hard navigation: callers skip it and keep the note. */
export function canRefresh(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}
