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
