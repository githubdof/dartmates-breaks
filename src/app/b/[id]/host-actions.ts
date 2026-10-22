"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCaller } from "@/auth/session";
import { assertHostOf, assertOnboarded } from "@/auth/authz";
import { action, type ActionResult } from "@/lib/action";
import { toFailure } from "@/lib/action-result";
import { parseInput } from "@/lib/parse-input";
import { openBreak } from "@/domain/breaks/commands";
import { PhotosNotReady } from "@/domain/errors";
import { assertPhotosPublished, publishDraftPhotos, settleOpenCopies } from "@/photos/publish";
import { photoStorage } from "@/storage/photo-storage";

const uuid = z.string().uuid();

/**
 * Opens a draft for claims (writes `break.opened` via the command). Its draft photos are copied to `photos` first,
 * outside any transaction, and their draft originals go once the open has committed (photos spec §5.4).
 */
export async function openBreakAction(breakId: string): Promise<ActionResult<void>> {
  const v = parseInput(uuid, breakId);
  if (!v.ok) return v;
  const id = v.data;
  const storage = photoStorage();
  const caller = await getCaller();
  let copied: Awaited<ReturnType<typeof publishDraftPhotos>> = { ids: new Set(), prefixes: [] };
  if (caller) {
    try {
      copied = await publishDraftPhotos(storage, caller, id);
    } catch (e) {
      if (e instanceof PhotosNotReady) return toFailure(e);
      console.error(e);
      return { ok: false, code: "INTERNAL", message: "Something went wrong. Please try again." };
    }
  }
  const r = await action(async (tx, c) => {
    assertOnboarded(c);
    await assertHostOf(tx, c, id); // the break is locked before the photos are checked
    await assertPhotosPublished(tx, id, copied.ids);
    await openBreak(tx, c, id);
  });
  const committed = await settleOpenCopies(storage, id, copied.prefixes, r.ok ? null : r);
  if (!committed) return r;
  revalidatePath(`/b/${id}`);
  return { ok: true, data: undefined };
}
