"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { action } from "@/lib/action";
import { hashIp } from "@/lib/ip-hash";
import { parseInput } from "@/lib/parse-input";
import {
  claimLines, claimRandom, claimAllOpen, claimNext, markSent, markPaid, unmarkPaid, releaseLine, releaseForBuyer, addBonusLine,
} from "@/domain/lines/commands";

const uuid = z.string().uuid();
const nums = z.array(z.number().int().min(1).max(1100)).min(1).max(200);

async function ipHash() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return ip ? hashIp(ip) : undefined;
}
/** A buyer's lines changed: the break page and /me both show them. */
const done = (breakId: string) => { revalidatePath(`/b/${breakId}`); revalidatePath("/me"); };

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
/** Buyer gives back unpaid lines (reason `withdrawn`), all in one transaction. */
export async function giveBack(breakId: string, numbers: number[]) {
  const v = parseInput(z.object({ breakId: uuid, numbers: nums }), { breakId, numbers });
  if (!v.ok) return v;
  const p = v.data;
  const r = await action(async (tx, c) => {
    for (const number of p.numbers) await releaseLine(tx, c, { breakId: p.breakId, number, reason: "withdrawn" });
    return { released: p.numbers };
  });
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
/** Host undoes Paid (the ledger's Undo and per-line un-mark); each line logs `line.unpaid`. */
export async function unpaidForBuyer(breakId: string, numbers: number[]) {
  const v = parseInput(z.object({ breakId: uuid, numbers: nums }), { breakId, numbers });
  if (!v.ok) return v;
  const p = v.data;
  const r = await action(async (tx, c) => {
    for (const number of p.numbers) await unmarkPaid(tx, c, { breakId: p.breakId, number });
    return null;
  });
  if (r.ok) done(breakId);
  return r;
}
export async function releaseBuyer(breakId: string, ownerId: string, numbers: number[], reason: "overdue" | "host_dropped") {
  const v = parseInput(z.object({ breakId: uuid, ownerId: uuid, numbers: nums, reason: z.enum(["overdue", "host_dropped"]) }), { breakId, ownerId, numbers, reason });
  if (!v.ok) return v;
  const p = v.data;
  const r = await action((tx, c) => releaseForBuyer(tx, c, p));
  if (r.ok) done(breakId);
  return r;
}
export async function addBonus(breakId: string, ownerId: string) {
  const v = parseInput(z.object({ breakId: uuid, ownerId: uuid }), { breakId, ownerId });
  if (!v.ok) return v;
  const p = v.data;
  const r = await action((tx, c) => addBonusLine(tx, c, p));
  if (r.ok) done(breakId);
  return r;
}
