import { sql, eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { breaks, breakItems, prizes, breakSecrets, users, hostProfiles } from "@/db/schema";
import { assertHostOf, assertOnboarded } from "@/auth/authz";
import { appendEvent } from "@/domain/events";
import { InvalidInput, NotAuthorized, NotOpen } from "@/domain/errors";
import type { Caller } from "@/domain/types";
import { commitment } from "@/crypto/commit";
import { newSecret, encryptSecret } from "@/crypto/secrets";
import { validateDraftInput, validateDraftForOpen, isClaimMode, type ClaimMode } from "./rules";

export type CreateDraftInput = {
  title: string; description?: string; lineCount: number; linePriceCents: number;
  paymentWindowHours?: number; maxLinesPerUser?: number | null; claimMode?: ClaimMode; paymentInstructions?: string;
  paymentHandles?: { venmo?: string; paypal?: string };
  /** Rank-1 prize items; several items mean the winner picks one. */
  items: { name: string; variantSchema?: Record<string, string[]> | null; expectedShipAt?: Date | null }[];
  /** Rank-2 prize items (blank names are skipped). */
  secondPlace?: { name: string }[];
};

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

/** Upserts host_profiles.payment_handles; bumps payment_handles_changed_at only when the handles actually changed. */
async function savePaymentHandles(tx: Tx, userId: string, h: Handles): Promise<void> {
  const [cur] = await tx.select({ paymentHandles: hostProfiles.paymentHandles }).from(hostProfiles).where(eq(hostProfiles.userId, userId)).for("update");
  const prev: Handles = cur?.paymentHandles ?? {};
  const same = cur !== undefined && (prev.venmo ?? null) === (h.venmo ?? null) && (prev.paypal ?? null) === (h.paypal ?? null);
  if (same) return;
  await tx.insert(hostProfiles).values({ userId, paymentHandles: h, paymentHandlesChangedAt: new Date() })
    .onConflictDoUpdate({ target: hostProfiles.userId, set: { paymentHandles: h, paymentHandlesChangedAt: new Date() } });
}

export async function createDraft(tx: Tx, caller: Caller, input: CreateDraftInput): Promise<{ breakId: string }> {
  assertOnboarded(caller);
  if (caller.role !== "host" && caller.role !== "admin") throw new NotAuthorized("Only hosts can list a break");
  validateDraftInput(input);
  const claimMode = input.claimMode ?? "pick_or_random";
  if (!isClaimMode(claimMode)) throw new InvalidInput("Choose how buyers get lines");
  let paymentInstructions = input.paymentInstructions?.trim() ?? "";
  if (input.paymentHandles) {
    const handles = cleanHandles(input.paymentHandles);
    await savePaymentHandles(tx, caller.id, handles);
    if (!paymentInstructions) paymentInstructions = defaultPaymentInstructions(handles);
  }
  const [b] = await tx.insert(breaks).values({
    hostId: caller.id, kind: "main", title: input.title.trim(), description: input.description ?? "",
    lineCount: input.lineCount, linePriceCents: input.linePriceCents,
    paymentWindowHours: input.paymentWindowHours ?? 24, maxLinesPerUser: input.maxLinesPerUser ?? null,
    claimMode, allowRandomClaims: claimMode === "pick_or_random", paymentInstructions,
  }).returning({ id: breaks.id });
  for (const item of input.items) {
    const [it] = await tx.insert(breakItems).values({
      breakId: b.id, name: item.name.trim(), variantSchema: item.variantSchema ?? null, expectedShipAt: item.expectedShipAt ?? null,
    }).returning({ id: breakItems.id });
    await tx.insert(prizes).values({ breakId: b.id, rank: 1, itemId: it.id });
  }
  for (const item of input.secondPlace ?? []) {
    if (!item.name.trim()) continue;
    const [it] = await tx.insert(breakItems).values({ breakId: b.id, name: item.name.trim() }).returning({ id: breakItems.id });
    await tx.insert(prizes).values({ breakId: b.id, rank: 2, itemId: it.id });
  }
  await appendEvent(tx, { breakId: b.id, actorId: caller.id, type: "break.created", payload: { claimMode } });
  return { breakId: b.id };
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
