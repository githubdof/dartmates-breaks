import { randomUUID } from "node:crypto";
import { sql, eq, and, inArray, isNotNull } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, breakItems, breakPhotos, photoUploads, prizes, breakSecrets, users, hostProfiles } from "@/db/schema";
import { assertHostOf, assertOnboarded, lockBreak } from "@/auth/authz";
import { appendEvent } from "@/domain/events";
import { InvalidInput, NotAuthorized, NotOpen } from "@/domain/errors";
import type { Caller } from "@/domain/types";
import { commitment } from "@/crypto/commit";
import { newSecret, encryptSecret } from "@/crypto/secrets";
import { isUuid } from "@/lib/is-uuid";
import { validateDraftInput, validateDraftForOpen, validatePrizes, isClaimMode, STALE_FORM, type ClaimMode, type ItemCondition } from "./rules";
import { hostPaymentHandles } from "./queries";
import { DARK_COLOURS, LIGHT_COLOURS, type FlightColour } from "@/domain/flights";

/** A prize as the composer sends it: its slot key (photos spec §4.1) and its condition (§7). */
export type PrizeInput = { name: string; slotKey: string; condition: ItemCondition };

export type CreateDraftInput = {
  title: string; description?: string; lineCount: number; linePriceCents: number;
  paymentWindowHours?: number; maxLinesPerUser?: number | null; claimMode?: ClaimMode; paymentInstructions?: string;
  paymentHandles?: { venmo?: string; paypal?: string };
  /** Rank-1 prize items; several items mean the winner picks one. */
  items: (PrizeInput & { variantSchema?: Record<string, string[]> | null; expectedShipAt?: Date | null })[];
  /** Rank-2 prize items (blank names are skipped, their slots ignored). */
  secondPlace?: PrizeInput[];
};

type PlacedPrize = { rank: 1 | 2; slotKey: string; name: string; condition: ItemCondition; variantSchema: Record<string, string[]> | null; expectedShipAt: Date | null };

/** The input's prizes in the composer's order, each with its rank; blank 2nd-place names dropped, slot keys lower-cased. */
function placedPrizes(input: Pick<CreateDraftInput, "items" | "secondPlace">): PlacedPrize[] {
  return [
    ...input.items.map((p) => ({ rank: 1 as const, p, variantSchema: p.variantSchema ?? null, expectedShipAt: p.expectedShipAt ?? null })),
    ...(input.secondPlace ?? []).filter((p) => p.name.trim()).map((p) => ({ rank: 2 as const, p, variantSchema: null, expectedShipAt: null })),
  ].map(({ rank, p, variantSchema, expectedShipAt }) => ({
    rank, slotKey: p.slotKey.toLowerCase(), name: p.name.trim(), condition: p.condition, variantSchema, expectedShipAt,
  }));
}

/** Slot keys must be uuids and distinct, and every named prize needs a condition (ruling R3.5). */
function validateInputPrizes(input: Pick<CreateDraftInput, "items" | "secondPlace">): void {
  validatePrizes([...input.items, ...(input.secondPlace ?? []).filter((p) => p.name.trim())]);
}

type Handles = { venmo?: string; paypal?: string };
const cleanHandles = (h: Handles): Handles => {
  const out: Handles = {};
  if (h.venmo?.trim()) out.venmo = `@${h.venmo.trim().replace(/^@/, "")}`;
  if (h.paypal?.trim()) out.paypal = h.paypal.trim().replace(/^@/, "");
  return out;
};
export function defaultPaymentInstructions(h: Handles): string {
  const parts: string[] = [];
  if (h.venmo) parts.push(`Venmo ${h.venmo}.`);
  if (h.paypal) parts.push(`PayPal paypal.me/${h.paypal}.`);
  return parts.length ? [...parts, "Leave the note blank."].join(" ") : "";
}

/**
 * Upserts host_profiles.payment_handles; when the handles actually changed, bumps payment_handles_changed_at and logs
 * `host.payment_handles_changed` (a trust signal, spec §11). Only ever called for the caller's own profile.
 */
