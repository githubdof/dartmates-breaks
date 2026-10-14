import { RESERVED_HANDLES } from "./commands";

/** Prefill for onboarding: the email's local part shaped to [a-z0-9_]{3,20}, never a reserved name. */
export function suggestHandle(email: string): string {
  const local = (email.split("@")[0] ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  let h = local.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 20);
  if (!h) h = "user";
  if (h.length < 3) h = h.padEnd(3, "_");
  if (RESERVED_HANDLES.has(h)) h = `${h}_1`.slice(0, 20);
  return h;
}

/** Onboarding reached from a claim keeps the lines: its `next` carries ?pick=. */
export function fromClaim(next: string): boolean {
  try {
    return new URL(next, "http://x").searchParams.has("pick");
  } catch {
    return false;
  }
}
