import "server-only";
import { cache } from "react";
import { db } from "@/db/client";
import { getCaller } from "@/auth/session";
import { readBreakView, type BreakView } from "@/domain/breaks/page-view";
import { breakPhotos, type BreakPhotos } from "@/domain/photos/queries";
import type { Caller } from "@/domain/types";
import { photoViewer } from "@/photos/viewer";

/**
 * One transaction per request for the break page; React cache shares it between generateMetadata and the page.
 * `photos` is read for every viewer of a visible break, as that viewer may see it (null only when there is no view).
 */
export const loadBreak = cache(async (breakId: string): Promise<{ view: BreakView | null; caller: Caller | null; now: Date; photos: BreakPhotos | null }> => {
  const caller = await getCaller();
  const now = new Date();
  return db.transaction(async (tx) => {
    const view = await readBreakView(tx, breakId, caller ? { id: caller.id, role: caller.role } : null, now);
    const viewer = view
      ? photoViewer(caller, { hostId: view.page.break.hostId, holderIds: new Set(view.page.lines.flatMap((l) => (l.ownerId ? [l.ownerId] : []))) })
      : null;
    const photos = view ? await breakPhotos(tx, breakId, viewer) : null;
    return { view, caller, now, photos };
  });
});