async function savePaymentHandles(tx: Tx, userId: string, h: Handles): Promise<void> {
  const [cur] = await tx.select({ paymentHandles: hostProfiles.paymentHandles }).from(hostProfiles).where(eq(hostProfiles.userId, userId)).for("update");
  const prev: Handles = cur?.paymentHandles ?? {};
  const same = cur !== undefined && (prev.venmo ?? null) === (h.venmo ?? null) && (prev.paypal ?? null) === (h.paypal ?? null);
  if (same) return;
  await tx.insert(hostProfiles).values({ userId, paymentHandles: h, paymentHandlesChangedAt: new Date() })
    .onConflictDoUpdate({ target: hostProfiles.userId, set: { paymentHandles: h, paymentHandlesChangedAt: new Date() } });
  await appendEvent(tx, { actorId: userId, type: "host.payment_handles_changed", payload: { from: prev, to: h } });
}

/**
 * /account "Your kit" (Mosaic §4, §10): one dark and one light colour, the board's surround. Hosts (and admins, who
 * may host) set their own only. host_profiles rows are created lazily, so this upserts exactly as savePaymentHandles
 * does and logs `host.profile_updated` with `changed: ["kit"]`, never the colours (recorded ruling 10). Kits may be
 * shared between hosts (recorded ruling 2).
 */
export async function updateHostKit(tx: Tx, caller: Caller, p: { dark: FlightColour; light: FlightColour }): Promise<void> {
  assertOnboarded(caller);
  // Error copy: recorded ruling 15.
  if (caller.role !== "host" && caller.role !== "admin") throw new NotAuthorized("Only hosts have a kit");
  if (!DARK_COLOURS.includes(p.dark) || !LIGHT_COLOURS.includes(p.light)) throw new InvalidInput("Choose a dark colour and a light colour for your kit");
  const [cur] = await tx.select({ kitDark: hostProfiles.kitDark, kitLight: hostProfiles.kitLight }).from(hostProfiles)
    .where(eq(hostProfiles.userId, caller.id)).for("update");
  if (cur && cur.kitDark === p.dark && cur.kitLight === p.light) return;
  await tx.insert(hostProfiles).values({ userId: caller.id, kitDark: p.dark, kitLight: p.light })
    .onConflictDoUpdate({ target: hostProfiles.userId, set: { kitDark: p.dark, kitLight: p.light } });
  await appendEvent(tx, { actorId: caller.id, type: "host.profile_updated", payload: { changed: ["kit"] } });
}

/**
 * One prize and its item. Each item is stamped with clock_timestamp(), not the transaction's now(), so the items of
 * one save keep the composer's order (ruling R3.4).
 */
async function insertPrize(tx: Tx, breakId: string, p: PlacedPrize): Promise<void> {
  const [it] = await tx.insert(breakItems).values({
    breakId, name: p.name, variantSchema: p.variantSchema, expectedShipAt: p.expectedShipAt, condition: p.condition,
    createdAt: sql`clock_timestamp()`,
  }).returning({ id: breakItems.id });
  await tx.insert(prizes).values({ breakId, rank: p.rank, itemId: it.id, slotKey: p.slotKey });
}

/** Rank-1 items (several make a choice) and rank-2 items (blank names skipped), each with its prize row. */
async function insertPrizes(tx: Tx, breakId: string, input: Pick<CreateDraftInput, "items" | "secondPlace">): Promise<void> {
  for (const p of placedPrizes(input)) await insertPrize(tx, breakId, p);
}

/**
 * A draft save keeps every slot it already has (photos spec §4.1): a kept slot's item and rank are updated in place, a
 * new slot is inserted after the kept ones, and a removed slot loses its prize, its item and the photo tags that named
 * it. Only for drafts: the items guard allows the updates and deletes because a draft has no paid line.
 */
async function syncPrizes(tx: Tx, breakId: string, input: Pick<CreateDraftInput, "items" | "secondPlace">): Promise<void> {
  const wanted = placedPrizes(input);
  const current = await tx.select({ id: prizes.id, rank: prizes.rank, slotKey: prizes.slotKey, itemId: prizes.itemId }).from(prizes)
    .where(and(eq(prizes.breakId, breakId), isNotNull(prizes.itemId)));
  const keep = new Set(wanted.map((p) => p.slotKey));
  const removed = current.filter((c) => !keep.has(c.slotKey));
  if (removed.length > 0) {
    // The tag FK would also null these on the prize delete; clearing them first keeps the rule here, in one place.
    await tx.update(breakPhotos).set({ prizeSlot: null })
      .where(and(eq(breakPhotos.breakId, breakId), inArray(breakPhotos.prizeSlot, removed.map((r) => r.slotKey))));
    await tx.delete(prizes).where(inArray(prizes.id, removed.map((r) => r.id)));
    await tx.delete(breakItems).where(inArray(breakItems.id, removed.map((r) => r.itemId!)));
  }
  const bySlot = new Map(current.map((c) => [c.slotKey, c]));
  for (const p of wanted) {
    const cur = bySlot.get(p.slotKey);
    if (!cur) { await insertPrize(tx, breakId, p); continue; }
    await tx.update(breakItems).set({ name: p.name, variantSchema: p.variantSchema, expectedShipAt: p.expectedShipAt, condition: p.condition })
      .where(eq(breakItems.id, cur.itemId!));
    if (cur.rank !== p.rank) await tx.update(prizes).set({ rank: p.rank }).where(eq(prizes.id, cur.id));
  }
}

