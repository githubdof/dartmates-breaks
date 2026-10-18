import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { users, legalAcceptances } from "@/db/schema";
import { InvalidInput, NotFound } from "@/domain/errors";
import type { Caller } from "@/domain/types";
import { appendEvent } from "@/domain/events";
import { assertOnboarded } from "@/auth/authz";
import { isFlightColour, isFlightShape, type FlightColour, type FlightShape } from "@/domain/flights";

export const TERMS_VERSION = "2026-10-13";

export const RESERVED_HANDLES: ReadonlySet<string> = new Set(["admin", "administrator", "host", "support", "breaks", "system", "mod", "moderator", "staff", "help", "me"]);
const RESERVED = RESERVED_HANDLES;

export function normalizeHandle(raw: string): string {
  const h = raw.normalize("NFKC").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(h)) throw new InvalidInput("Handle must be 3–20 letters, numbers or underscores");
  if (RESERVED.has(h)) throw new InvalidInput("That handle is reserved");
  return h;
}

/** "  John   Smith " → "John Smith"; blank → null. At most 60 characters (users_payment_name_chk). */
export function cleanPaymentName(raw: string | null | undefined): string | null {
  const s = (raw ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!s) return null;
  if (s.length > 60) throw new InvalidInput("Payment name: at most 60 characters");
  return s;
}

/** Handle and display name are editable for 30 days after sign-up, then locked (platform spec §6). */
export const NAME_LOCK_DAYS = 30;
export const nameLocked = (createdAt: Date, now: Date): boolean => now.getTime() - createdAt.getTime() > NAME_LOCK_DAYS * 86_400_000;

function cleanDisplayName(raw: string): string {
  const s = raw.normalize("NFKC").trim();
  if (s.length < 1 || s.length > 40) throw new InvalidInput("Display name must be 1–40 characters");
  return s;
}

export async function completeOnboarding(tx: Tx, caller: Caller, p: { handle: string; displayName: string; ageConfirmed: boolean; acceptedTerms: boolean; paymentName?: string; ipHash?: string }): Promise<void> {
  if (!p.ageConfirmed) throw new InvalidInput("You must confirm you are 18 or older");
  if (!p.acceptedTerms) throw new InvalidInput("You must accept the terms");
  const handle = normalizeHandle(p.handle);
  const displayName = cleanDisplayName(p.displayName);
  const payment = p.paymentName !== undefined ? { paymentName: cleanPaymentName(p.paymentName) } : {};
  let updated: { id: string }[];
  try {
    // Any account that is not fully set up may finish here, including one that already has a handle
    // (the half-set-up account: handle, but no display name or age confirmation).
    updated = await tx.update(users).set({ handle, displayName, ...payment, ageConfirmedAt: sql`coalesce(${users.ageConfirmedAt}, now())` })
      .where(sql`${users.id} = ${caller.id} and (${users.handle} is null or ${users.displayName} is null or ${users.ageConfirmedAt} is null)`)
      .returning({ id: users.id });
  } catch (e) {
    // drizzle wraps the driver error (DrizzleQueryError); the postgres error is on `.cause`
    const pg = (e instanceof Error && "cause" in e ? (e as { cause?: unknown }).cause : undefined) ?? e;
    const code = typeof pg === "object" && pg !== null && "code" in pg ? (pg as { code?: string }).code : undefined;
    if (code === "23505") throw new InvalidInput("That handle is taken");
    throw e;
  }
  if (updated.length === 0) throw new InvalidInput("Your account is already set up");
  await tx.insert(legalAcceptances).values({ userId: caller.id, docKind: "terms", version: TERMS_VERSION, ipHash: p.ipHash ?? null });
  await appendEvent(tx, { actorId: caller.id, type: "user.onboarded", payload: { handle } });
}

/** /account: the display name (locked 30 days after sign-up) and the payment name (always editable). */
export async function updateProfile(tx: Tx, caller: Caller, p: { displayName: string; paymentName: string }): Promise<{ changed: ("displayName" | "paymentName")[] }> {
  assertOnboarded(caller);
  const displayName = cleanDisplayName(p.displayName);
  const paymentName = cleanPaymentName(p.paymentName);
  const [cur] = await tx.select({ displayName: users.displayName, paymentName: users.paymentName, createdAt: users.createdAt })
    .from(users).where(sql`${users.id} = ${caller.id}`).for("update");
  if (!cur) throw new NotFound("Account not found");
  const changed: ("displayName" | "paymentName")[] = [];
  const set: Partial<typeof users.$inferInsert> = {};
  if (displayName !== cur.displayName) {
    if (nameLocked(cur.createdAt, new Date())) throw new InvalidInput("Your display name is locked 30 days after sign-up.");
    set.displayName = displayName;
    set.nameChangedAt = new Date();
    changed.push("displayName");
  }
  if (paymentName !== cur.paymentName) {
    set.paymentName = paymentName;
    changed.push("paymentName");
  }
  if (changed.length === 0) return { changed };
  await tx.update(users).set(set).where(sql`${users.id} = ${caller.id}`);
  // Which fields changed, never the names themselves: events are append-only and outlive an account's deletion.
  await appendEvent(tx, { actorId: caller.id, type: "user.profile_updated", payload: { changed } });
  return { changed };
}

/**
 * /account "Your flight" (Mosaic §4, §10): any of the 32, at once everywhere (a flight is identity, not per break).
 * Choosing marks flight_chosen_at, keeping the random one included; once chosen, the same flight again is a no-op.
 */
export async function updateFlight(tx: Tx, caller: Caller, p: { colour: FlightColour; shape: FlightShape }): Promise<void> {
  assertOnboarded(caller);
  // Error copy: recorded ruling 15.
  if (!isFlightColour(p.colour) || !isFlightShape(p.shape)) throw new InvalidInput("Choose one of the 32 flights");
  const [cur] = await tx.select({ colour: users.flightColour, shape: users.flightShape, chosenAt: users.flightChosenAt })
    .from(users).where(sql`${users.id} = ${caller.id}`).for("update");
  if (!cur) throw new NotFound("Account not found");
  if (cur.colour === p.colour && cur.shape === p.shape && cur.chosenAt) return;
  await tx.update(users).set({ flightColour: p.colour, flightShape: p.shape, flightChosenAt: new Date() }).where(sql`${users.id} = ${caller.id}`);
  // The changed field's name, never the values (spec §10, recorded ruling 10), as updateProfile logs its fields.
  await appendEvent(tx, { actorId: caller.id, type: "user.profile_updated", payload: { changed: ["flight"] } });
}
