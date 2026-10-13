import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { createServerSupabase } from "./supabase";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { env } from "@/lib/env";
import type { Caller } from "@/domain/types";

type UserRow = Pick<typeof users.$inferSelect, "id" | "role" | "handle" | "displayName" | "ageConfirmedAt" | "bannedAt">;

export function toCaller(u: UserRow): Caller {
  return { id: u.id, role: u.role as Caller["role"], onboarded: !!(u.handle && u.displayName && u.ageConfirmedAt), banned: u.bannedAt !== null };
}

/** Admin only when the email is listed AND confirmed (an unconfirmed address proves nothing). */
export function shouldPromote(email: string, emailConfirmedAt: string | null | undefined, adminEmails: string): boolean {
  if (!emailConfirmedAt || !email) return false;
  const admins = adminEmails.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}

export const getCaller = cache(async (): Promise<Caller | null> => {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const email = data.user.email ?? "";
  const promote = shouldPromote(email, data.user.email_confirmed_at, env().ADMIN_EMAILS) ? { role: "admin" } : {};
  const [row] = await db.insert(users).values({ id: data.user.id, email, ...promote })
    .onConflictDoUpdate({ target: users.id, set: { email, lastSeenAt: sql`now()`, ...promote } })
    .returning({ id: users.id, role: users.role, handle: users.handle, displayName: users.displayName, ageConfirmedAt: users.ageConfirmedAt, bannedAt: users.bannedAt });
  return toCaller(row);
});

export async function requireCaller(next = "/"): Promise<Caller> {
  const c = await getCaller();
  if (!c) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!c.onboarded) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  return c;
}
