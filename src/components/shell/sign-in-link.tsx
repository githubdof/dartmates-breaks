"use client";
import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/button";
import { signInHref } from "./nav";

/** The header's Sign in: brings the viewer back to this page afterwards (`?next=`, checked by safeNext on the server). */
export function SignInLink() {
  return <ButtonLink href={signInHref(usePathname())} variant="text">Sign in</ButtonLink>;
}
