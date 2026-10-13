import { OnboardingForm } from "./form";
import { safeNext } from "@/lib/safe-next";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <OnboardingForm next={safeNext(next)} />;
}
