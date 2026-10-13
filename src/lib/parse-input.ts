import type { z } from "zod";

export type InvalidInput = { ok: false; code: "INVALID_INPUT"; message: string };

/** Validate action input without throwing, so the ActionResult contract always holds. */
export function parseInput<S extends z.ZodTypeAny>(schema: S, input: unknown): { ok: true; data: z.infer<S> } | InvalidInput {
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, code: "INVALID_INPUT", message: r.error.issues[0]?.message ?? "Invalid input" };
}
