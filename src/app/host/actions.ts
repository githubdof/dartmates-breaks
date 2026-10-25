"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action, type ActionFailure } from "@/lib/action";
import { parseInput } from "@/lib/parse-input";
import { deleteDraft } from "@/domain/breaks/commands";
import { removeVariants } from "@/photos/variants";
import { photoStorage } from "@/storage/photo-storage";

/**
 * Deletes the caller's draft and goes back to /host; answers the failure otherwise. Its photos' files go after the
 * commit, each failure logged (Task 11's cleanup removes a deleted draft's leftovers).
 */
export async function deleteDraftAction(breakId: string): Promise<ActionFailure> {
  const parsed = parseInput(z.string().uuid(), breakId);
  if (!parsed.ok) return parsed;
  const r = await action((tx, c) => deleteDraft(tx, c, parsed.data));
  if (!r.ok) return r;
  const storage = photoStorage();
  await Promise.all(r.data.photos.filter((p) => p.prefix !== null).map((p) =>
    removeVariants(storage, p.location, p.prefix).catch((e: unknown) => console.error("deleteDraft: removing photo files", e))));
  revalidatePath("/host");
  redirect("/host"); // outside `action`, so the redirect does not roll the transaction back
}
