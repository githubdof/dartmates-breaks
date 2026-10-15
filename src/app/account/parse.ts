import { z } from "zod";

const schema = z.object({
  displayName: z.string().trim().min(1, "Display name: at least 1 character").max(40, "Display name: at most 40 characters"),
  paymentName: z.string().trim().max(60, "Payment name: at most 60 characters"),
});

export type AccountInput = { displayName: string; paymentName: string };

/** FormData → updateProfile input. A missing field reads as blank. */
export function parseAccount(form: FormData): { ok: true; input: AccountInput } | { ok: false; error: string } {
  const text = (k: string) => { const v = form.get(k); return typeof v === "string" ? v : ""; };
  const p = schema.safeParse({ displayName: text("displayName"), paymentName: text("paymentName") });
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form and try again" };
  return { ok: true, input: p.data };
}
