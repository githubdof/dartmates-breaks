import Link from "next/link";
import type { Viewer } from "@/auth/viewer";
import { Avatar } from "@/components/avatar";
import { NavLinks } from "./nav-links";
import { showHeaderNav } from "./nav";
import { SignInLink } from "./sign-in-link";

export function AppHeader({ viewer }: { viewer: Pick<Viewer, "handle" | "displayName" | "role"> | null }) {
  const role = viewer?.role ?? null;
  return (
    <header className="sticky top-0 z-10 border-b border-wire bg-paper">
      <div className="mx-auto flex h-14 max-w-[960px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="inline-flex min-h-11 items-center font-condensed text-[22px] leading-none font-semibold text-ink">Breaks</Link>
        {showHeaderNav(role) && <nav aria-label="Main" className="hidden sm:block"><NavLinks role={role} variant="header" /></nav>}
        <div className="ml-auto">
          {viewer ? (
            <Link href="/account" data-testid="account-link" className="inline-flex min-h-11 min-w-11 items-center justify-center">
              <Avatar name={viewer.displayName ?? viewer.handle} />
              <span className="sr-only">Your account, signed in as {viewer.handle ? `@${viewer.handle}` : "a new account"}</span>
            </Link>
          ) : (
            <SignInLink />
          )}
        </div>
      </div>
    </header>
  );
}
