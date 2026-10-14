"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { createServerSupabase } from "@/auth/supabase";
import { updateProfile } from "@/domain/users/commands";
import { parseAccount, type AccountInput } from "./parse";

export type AccountState = { error?: string; saved?: boolean; values?: AccountInput } | null;

function submitted(form: FormData): AccountInput {
  const text = (k: string) => { const v = form.get(k); return typeof v === "string" ? v : ""; };
  return { displayName: text("displayName"), paymentName: text("paymentName") };
}

export async function saveAccount(_: AccountState, form: FormData): Promise<AccountState> {
  const p = parseAccount(form);
  if (!p.ok) return { error: p.error, values: submitted(form) };
  const r = await action((tx, caller) => updateProfile(tx, caller, p.input));
  if (!r.ok) return { error: r.message, values: submitted(form) };
  revalidatePath("/account");
  return { saved: true };
}

export async function signOutAction() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/");
}
