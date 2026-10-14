"use server";
import { z } from "zod";
import { createServerSupabase } from "@/auth/supabase";
import { getCaller } from "@/auth/session";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";
import { sendErrorMessage } from "./messages";

const emailSchema = z.object({ email: z.string().email() });
export async function sendMagicLink(_: unknown, form: FormData) {
  const parsed = emailSchema.safeParse({ email: form.get("email") });
  if (!parsed.success) return { error: "Check the email address." };
  const next = safeNext(form.get("next"));
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({ email: parsed.data.email, options: { emailRedirectTo: `${env().APP_URL}/auth/callback?next=${encodeURIComponent(next)}` } });
  if (error) console.error("sign-in email failed", error.status, error.code);
  const message = sendErrorMessage(error ? { status: error.status, code: error.code } : null);
  return message ? { error: message } : { sent: true, email: parsed.data.email };
}

const otpSchema = z.object({ email: z.string().email(), token: z.string().regex(/^\d{6}$/) });
export async function verifyOtp(_: unknown, form: FormData) {
  const parsed = otpSchema.safeParse({ email: form.get("email"), token: form.get("token") });
  if (!parsed.success) return { error: "Type the 6-digit code from the email." };
  const next = safeNext(form.get("next"));
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.token, type: "email" });
  if (error) return { error: "That code didn't work. Check it, or ask for a new one." };
  // Same rule as the link flow (auth/callback): new accounts set up first, keeping `next` (and any ?pick=).
  const caller = await getCaller();
  if (caller && !caller.onboarded) return { redirect: `/onboarding?next=${encodeURIComponent(next)}` };
  return { redirect: next };
}
