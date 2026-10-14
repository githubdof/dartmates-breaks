"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { sendMagicLink, verifyOtp } from "./actions";
import { Button } from "@/components/button";
import { Banner } from "@/components/banner";
import { codeHelp } from "./messages";

type SendState = { error?: string; sent?: boolean; email?: string } | null;
type VerifyState = { error?: string; redirect?: string } | null;

const field = "h-12 w-full rounded-input border border-wire-strong bg-card px-3";

export function LoginForm({ next, linkError }: { next: string; linkError?: boolean }) {
  const router = useRouter();
  const [sent, send, sending] = useActionState<SendState, FormData>(sendMagicLink, null);
  const [verified, verify, verifying] = useActionState<VerifyState, FormData>(verifyOtp, null);
  useEffect(() => { if (verified?.redirect) { router.replace(verified.redirect); router.refresh(); } }, [verified, router]);

  return (
    <main className="mx-auto max-w-[400px] px-4 py-6">
      <h1 className="font-condensed text-title font-semibold">Sign in</h1>
      {linkError && <div className="mt-3"><Banner tone="error" role="alert">That link expired or opened in another browser. Ask for a new code below.</Banner></div>}
      {!sent?.sent ? (
        <form key="send" action={send} className="mt-4 space-y-3">
          <p className="text-ink-2">Type your email. We&apos;ll send you a 6-digit code.</p>
          <input type="hidden" name="next" value={next} />
          <label htmlFor="email" className="block text-small font-semibold">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" className={field} />
          <Button type="submit" full disabled={sending} data-testid="login-send">{sending ? "Sending" : "Email me a code"}</Button>
          {sent?.error && <p role="alert" className="text-small text-red">{sent.error}</p>}
        </form>
      ) : (
        <form key="verify" action={verify} className="mt-4 space-y-3">
          <p>{codeHelp(sent.email ?? "your address")}</p>
          <input type="hidden" name="email" value={sent.email} />
          <input type="hidden" name="next" value={next} />
          <label htmlFor="token" className="block text-small font-semibold">Code</label>
          <input id="token" name="token" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required className={`${field} text-center font-condensed text-[28px] tracking-[0.3em]`} />
          <Button type="submit" full disabled={verifying} data-testid="login-verify">Continue</Button>
          {verified?.error && <p role="alert" className="text-small text-red">{verified.error}</p>}
          <p className="text-small text-ink-2">The email also has a link. If it opens in another browser, come back here and type the code.</p>
          <Button variant="text" onClick={() => window.location.assign(`/login?next=${encodeURIComponent(next)}`)}>Use a different email</Button>
        </form>
      )}
    </main>
  );
}
