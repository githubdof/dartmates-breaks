const firedThisPageView = new Set<string>();

/** Tells the server a holder saw the latest photo change: once per break per page view, never when nothing is unseen. */
export async function markSeenOnce(
  breakId: string, unseen: boolean, call: (breakId: string) => Promise<unknown>, fired: Set<string> = firedThisPageView,
): Promise<void> {
  if (!unseen || fired.has(breakId)) return;
  fired.add(breakId);
  try { await call(breakId); } catch { /* the result is ignored */ }
}
