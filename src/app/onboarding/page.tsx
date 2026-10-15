import { redirect } from "next/navigation";
import { OnboardingForm } from "./form";
import { afterSignIn, safeNext } from "@/lib/safe-next";
import { getCaller } from "@/auth/session";
import { getSessionViewer } from "@/auth/viewer";
import { fromClaim, suggestHandle } from "@/domain/users/suggest-handle";

export const metadata = { title: "Your handle" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const nextPath = safeNext(next);
  const viewer = await getSessionViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  // "Already set up" means onboarded (handle, display name and age), the same test the break page uses to send
  // people here; testing the handle alone would loop a half-set-up account between the two pages.
  const caller = await getCaller();
  if (caller?.onboarded) redirect(afterSignIn(nextPath));
  return <OnboardingForm next={nextPath} suggested={suggestHandle(viewer.email)} claiming={fromClaim(nextPath)} />;
}
