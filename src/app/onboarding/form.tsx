"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { finishOnboarding } from "./actions";
import { Button } from "@/components/button";

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
        <div className="space-y-1">
          <label htmlFor="handle" className="block text-small font-semibold">Handle</label>
          <input id="handle" name="handle" required defaultValue={suggested} pattern="[A-Za-z0-9_]{3,20}" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby="handle-help" className={field} />
          <p id="handle-help" className="text-small text-ink-2">3 to 20 letters, numbers or underscores.</p>
        </div>
        {showName ? (
          <div className="space-y-1">
            <label htmlFor="displayName" className="block text-small font-semibold">Display name</label>
            <input id="displayName" name="displayName" maxLength={40} placeholder="Leave blank to use your handle" className={field} />
          </div>
        ) : (
          <Button variant="text" onClick={() => setShowName(true)}>Add a display name</Button>
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
