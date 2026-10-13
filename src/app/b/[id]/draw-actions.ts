"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { parseInput } from "@/lib/parse-input";
import { requestDraw, finaliseDraw } from "@/domain/draws/commands";
import { beaconFromEnv } from "@/crypto/beacon";

const uuid = z.string().uuid();

export async function requestDrawAction(breakId: string) {
  const v = parseInput(uuid, breakId);
  if (!v.ok) return v;
  const id = v.data;
  const r = await action((tx, c) => requestDraw(tx, c, { breakId: id }));
  if (r.ok) revalidatePath(`/b/${id}`);
  return r;
}
export async function finaliseDrawAction(breakId: string) {
  const v = parseInput(uuid, breakId);
  if (!v.ok) return v;
  const id = v.data;
  const r = await action((tx, c) => finaliseDraw(tx, c, { breakId: id }, beaconFromEnv()));
  if (r.ok) { revalidatePath(`/b/${id}`); revalidatePath(`/b/${id}/result`); }
  return r;
}
