"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { action } from "@/lib/action";
import { hashIp } from "@/lib/ip-hash";
import { parseInput } from "@/lib/parse-input";
import { claimLines, claimRandom, claimAllOpen, claimNext, markSent, markPaid, releaseLine } from "@/domain/lines/commands";

const uuid = z.string().uuid();
const nums = z.array(z.number().int().min(1).max(1100)).min(1).max(200);

async function ipHash() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return ip ? hashIp(ip) : undefined;
}
const done = (breakId: string) => revalidatePath(`/b/${breakId}`);

export async function claim(breakId: string, numbers: number[], batchId: string) {
  const v = parseInput(z.object({ breakId: uuid, numbers: nums, batchId: uuid }), { breakId, numbers, batchId });
  if (!v.ok) return v;
  const p = v.data;
  const hash = await ipHash();
  const r = await action((tx, c) => claimLines(tx, c, { ...p, ipHash: hash }));
  if (r.ok) done(breakId);
  return r;
}
export async function claimRandomAction(breakId: string, count: number, batchId: string) {
  const v = parseInput(z.object({ breakId: uuid, count: z.number().int().min(1).max(50), batchId: uuid }), { breakId, count, batchId });
  if (!v.ok) return v;
  const p = v.data;
  const hash = await ipHash();
  const r = await action((tx, c) => claimRandom(tx, c, { ...p, ipHash: hash }));
  if (r.ok) done(breakId);
  return r;
}
export async function claimNextAction(breakId: string, count: number, batchId: string) {
  const v = parseInput(z.object({ breakId: uuid, count: z.number().int().min(1).max(50), batchId: uuid }), { breakId, count, batchId });
  if (!v.ok) return v;
  const p = v.data;
  const hash = await ipHash();
  const r = await action((tx, c) => claimNext(tx, c, { ...p, ipHash: hash }));
  if (r.ok) done(breakId);
  return r;
}
export async function claimRest(breakId: string, batchId: string) {
  const v = parseInput(z.object({ breakId: uuid, batchId: uuid }), { breakId, batchId });
  if (!v.ok) return v;
  const p = v.data;
  const hash = await ipHash();
  const r = await action((tx, c) => claimAllOpen(tx, c, { ...p, ipHash: hash }));
  if (r.ok) done(breakId);
  return r;
}
export async function sent(breakId: string, numbers: number[]) {
  const v = parseInput(z.object({ breakId: uuid, numbers: nums }), { breakId, numbers });
  if (!v.ok) return v;
  const p = v.data;
  const r = await action((tx, c) => markSent(tx, c, p));
  if (r.ok) done(breakId);
  return r;
}
export async function paidForBuyer(breakId: string, ownerId: string, numbers: number[]) {
  const v = parseInput(z.object({ breakId: uuid, ownerId: uuid, numbers: nums }), { breakId, ownerId, numbers });
  if (!v.ok) return v;
  const p = v.data;
  const r = await action(async (tx, c) => {
    let filled = false;
    for (const number of p.numbers) filled = (await markPaid(tx, c, { breakId: p.breakId, number, expectedOwnerId: p.ownerId })).filled;
    return { filled };
  });
  if (r.ok) done(breakId);
  return r;
}
export async function release(breakId: string, number: number, reason: "overdue" | "host_dropped" | "withdrawn") {
  const v = parseInput(z.object({ breakId: uuid, number: z.number().int().min(1).max(1100), reason: z.enum(["overdue", "host_dropped", "withdrawn"]) }), { breakId, number, reason });
  if (!v.ok) return v;
  const p = v.data;
  const r = await action((tx, c) => releaseLine(tx, c, p));
  if (r.ok) done(breakId);
  return r;
}
