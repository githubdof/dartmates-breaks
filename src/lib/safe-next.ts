/** Accept only same-site absolute paths ("/x"); anything else (URLs, "//host", "/\host") becomes "/". */
export function safeNext(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  return raw;
}
