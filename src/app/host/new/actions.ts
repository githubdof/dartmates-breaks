"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { isUuid } from "@/lib/is-uuid";
import { createDraft, openBreak, updateDraft } from "@/domain/breaks/commands";
import { parseComposer } from "./parse";

/** On error the submitted values come back so the form can refill its fields (React 19 resets uncontrolled ones). */
export type ComposerState = { error?: string; values?: Record<string, string> } | null;

function submitted(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string" && k !== "intent" && !k.startsWith("$") && !(k in out)) out[k] = v;
  return out;
}

/** Save draft or Open break, decided by the submit button's `intent`; a hidden `breakId` means "this draft". */
export async function saveBreak(_: ComposerState, form: FormData): Promise<ComposerState> {
  const parsed = parseComposer(form);
  if (!parsed.ok) return { error: parsed.error, values: submitted(form) };
  const rawId = form.get("breakId");
  const editing = typeof rawId === "string" && rawId !== "" ? rawId : null;
  if (editing !== null && !isUuid(editing)) return { error: "This draft could not be found.", values: submitted(form) };
  // A new break arrives with the id the server gave the page, so photos added before the first save belong to it.
  const rawNew = form.get("newBreakId");
  const newBreakId = typeof rawNew === "string" ? rawNew : "";
  if (editing === null && !isUuid(newBreakId)) return { error: "This form is out of date. Reload the page and try again.", values: submitted(form) };
  const r = await action(async (tx, caller) => {
    const { breakId } = editing ? await updateDraft(tx, caller, editing, parsed.input) : await createDraft(tx, caller, parsed.input, { breakId: newBreakId });
    if (parsed.open) await openBreak(tx, caller, breakId);
    return breakId;
  });
  if (!r.ok) return { error: r.message, values: submitted(form) };
  revalidatePath("/host");
  revalidatePath(`/b/${r.data}`);
  redirect(`/b/${r.data}`);
}
