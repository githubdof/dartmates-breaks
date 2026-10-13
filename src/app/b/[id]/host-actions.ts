"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { parseInput } from "@/lib/parse-input";
import { openBreak } from "@/domain/breaks/commands";

const uuid = z.string().uuid();

/** Opens a draft for claims (writes `break.opened` via the command). */
export async function openBreakAction(breakId: string) {
  const v = parseInput(uuid, breakId);
  if (!v.ok) return v;
  const id = v.data;
  const r = await action((tx, c) => openBreak(tx, c, id));
  if (r.ok) revalidatePath(`/b/${id}`);
  return r;
}
