/** Accept only same-site absolute paths ("/x"); anything else (URLs, "//host", "/\host", control chars) becomes "/". */
export function safeNext(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  // URL parsing strips tab/CR/LF, so "/\t/evil.com" would become "//evil.com".
  if (/[\x00-\x1f\x7f]/.test(raw)) return "/";
  try {
    if (new URL(raw, "http://x").origin !== "http://x") return "/";
  } catch {
    return "/";
  }
  return raw;
}

/** Where sign-in and onboarding go next: the safe `next` when one was given, else the feed (a member's home). */
export function afterSignIn(raw: unknown): string {
  const next = safeNext(raw);
  return next === "/" ? "/breaks" : next;
}

/** After a code or link is verified: an unfinished account sets up first, keeping `next` (and any ?pick=). */
export function signedInTarget(onboarded: boolean, raw: unknown): string {
  const next = afterSignIn(raw);
  return onboarded ? next : `/onboarding?next=${encodeURIComponent(next)}`;
}
