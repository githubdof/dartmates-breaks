"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { createServerSupabase } from "@/auth/supabase";
import { updateFlight, updateProfile } from "@/domain/users/commands";
import { updateHostKit } from "@/domain/breaks/commands";
import { parseAccount, parseFlight, parseKit, type AccountInput } from "./parse";

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

export type PickerState = { error?: string; saved?: boolean } | null;

/** "Your flight": a change applies everywhere at once (a flight is identity, not per break). */
export async function saveFlight(_: PickerState, form: FormData): Promise<PickerState> {
  const p = parseFlight(form);
  if (!p.ok) return { error: p.error };
  const r = await action((tx, caller) => updateFlight(tx, caller, p.input));
  if (!r.ok) return { error: r.message };
  revalidatePath("/account");
  return { saved: true };
}

/** "Your kit" (hosts): the surround every one of the host's boards wears. updateHostKit enforces host or admin. */
export async function saveKit(_: PickerState, form: FormData): Promise<PickerState> {
  const p = parseKit(form);
  if (!p.ok) return { error: p.error };
  const r = await action((tx, caller) => updateHostKit(tx, caller, p.input));
  if (!r.ok) return { error: r.message };
  revalidatePath("/account");
  revalidatePath("/host/new");
  return { saved: true };
}
