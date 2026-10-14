import Link from "next/link";
import { exchange } from "./actions";
import { safeNext } from "@/lib/safe-next";
import { Button } from "@/components/button";

export default async function CallbackPage({ searchParams }: { searchParams: Promise<{ code?: string; token_hash?: string; type?: string; next?: string }> }) {
  const { code, token_hash, type, next } = await searchParams;
  const nextPath = safeNext(next);
  if (!code && !token_hash) {
    return (
      <main className="mx-auto max-w-[400px] px-4 py-6">
        <p>This sign-in link is incomplete. <Link href="/login" className="underline underline-offset-4">Ask for a new code</Link>.</p>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-[400px] px-4 py-6">
      <h1 className="font-condensed text-title font-semibold">You&apos;re almost in</h1>
      <form action={exchange} className="mt-4">
        {code && <input type="hidden" name="code" value={code} />}
        {token_hash && <input type="hidden" name="token_hash" value={token_hash} />}
        {type && <input type="hidden" name="type" value={type} />}
        <input type="hidden" name="next" value={nextPath} />
        <Button type="submit" full>Continue to Breaks</Button>
      </form>
    </main>
  );
}
