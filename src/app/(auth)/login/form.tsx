"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { sendMagicLink, verifyOtp } from "./actions";

type SendState = { error?: string; sent?: boolean; email?: string } | null;
type VerifyState = { error?: string; redirect?: string } | null;

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [sent, send, sending] = useActionState<SendState, FormData>(sendMagicLink, null);
  const [verified, verify, verifying] = useActionState<VerifyState, FormData>(verifyOtp, null);
  useEffect(() => { if (verified?.redirect) { router.replace(verified.redirect); router.refresh(); } }, [verified, router]);

  return (
    <main className="mx-auto max-w-sm p-4">
      <h1 className="text-xl font-semibold">Sign in</h1>
      {!sent?.sent ? (
        <form action={send} className="mt-4 space-y-3">
          <input type="hidden" name="next" value={next} />
          <input name="email" type="email" required placeholder="you@example.com" className="w-full rounded border p-3" />
          <button disabled={sending} className="w-full rounded bg-black p-3 text-white">Email me a sign-in link</button>
          {sent?.error && <p className="text-sm text-red-600">{sent.error}</p>}
        </form>
      ) : (
        <form action={verify} className="mt-4 space-y-3">
          <p className="text-sm">We sent a link and a 6-digit code to <b>{sent.email}</b>. Tap the link, or enter the code here.</p>
          <input type="hidden" name="email" value={sent.email} />
          <input type="hidden" name="next" value={next} />
          <input name="token" inputMode="numeric" pattern="\d{6}" required placeholder="123456" className="w-full rounded border p-3 text-center text-2xl tracking-widest" />
          <button disabled={verifying} className="w-full rounded bg-black p-3 text-white">Continue</button>
          {verified?.error && <p className="text-sm text-red-600">{verified.error}</p>}
        </form>
      )}
    </main>
  );
}
