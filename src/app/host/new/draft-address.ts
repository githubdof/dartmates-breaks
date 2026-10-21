export const editAddress = (breakId: string): string => `/host/${breakId}/edit`;

/**
 * Moves the address bar to the draft's edit page without a navigation, so typing and uploads in flight survive.
 * It passes null on purpose: Next's patched replaceState copies its own history keys from the current entry into
 * the new one and syncs usePathname, so Back, reload and later server actions see the edit address with the router
 * tree intact (passing the current state through would carry `__NA`, which Next treats as its own call).
 */
export function moveToEditAddress(breakId: string): void {
  const to = editAddress(breakId);
  if (window.location.pathname === to) return;
  window.history.replaceState(null, "", to);
}
