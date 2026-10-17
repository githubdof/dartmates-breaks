import { eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { hostProfiles, users } from "@/db/schema";
import { flightOf, kitFor, type Flight, type Kit } from "@/domain/flights";
import { InvalidInput } from "@/domain/errors";
import { normalizeHandle } from "./commands";

export type Account = {
  handle: string | null; displayName: string | null; paymentName: string | null; createdAt: Date;
  /** The stored flight (never the per-break substituted shape); chosen once the member has picked one. */
  flight: Flight; flightChosen: boolean;
  /** The host kit: the default (Blue with Yellow) until the host picks one. */
  kit: Kit; kitChosen: boolean;
};

/** The fields /account shows and edits. */
export async function accountOf(tx: Tx, userId: string): Promise<Account | null> {
  const [r] = await tx.select({
    handle: users.handle, displayName: users.displayName, paymentName: users.paymentName, createdAt: users.createdAt,
    flightColour: users.flightColour, flightShape: users.flightShape, flightChosenAt: users.flightChosenAt,
    kitDark: hostProfiles.kitDark, kitLight: hostProfiles.kitLight,
  }).from(users).leftJoin(hostProfiles, eq(hostProfiles.userId, users.id)).where(eq(users.id, userId));
  if (!r) return null;
  return {
    handle: r.handle, displayName: r.displayName, paymentName: r.paymentName, createdAt: r.createdAt,
    flight: flightOf(r), flightChosen: r.flightChosenAt !== null,
    kit: kitFor({ kitDark: r.kitDark ?? null, kitLight: r.kitLight ?? null }), kitChosen: r.kitDark != null,
  };
}

/** The break page's "This is your flight" (§8): the viewer's stored flight, and whether they ever picked one. */
export async function viewerFlightOf(tx: Tx, userId: string): Promise<{ flight: Flight; chosen: boolean } | null> {
  const [r] = await tx.select({ flightColour: users.flightColour, flightShape: users.flightShape, flightChosenAt: users.flightChosenAt })
    .from(users).where(eq(users.id, userId));
  return r ? { flight: flightOf(r), chosen: r.flightChosenAt !== null } : null;
}

export type HandleState = { state: "free" | "taken" } | { state: "invalid"; message: string };

/**
 * Live availability for onboarding (design §5.10), normalised exactly as onboarding stores handles. Says only
 * taken or free: no id, name or other detail of whoever holds it. The caller's own handle reads as free.
 */
export async function handleStatus(tx: Tx, raw: string, selfId: string): Promise<HandleState> {
  let handle: string;
  try {
    handle = normalizeHandle(raw);
  } catch (e) {
    if (e instanceof InvalidInput) return { state: "invalid", message: e.message };
    throw e;
  }
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(users).where(sql`lower(${users.handle}) = ${handle} and ${users.id} <> ${selfId}`);
  return { state: r.n > 0 ? "taken" : "free" };
}

/** The member's stored flight (Mosaic §4: drawn at random when the row was created, never derived from the id). */
export async function myFlight(tx: Tx, userId: string): Promise<Flight> {
  const [r] = await tx.select({ flightColour: users.flightColour, flightShape: users.flightShape }).from(users).where(eq(users.id, userId));
  if (!r) throw new Error(`no user ${userId}`);
  return flightOf(r);
}
