"use client";
import { startTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";

/** The app-wide fallback. Try again refetches the server props, then re-renders the segment. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  return (
    <main className="mx-auto max-w-[600px] space-y-4 px-4 py-10 sm:px-6">
      <h1 className="font-condensed text-title font-semibold">Something went wrong.</h1>
      <Button onClick={() => startTransition(() => { router.refresh(); reset(); })}>Try again</Button>
    </main>
  );
}
