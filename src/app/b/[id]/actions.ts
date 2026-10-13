"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { action } from "@/lib/action";
import { claimLines, claimRandom, claimAllOpen, markSent, markPaid, releaseLine } from "@/domain/lines/commands";

const uuid = z.string().uuid();
const nums = z.array(z.number().int().min(1).max(1100)).min(1).max(200);

async function ipHash() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return ip ? createHash("sha256").update(ip).digest("hex").slice(0, 32) : undefined;
}
const done = (breakId: string) => revalidatePath(`/b/${breakId}`);

export async function claim(breakId: string, numbers: number[], batchId: string) {
  const p = z.object({ breakId: uuid, numbers: nums, batchId: uuid }).parse({ breakId, numbers, batchId });
  const hash = await ipHash();
  const r = await action((tx, c) => claimLines(tx, c, { ...p, ipHash: hash }));
  if (r.ok) done(breakId);
  return r;
}
export async function claimRandomAction(breakId: string, count: number, batchId: string) {
  const p = z.object({ breakId: uuid, count: z.number().int().min(1).max(50), batchId: uuid }).parse({ breakId, count, batchId });
  const hash = await ipHash();
  const r = await action((tx, c) => claimRandom(tx, c, { ...p, ipHash: hash }));
  if (r.ok) done(breakId);
  return r;
}
export async function claimRest(breakId: string, batchId: string) {
  const p = z.object({ breakId: uuid, batchId: uuid }).parse({ breakId, batchId });
  const hash = await ipHash();
  const r = await action((tx, c) => claimAllOpen(tx, c, { ...p, ipHash: hash }));
  if (r.ok) done(breakId);
  return r;
}
export async function sent(breakId: string, numbers: number[]) {
  const p = z.object({ breakId: uuid, numbers: nums }).parse({ breakId, numbers });
  const r = await action((tx, c) => markSent(tx, c, p));
  if (r.ok) done(breakId);
  return r;
}
export async function paidForBuyer(breakId: string, ownerId: string, numbers: number[]) {
  const p = z.object({ breakId: uuid, ownerId: uuid, numbers: nums }).parse({ breakId, ownerId, numbers });
  const r = await action(async (tx, c) => {
    let filled = false;
    for (const number of p.numbers) filled = (await markPaid(tx, c, { breakId: p.breakId, number, expectedOwnerId: p.ownerId })).filled;
    return { filled };
  });
  if (r.ok) done(breakId);
  return r;
}
export async function release(breakId: string, number: number, reason: "overdue" | "host_dropped" | "withdrawn") {
  const p = z.object({ breakId: uuid, number: z.number().int().min(1), reason: z.enum(["overdue", "host_dropped", "withdrawn"]) }).parse({ breakId, number, reason });
  const r = await action((tx, c) => releaseLine(tx, c, p));
  if (r.ok) done(breakId);
  return r;
}
