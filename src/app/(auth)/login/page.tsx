import { LoginForm } from "./form";
import { safeNext } from "@/lib/safe-next";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return <LoginForm next={safeNext(next)} linkError={error === "link"} />;
}
