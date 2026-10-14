import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { users, legalAcceptances } from "@/db/schema";
import { InvalidInput } from "@/domain/errors";
import type { Caller } from "@/domain/types";
import { appendEvent } from "@/domain/events";

export const TERMS_VERSION = "2026-10-13";

export const RESERVED_HANDLES: ReadonlySet<string> = new Set(["admin", "administrator", "host", "support", "breaks", "system", "mod", "moderator", "staff", "help", "me"]);
const RESERVED = RESERVED_HANDLES;

export function normalizeHandle(raw: string): string {
  const h = raw.normalize("NFKC").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(h)) throw new InvalidInput("Handle must be 3–20 letters, numbers or underscores");
  if (RESERVED.has(h)) throw new InvalidInput("That handle is reserved");
  return h;
}

export async function completeOnboarding(tx: Tx, caller: Caller, p: { handle: string; displayName: string; ageConfirmed: boolean; acceptedTerms: boolean; ipHash?: string }): Promise<void> {
  if (!p.ageConfirmed) throw new InvalidInput("You must confirm you are 18 or older");
  if (!p.acceptedTerms) throw new InvalidInput("You must accept the terms");
  const handle = normalizeHandle(p.handle);
  const displayName = p.displayName.normalize("NFKC").trim();
  if (displayName.length < 1 || displayName.length > 40) throw new InvalidInput("Display name must be 1–40 characters");
  let updated: { id: string }[];
  try {
    updated = await tx.update(users).set({ handle, displayName, ageConfirmedAt: sql`coalesce(${users.ageConfirmedAt}, now())` }).where(sql`${users.id} = ${caller.id} and ${users.handle} is null`).returning({ id: users.id });
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
