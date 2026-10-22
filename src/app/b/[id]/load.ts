import "server-only";
import { cache } from "react";
import { db } from "@/db/client";
import { getCaller } from "@/auth/session";
import { readBreakView, type BreakView } from "@/domain/breaks/page-view";
import { breakPhotos, type BreakPhotos } from "@/domain/photos/queries";
import type { Caller } from "@/domain/types";

/**
 * One transaction per request for the break page; React cache shares it between generateMetadata and the page.
 * `photos` is the host's read (Task 8a widens it to every viewer); everyone else gets null.
 */
export const loadBreak = cache(async (breakId: string): Promise<{ view: BreakView | null; caller: Caller | null; now: Date; photos: BreakPhotos | null }> => {
  const caller = await getCaller();
  const now = new Date();
  return db.transaction(async (tx) => {
    const view = await readBreakView(tx, breakId, caller ? { id: caller.id, role: caller.role } : null, now);
    const photos = view && caller && caller.id === view.page.break.hostId
      ? await breakPhotos(tx, breakId, { id: caller.id, isHost: true, isHolder: false, isAdmin: caller.role === "admin" })
      : null;
    return { view, caller, now, photos };
  });
});
