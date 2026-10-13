"use server";
import { z } from "zod";
import { createServerSupabase } from "@/auth/supabase";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";

const emailSchema = z.object({ email: z.string().email() });
export async function sendMagicLink(_: unknown, form: FormData) {
  const parsed = emailSchema.safeParse({ email: form.get("email") });
  if (!parsed.success) return { error: "Enter a valid email" };
  const next = safeNext(form.get("next"));
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({ email: parsed.data.email, options: { emailRedirectTo: `${env().APP_URL}/auth/callback?next=${encodeURIComponent(next)}` } });
  return error ? { error: error.message } : { sent: true, email: parsed.data.email };
}

const otpSchema = z.object({ email: z.string().email(), token: z.string().regex(/^\d{6}$/) });
export async function verifyOtp(_: unknown, form: FormData) {
  const parsed = otpSchema.safeParse({ email: form.get("email"), token: form.get("token") });
  if (!parsed.success) return { error: "Enter the 6-digit code" };
  const next = safeNext(form.get("next"));
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.token, type: "email" });
  if (error) return { error: "That code didn't work" };
  return { redirect: next };
}
