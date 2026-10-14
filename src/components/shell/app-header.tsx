import Link from "next/link";
import type { Viewer } from "@/auth/viewer";
import { Avatar } from "@/components/avatar";
import { ButtonLink } from "@/components/button";
import { NavLinks } from "./nav-links";

export function AppHeader({ viewer }: { viewer: Pick<Viewer, "handle" | "displayName" | "role"> | null }) {
  return (
    <header className="sticky top-0 z-10 border-b border-wire bg-paper">
      <div className="mx-auto flex h-14 max-w-[960px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="font-condensed text-[22px] leading-none font-semibold text-ink">Breaks</Link>
        <nav aria-label="Main" className="hidden sm:block"><NavLinks role={viewer?.role ?? null} variant="header" /></nav>
        <div className="ml-auto">
          {viewer ? (
            <span className="inline-flex min-h-11 items-center">
              <Avatar name={viewer.displayName ?? viewer.handle} />
              <span className="sr-only">Signed in as {viewer.handle ? `@${viewer.handle}` : "a new account"}</span>
            </span>
          ) : (
            <ButtonLink href="/login" variant="text">Sign in</ButtonLink>
          )}
        </div>
      </div>
    </header>
  );
}
