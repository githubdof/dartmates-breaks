"use server";
import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabase } from "@/auth/supabase";
import { getCaller } from "@/auth/session";
import { safeNext } from "@/lib/safe-next";

export async function exchange(form: FormData) {
  const code = String(form.get("code") ?? "");
  const tokenHash = String(form.get("token_hash") ?? "");
  const rawType = String(form.get("type") ?? "");
  const type: EmailOtpType = rawType === "magiclink" || rawType === "signup" ? rawType : "email";
  const next = safeNext(form.get("next"));
  const supabase = await createServerSupabase();
  const { error } = tokenHash
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type }) // hashed-token link
    : await supabase.auth.exchangeCodeForSession(code); // PKCE link
  if (error) redirect("/login?error=link");
  const caller = await getCaller();
  if (!caller) redirect("/login?error=link");
  redirect(caller.onboarded ? next : `/onboarding?next=${encodeURIComponent(next)}`);
}
