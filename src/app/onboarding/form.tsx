"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { finishOnboarding } from "./actions";
import { Button } from "@/components/button";
import { HandleField } from "@/components/handle-field";

type State = { error?: string } | null;
const field = "h-12 w-full rounded-input border border-wire-strong bg-card px-3";

export function OnboardingForm({ next, suggested, claiming }: { next: string; suggested: string; claiming: boolean }) {
  const [state, submit, pending] = useActionState<State, FormData>(finishOnboarding, null);
  const [showName, setShowName] = useState(!claiming);
  return (
    <main className="mx-auto max-w-[400px] px-4 py-6">
      <h1 className="font-condensed text-title font-semibold">Your handle</h1>
      <p className="mt-1 text-ink-2">Pick a handle. Hosts and buyers see this name.</p>
      <form action={submit} className="mt-4 space-y-4">
        <input type="hidden" name="next" value={next} />
        <HandleField defaultValue={suggested} />
        {showName ? (
          <>
            <div className="space-y-1">
              <label htmlFor="displayName" className="block text-small font-semibold">Display name</label>
              <input id="displayName" name="displayName" maxLength={40} placeholder="Leave blank to use your handle" className={field} />
            </div>
            <div className="space-y-1">
              <label htmlFor="paymentName" className="block text-small font-semibold">Name on your payments (optional)</label>
              <input id="paymentName" name="paymentName" maxLength={60} autoComplete="name" aria-describedby="payment-name-help" className={field} />
              <p id="payment-name-help" className="text-small text-ink-2">If your Venmo or PayPal shows another name, hosts can match your payment by it.</p>
            </div>
          </>
        ) : (
          <Button variant="text" onClick={() => setShowName(true)}>Add your name</Button>
        )}
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" name="ageConfirmed" required className="size-5 accent-[var(--ink)]" /> I am 18 or older
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" name="acceptedTerms" required className="size-5 accent-[var(--ink)]" />
          <span>I accept the <Link className="underline underline-offset-4" href="/legal/terms">terms</Link></span>
        </label>
        <Button type="submit" full disabled={pending} data-testid="onboarding-submit">{claiming ? "Continue to claim" : "Continue"}</Button>
        {state?.error && <p role="alert" className="text-small text-red">{state.error}</p>}
      </form>
    </main>
  );
}
