"use server";
import { redirect } from "next/navigation";
import { action } from "@/lib/action";
import { createDraft, openBreak } from "@/domain/breaks/commands";
import { parseComposer } from "./parse";

/** On error the submitted values come back so the form can refill its fields (React 19 resets uncontrolled ones). */
export type ComposerState = { error?: string; values?: Record<string, string> } | null;

function submitted(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string" && k !== "intent" && !k.startsWith("$") && !(k in out)) out[k] = v;
  return out;
}

/** Save draft or Open break, decided by the submit button's `intent`. */
export async function saveBreak(_: ComposerState, form: FormData): Promise<ComposerState> {
  const parsed = parseComposer(form);
  if (!parsed.ok) return { error: parsed.error, values: submitted(form) };
  const r = await action(async (tx, caller) => {
    const { breakId } = await createDraft(tx, caller, parsed.input);
    if (parsed.open) await openBreak(tx, caller, breakId);
    return breakId;
  });
  if (!r.ok) return { error: r.message, values: submitted(form) };
  redirect(`/b/${r.data}`);
}
