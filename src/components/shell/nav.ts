import type { Role } from "@/domain/types";

export type NavItem = { href: string; label: string; match: (path: string) => boolean };

/** Plan A destinations. Plan B adds "My lines" (/me) and points Browse at /breaks. */
export function navItems(role: Role | null): NavItem[] {
  const items: NavItem[] = [{ href: "/", label: "Browse", match: (p) => p === "/" || p.startsWith("/breaks") }];
  if (role === "host" || role === "admin") items.push({ href: "/host", label: "Host", match: (p) => p.startsWith("/host") });
  return items;
}

/**
 * The break page owns the bottom of the screen (claim bar), so the tab bar steps aside there. A bar with one
 * destination is worse than none, so it also hides below two items (the header still carries Host for hosts).
 */
export function showTabBar(path: string, role: Role | null): boolean {
  return !path.startsWith("/b/") && navItems(role).length >= 2;
}
