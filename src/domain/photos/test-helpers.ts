// Shared by the photo domain's Postgres tests (not a test file itself: the copy audit reads it, so no gambling words).
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, breakPhotos, prizes } from "@/db/schema";
import { claimLines } from "@/domain/lines/commands";
import type { Caller } from "@/domain/types";
import { makeUser, openBreakWithLines, makePhoto, addPrize } from "../../../tests/helpers/fixtures";

export const NOW = new Date("2026-10-21T10:50:00Z");
export const as = (id: string, role: Caller["role"] = "host"): Caller => ({ id, role, onboarded: true, banned: false });
export const later = (s: number) => new Date(NOW.getTime() + s * 1000);
export const setStatus = (tx: Tx, id: string, status: string) => tx.update(breaks).set({ status }).where(sql`${breaks.id} = ${id}`);
/** The break's rows holding a live position, in order. */
export const live = async (tx: Tx, breakId: string) => tx.select().from(breakPhotos)
  .where(sql`${breakPhotos.breakId} = ${breakId} and ${breakPhotos.removedAt} is null and ${breakPhotos.hiddenAt} is null`)
  .orderBy(breakPhotos.position);

/**
 * An open break with a 2nd-place prize ("Case"), `n` live photos tagged per `slots` (null, the top spot or 2nd place),
 * and line 1 claimed by a member, so first_claimed_at is set (Task 2).
 */
export async function claimedBreak(tx: Tx, n: number, slots: ("top" | "second" | null)[] = []) {
  const host = await makeUser(tx, { role: "host" });
  const buyer = await makeUser(tx);
  const b = await openBreakWithLines(tx, { hostId: host.id });
  const [{ top }] = await tx.select({ top: prizes.slotKey }).from(prizes).where(sql`${prizes.breakId} = ${b.id} and ${prizes.rank} = 1`);
  const second = await addPrize(tx, b.id, 2, "Case");
  const photos: { id: string; prefix: string }[] = [];
  for (let i = 0; i < n; i++) {
    const s = slots[i] ?? null;
    photos.push(await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: i, slot: s === "top" ? top : s === "second" ? second : null }));
  }
  await claimLines(tx, as(buyer.id, "member"), { breakId: b.id, numbers: [1], batchId: randomUUID() });
  return { host, buyer, b, top, second, photos };
}
