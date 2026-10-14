"use client";
import { usePathname } from "next/navigation";
import type { Role } from "@/domain/types";
import { NavLinks } from "./nav-links";
import { showTabBar } from "./nav";

/** Phones only; above 640 the same links sit in the header. Body padding comes from globals.css ([data-tab-bar]). */
export function TabBar({ role }: { role: Role | null }) {
  const path = usePathname() ?? "/";
  if (!showTabBar(path, role)) return null;
  return (
    <nav aria-label="Main" data-tab-bar className="fixed inset-x-0 bottom-0 z-20 border-t border-wire bg-card pb-safe sm:hidden">
      <NavLinks role={role} variant="tabs" />
    </nav>
  );
}
