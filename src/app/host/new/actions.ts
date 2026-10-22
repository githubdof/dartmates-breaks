"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCaller } from "@/auth/session";
import { action } from "@/lib/action";
import { isUuid } from "@/lib/is-uuid";
import { createDraft, openBreak, updateDraft } from "@/domain/breaks/commands";
import { PhotosNotReady } from "@/domain/errors";
import { assertPhotosPublished, publishDraftPhotos, settleOpenCopies } from "@/photos/publish";
import { photoStorage } from "@/storage/photo-storage";
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
  const id = editing ?? newBreakId;
  // Opening publishes the draft's photos first, outside any transaction (photos spec §5.4, plan ruling 13).
  const storage = photoStorage();
  let copied: Awaited<ReturnType<typeof publishDraftPhotos>> = { ids: new Set(), prefixes: [] };
  const caller = parsed.open ? await getCaller() : null;
  if (caller) {
    try {
      copied = await publishDraftPhotos(storage, caller, id);
    } catch (e) {
      if (!(e instanceof PhotosNotReady)) console.error(e);
      const error = e instanceof PhotosNotReady ? e.message : "Something went wrong. Please try again.";
      return { error, values: submitted(form) };
    }
  }
  const r = await action(async (tx, c) => {
    const { breakId } = editing ? await updateDraft(tx, c, editing, parsed.input) : await createDraft(tx, c, parsed.input, { breakId: newBreakId });
    if (parsed.open) {
      await assertPhotosPublished(tx, breakId, copied.ids); // the break is locked by the command above
      await openBreak(tx, c, breakId);
    }
    return breakId;
  });
  // An open that settleOpenCopies proves committed (the reply was lost, the open landed) is a success.
  const committed = parsed.open ? await settleOpenCopies(storage, id, copied.prefixes, r.ok ? null : r) : r.ok;
  if (!committed) return { error: r.ok ? "Something went wrong. Please try again." : r.message, values: submitted(form) };
  const opened = r.ok ? r.data : id;
  revalidatePath("/host");
  revalidatePath(`/b/${opened}`);
  redirect(`/b/${opened}`);
}
