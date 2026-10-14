"use client";
import { useActionState } from "react";
import { createAndOpen, type ComposerState } from "./actions";

export function ComposerForm({ handles }: { handles: { venmo?: string; paypal?: string } }) {
  const [state, submit, pending] = useActionState<ComposerState, FormData>(createAndOpen, null);
  const field = "mt-1 w-full rounded border p-3";
  return (
    <form action={submit} className="mt-4 space-y-3">
      <label className="block text-sm">Title<input name="title" required className={field} placeholder="Target Phil Taylor Chronos" /></label>
      <label className="block text-sm">Items (one per line; several = winner picks one)<textarea name="items" required rows={3} className={field} placeholder={"Chronos 22g steel\nChronos 18g soft"} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">Lines<input name="lineCount" type="number" min={2} max={50} required defaultValue={12} className={field} /></label>
        <label className="block text-sm">$ per line<input name="linePrice" type="number" min={1} step="0.01" required defaultValue={20} className={field} /></label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">Venmo handle<input name="venmo" defaultValue={handles.venmo ?? ""} className={field} placeholder="@Jim-Roberts-36" /></label>
        <label className="block text-sm">PayPal.me name<input name="paypal" defaultValue={handles.paypal ?? ""} className={field} placeholder="JamesRoberts603182" /></label>
      </div>
      <label className="block text-sm">Payment instructions (blank = built from your handles)<textarea name="paymentInstructions" rows={2} className={field} placeholder={"Venmo @Jim-Roberts-36\nNo notes on payments"} /></label>
      <label className="block text-sm">Hours to pay after claiming<input name="paymentWindowHours" type="number" min={1} defaultValue={24} className={field} /></label>
      <label className="block text-sm">Max lines per person (blank = no limit)<input name="maxLinesPerUser" type="number" min={1} className={field} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allowRandomClaims" defaultChecked /> Allow &quot;give me N random lines&quot;</label>
      <label className="block text-sm">Description<textarea name="description" rows={3} className={field} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="openNow" defaultChecked /> Open for claims now</label>
      <button data-testid="composer-open" disabled={pending} className="w-full rounded bg-black p-3 text-white">{pending ? "Saving…" : "Post break"}</button>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
