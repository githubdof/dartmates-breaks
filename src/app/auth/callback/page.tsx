import Link from "next/link";
import { exchange } from "./actions";
import { safeNext } from "@/lib/safe-next";

export default async function CallbackPage({ searchParams }: { searchParams: Promise<{ code?: string; token_hash?: string; type?: string; next?: string }> }) {
  const { code, token_hash, type, next } = await searchParams;
  const nextPath = safeNext(next);
  if (!code && !token_hash) {
    return <main className="mx-auto max-w-sm p-4 text-sm">This sign-in link is incomplete. <Link href="/login" className="underline">Request a new one</Link>.</main>;
  }
  return (
    <main className="mx-auto max-w-sm p-4">
      <h1 className="text-xl font-semibold">You&apos;re almost in</h1>
      <form action={exchange} className="mt-4">
        {code && <input type="hidden" name="code" value={code} />}
        {token_hash && <input type="hidden" name="token_hash" value={token_hash} />}
        {type && <input type="hidden" name="type" value={type} />}
        <input type="hidden" name="next" value={nextPath} />
        <button className="w-full rounded bg-black p-3 text-white">Continue to Breaks</button>
      </form>
    </main>
  );
}
