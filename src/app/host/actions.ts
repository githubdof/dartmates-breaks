"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action, type ActionFailure } from "@/lib/action";
import { parseInput } from "@/lib/parse-input";
import { deleteDraft } from "@/domain/breaks/commands";

/** Deletes the caller's draft and goes back to /host; answers the failure otherwise. */
export async function deleteDraftAction(breakId: string): Promise<ActionFailure> {
  const parsed = parseInput(z.string().uuid(), breakId);
  if (!parsed.ok) return parsed;
  const r = await action((tx, c) => deleteDraft(tx, c, parsed.data));
  if (!r.ok) return r;
  revalidatePath("/host");
  redirect("/host"); // outside `action`, so the redirect does not roll the transaction back
}
