"use server";
import { redirect } from "next/navigation";
import { action } from "@/lib/action";
import { createDraft, openBreak } from "@/domain/breaks/commands";
import { parseComposer } from "./parse";

export type ComposerState = { error?: string } | null;

/** Save draft or Open break, decided by the submit button's `intent`. */
export async function saveBreak(_: ComposerState, form: FormData): Promise<ComposerState> {
  const parsed = parseComposer(form);
  if (!parsed.ok) return { error: parsed.error };
  const r = await action(async (tx, caller) => {
    const { breakId } = await createDraft(tx, caller, parsed.input);
    if (parsed.open) await openBreak(tx, caller, breakId);
    return breakId;
  });
  if (!r.ok) return { error: r.message };
  redirect(`/b/${r.data}`);
}
