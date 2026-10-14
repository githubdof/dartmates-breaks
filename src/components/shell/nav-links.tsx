"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/domain/types";
import { navItems } from "./nav";

export function NavLinks({ role, variant }: { role: Role | null; variant: "header" | "tabs" }) {
  const path = usePathname() ?? "/";
  const items = navItems(role);
  return (
    <ul className={variant === "tabs" ? "flex h-14" : "flex gap-2"}>
      {items.map((it) => {
        const active = it.match(path);
        const tone = active ? "text-ink underline decoration-2 underline-offset-8" : "text-ink-2";
        return (
          <li key={it.href} className={variant === "tabs" ? "flex-1" : undefined}>
            <Link href={it.href} aria-current={active ? "page" : undefined}
              className={variant === "tabs" ? `flex h-full items-center justify-center text-small font-semibold ${tone}` : `inline-flex min-h-11 items-center px-2 text-small font-semibold ${tone}`}>
              {it.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