/**
 * Creates a draft. With `opts.breakId` (the id the composer was given, photos spec §9) it is idempotent for the same
 * host (ruling R3.2): if that break already exists, a draft of the caller's is saved as updateDraft would (one row, a
 * `break.updated`, no second `break.created`); another caller's id is refused, an admin's included; a break that is no
 * longer a draft is NotOpen and a deleted one NotFound. Two racing calls on one id serialise on the primary key.
 */
export async function createDraft(tx: Tx, caller: Caller, input: CreateDraftInput, opts: { breakId?: string } = {}): Promise<{ breakId: string }> {
  assertOnboarded(caller);
  if (caller.role !== "host" && caller.role !== "admin") throw new NotAuthorized("Only hosts can list a break");
  validateDraftInput(input);
  const claimMode = input.claimMode ?? "pick_or_random";
  if (!isClaimMode(claimMode)) throw new InvalidInput("Choose how buyers get lines");
  validateInputPrizes(input);
  if (opts.breakId !== undefined && !isUuid(opts.breakId)) throw new InvalidInput(STALE_FORM);
  const handles = input.paymentHandles ? cleanHandles(input.paymentHandles) : null;
  let paymentInstructions = input.paymentInstructions?.trim() ?? "";
  if (handles && !paymentInstructions) paymentInstructions = defaultPaymentInstructions(handles);
  // A concurrent insert of the same id waits here on the primary key and, once that commits, inserts nothing.
  const [b] = await tx.insert(breaks).values({
    id: opts.breakId ?? randomUUID(), hostId: caller.id, kind: "main", title: input.title.trim(), description: input.description ?? "",
    lineCount: input.lineCount, linePriceCents: input.linePriceCents,
    paymentWindowHours: input.paymentWindowHours ?? 24, maxLinesPerUser: input.maxLinesPerUser ?? null,
    claimMode, allowRandomClaims: claimMode === "pick_or_random", paymentInstructions,
  }).onConflictDoNothing({ target: breaks.id }).returning({ id: breaks.id });
  if (!b) {
    const existing = await lockBreak(tx, opts.breakId!); // NotFound for a deleted draft
    if (existing.hostId !== caller.id) throw new NotAuthorized("Only the host can do that");
    return updateDraft(tx, caller, existing.id, input);
  }
  if (handles) await savePaymentHandles(tx, caller.id, handles);
  await insertPrizes(tx, b.id, input);
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "break.created", payload: { claimMode } });
  return { breakId: b.id };
}

/**
 * Design §5.6: drafts can be edited, by their host (or an admin) only. Replaces the settings and every prize in one
 * transaction and logs `break.updated`. When the host edits, supplied payment handles are saved to their profile, as
 * createDraft does. An admin never writes the host's profile: blank instructions are built from the handles supplied,
 * or from the host's stored ones when the form left them blank.
 */
