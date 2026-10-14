"use client";
import { useActionState } from "react";
import { Button } from "@/components/button";
import { saveAccount, type AccountState } from "./actions";

const field = "h-12 w-full rounded-input border border-wire-strong bg-card px-3 read-only:bg-wire-2";

type Props = { handle: string; displayName: string; paymentName: string; locked: boolean };

export function AccountForm({ handle, displayName, paymentName, locked }: Props) {
  const [state, submit, pending] = useActionState<AccountState, FormData>(saveAccount, null);
  return (
    <form action={submit} className="space-y-5">
      <div className="space-y-1">
        <p className="text-small font-semibold">Handle</p>
        <p className="font-semibold">@{handle}</p>
        <p className="text-small text-ink-2">Handles can&apos;t be changed.</p>
      </div>
      <div className="space-y-1">
        <label htmlFor="displayName" className="block text-small font-semibold">Display name</label>
        {/* Read-only (not disabled) when locked, so the form still sends the current name. */}
        <input id="displayName" name="displayName" required maxLength={40} readOnly={locked} defaultValue={state?.values?.displayName ?? displayName}
          aria-describedby={locked ? "display-name-help" : undefined} className={field} />
        {locked && <p id="display-name-help" className="text-small text-ink-2">Locked 30 days after sign-up.</p>}
      </div>
      <div className="space-y-1">
        <label htmlFor="paymentName" className="block text-small font-semibold">Name on your payments (optional)</label>
        <input id="paymentName" name="paymentName" maxLength={60} autoComplete="name" defaultValue={state?.values?.paymentName ?? paymentName}
          aria-describedby="payment-name-help" className={field} />
        <p id="payment-name-help" className="text-small text-ink-2">If your Venmo or PayPal shows another name, hosts can match your payment by it. Only hosts you buy from see it.</p>
      </div>
      <Button type="submit" disabled={pending} data-testid="account-save">Save changes</Button>
      <p role="status" className="text-small">{state?.saved ? "Saved." : ""}</p>
      {state?.error && <p role="alert" className="text-small text-red">{state.error}</p>}
    </form>
  );
}
