import "server-only";
import { cache } from "react";
import { getSessionUser, type SessionUser } from "./session";
import type { Role } from "@/domain/types";

export type Viewer = { id: string; handle: string | null; displayName: string | null; role: Role; email: string };

export function toViewer(u: SessionUser): Viewer {
  return { id: u.id, handle: u.handle, displayName: u.displayName, role: u.role as Role, email: u.email };
}

/** Per-request viewer for the shell and onboarding: built from the row getCaller already upserted. */
export const getSessionViewer = cache(async (): Promise<Viewer | null> => {
  const u = await getSessionUser();
  return u ? toViewer(u) : null;
});
