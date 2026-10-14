"use client";
import { startTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";

/** A render or server failure on a break page. Try again refetches the server props, then re-renders the segment. */
export default function BreakError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  return (
    <main className="mx-auto max-w-[600px] space-y-4 px-4 py-10 sm:px-6">
      <h1 className="font-condensed text-title font-semibold">Something went wrong.</h1>
      <p className="text-ink-2">Check your connection, then try again.</p>
      <Button onClick={() => startTransition(() => { router.refresh(); reset(); })} data-testid="error-retry">Try again</Button>
    </main>
  );
}
