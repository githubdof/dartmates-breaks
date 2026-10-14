import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { createServerSupabase } from "./supabase";
import { db, type Tx } from "@/db/client";
import { users } from "@/db/schema";
import { env } from "@/lib/env";
import { appendEvent } from "@/domain/events";
import type { Caller } from "@/domain/types";

type UserRow = Pick<typeof users.$inferSelect, "id" | "role" | "handle" | "displayName" | "ageConfirmedAt" | "bannedAt">;
/** What syncUser returns: the caller fields plus the email, so the shell needs no second query. */
export type SessionUser = UserRow & { email: string };

export function toCaller(u: UserRow): Caller {
  return { id: u.id, role: u.role as Caller["role"], onboarded: !!(u.handle && u.displayName && u.ageConfirmedAt), banned: u.bannedAt !== null };
}

/** Admin only when the email is listed AND confirmed (an unconfirmed address proves nothing). */
export function shouldPromote(email: string, emailConfirmedAt: string | null | undefined, adminEmails: string): boolean {
  if (!emailConfirmedAt || !email) return false;
  const admins = adminEmails.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}

/** Upsert the signed-in user; a promotion to admin also appends `user.role_changed`. */
export async function syncUser(tx: Tx, id: string, email: string, promote: boolean): Promise<SessionUser> {
  // A promotion needs the previous role: ensure the row exists, then lock it so concurrent
  // sign-ins record exactly one role change.
  let prev: { role: string } | undefined;
  if (promote) {
    await tx.insert(users).values({ id, email }).onConflictDoNothing({ target: users.id });
    [prev] = await tx.select({ role: users.role }).from(users).where(sql`${users.id} = ${id}`).for("update");
  }
  const set = promote ? { role: "admin" } : {};
  const [row] = await tx.insert(users).values({ id, email, ...set })
    .onConflictDoUpdate({ target: users.id, set: { email, lastSeenAt: sql`now()`, ...set } })
    .returning({ id: users.id, email: users.email, role: users.role, handle: users.handle, displayName: users.displayName, ageConfirmedAt: users.ageConfirmedAt, bannedAt: users.bannedAt });
  if (prev && prev.role !== "admin") {
    await appendEvent(tx, { actorId: id, type: "user.role_changed", payload: { from: prev.role, to: "admin", reason: "admin_emails" } });
  }
  return row;
}

/** The signed-in user's row, upserted once per request (React cache). Null when signed out. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { id } = data.user;
  const email = data.user.email ?? "";
  const promote = shouldPromote(email, data.user.email_confirmed_at, env().ADMIN_EMAILS);
  return db.transaction((tx) => syncUser(tx, id, email, promote));
});

export const getCaller = cache(async (): Promise<Caller | null> => {
  const u = await getSessionUser();
  return u ? toCaller(u) : null;
});

export async function requireCaller(next = "/"): Promise<Caller> {
  const c = await getCaller();
  if (!c) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!c.onboarded) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  return c;
}