export async function updateDraft(tx: Tx, caller: Caller, breakId: string, input: CreateDraftInput): Promise<{ breakId: string }> {
  assertOnboarded(caller);
  const b = await assertHostOf(tx, caller, breakId); // locks the break row first
  if (b.status !== "draft") throw new NotOpen(b.status);
  validateDraftInput(input);
  const claimMode = input.claimMode ?? "pick_or_random";
  if (!isClaimMode(claimMode)) throw new InvalidInput("Choose how buyers get lines");
  validateInputPrizes(input);
  let paymentInstructions = input.paymentInstructions?.trim() ?? "";
  if (caller.id === b.hostId) {
    if (input.paymentHandles) {
      const handles = cleanHandles(input.paymentHandles);
      await savePaymentHandles(tx, b.hostId, handles);
      if (!paymentInstructions) paymentInstructions = defaultPaymentInstructions(handles);
    }
  } else if (!paymentInstructions) {
    // An admin editing someone else's draft never writes the host's profile: build the instructions from the handles
    // supplied, or from the host's stored ones when the form left them blank, so a blank form erases nothing.
    const supplied = cleanHandles(input.paymentHandles ?? {});
    const handles = supplied.venmo || supplied.paypal ? supplied : await hostPaymentHandles(tx, b.hostId);
    paymentInstructions = defaultPaymentInstructions(handles);
  }
  await tx.update(breaks).set({
    title: input.title.trim(), description: input.description ?? "", lineCount: input.lineCount, linePriceCents: input.linePriceCents,
    paymentWindowHours: input.paymentWindowHours ?? 24, maxLinesPerUser: input.maxLinesPerUser ?? null,
    claimMode, allowRandomClaims: claimMode === "pick_or_random", paymentInstructions,
  }).where(eq(breaks.id, b.id));
  await syncPrizes(tx, b.id, input);
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "break.updated", payload: { claimMode, lineCount: input.lineCount, linePriceCents: input.linePriceCents } });
  return { breakId: b.id };
}

type PhotoLocation = (typeof breakPhotos.$inferSelect)["bucket"];

/**
 * Delete draft (photos spec §9): the host or an admin, drafts only. The prizes, items, photo rows and upload rows
 * go; the break row stays as a tombstone (`deleted_at`) because its events reference it, and lockBreak then treats it
 * as not found. Returns where every photo row's files are (rows whose files are already gone are skipped), for the
 * caller to remove from Storage after the commit.
 */
export async function deleteDraft(tx: Tx, caller: Caller, breakId: string): Promise<{ photos: { location: PhotoLocation; prefix: string }[] }> {
  assertOnboarded(caller);
  const b = await assertHostOf(tx, caller, breakId); // locks the break row first
  if (b.status !== "draft") throw new NotOpen(b.status);
  const rows = await tx.select({ bucket: breakPhotos.bucket, path: breakPhotos.path }).from(breakPhotos).where(eq(breakPhotos.breakId, b.id));
  await tx.delete(breakPhotos).where(eq(breakPhotos.breakId, b.id));
  await tx.delete(photoUploads).where(eq(photoUploads.breakId, b.id));
  // Prizes reference items: delete them first. A draft has no paid line, so the items guard allows both.
  await tx.delete(prizes).where(eq(prizes.breakId, b.id));
  await tx.delete(breakItems).where(eq(breakItems.breakId, b.id));
  await tx.update(breaks).set({ deletedAt: new Date() }).where(eq(breaks.id, b.id));
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "break.deleted", payload: { photos: rows.length } });
  return { photos: rows.flatMap((r) => (r.path === null ? [] : [{ location: r.bucket, prefix: r.path }])) };
}

export async function openBreak(tx: Tx, caller: Caller, breakId: string): Promise<void> {
  assertOnboarded(caller);
  const b = await assertHostOf(tx, caller, breakId);
  if (b.status !== "draft") throw new NotOpen(b.status);
  const [host] = await tx.select({ bannedAt: users.bannedAt, pausedAt: users.listingPausedAt }).from(users).where(sql`${users.id} = ${b.hostId}`).for("update");
  if (host.bannedAt || host.pausedAt) throw new NotAuthorized("Listing is paused for this account");
  const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(prizes).where(sql`${prizes.breakId} = ${breakId} and ${prizes.rank} = 1`);
  validateDraftForOpen(b, count);

  const secret = newSecret();
  const { ciphertext, keyId } = encryptSecret(secret, breakId);
  await tx.insert(breakSecrets).values({ breakId, ciphertext, keyId });
  await tx.update(breaks).set({ status: "open", openedAt: new Date(), seedCommitment: commitment(secret) }).where(sql`${breaks.id} = ${breakId}`);
  await tx.execute(sql`insert into lines (break_id, number) select ${breakId}::uuid, generate_series(1, ${b.lineCount})`);
  await appendEvent(tx, { breakId, actorId: caller.id, type: "break.opened", payload: { lineCount: b.lineCount, linePriceCents: b.linePriceCents } });
}
