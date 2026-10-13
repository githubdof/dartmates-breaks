"use client";
import { useActionState } from "react";
import { finishOnboarding } from "./actions";

type State = { error?: string } | null;

export function OnboardingForm({ next }: { next: string }) {
  const [state, submit, pending] = useActionState<State, FormData>(finishOnboarding, null);
  return (
    <main className="mx-auto max-w-sm p-4">
      <h1 className="text-xl font-semibold">Set up your account</h1>
      <form action={submit} className="mt-4 space-y-3">
        <input type="hidden" name="next" value={next} />
        <label className="block text-sm">Handle<input name="handle" required pattern="[A-Za-z0-9_]{3,20}" className="mt-1 w-full rounded border p-3" placeholder="jim_r" /></label>
        <label className="block text-sm">Name people know you by<input name="displayName" required maxLength={40} className="mt-1 w-full rounded border p-3" placeholder="Jim Roberts" /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ageConfirmed" required /> I am 18 or older</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="acceptedTerms" required /> I accept the <a className="underline" href="/legal/terms">terms</a></label>
        <button disabled={pending} className="w-full rounded bg-black p-3 text-white">Continue</button>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      </form>
    </main>
  );
}
