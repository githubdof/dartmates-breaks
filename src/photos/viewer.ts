import type { Caller } from "@/domain/types";
import type { PhotoAudience } from "./page-photos";

export type PhotoViewer = { id: string; isHost: boolean; isHolder: boolean; isAdmin: boolean };

/** The distinct holders in a list of line owners (unowned lines drop out): the `holderIds` that `photoViewer` takes. */
export function holderSet(ownerIds: Iterable<string | null | undefined>): Set<string> {
  const out = new Set<string>();
  for (const id of ownerIds) if (id) out.add(id);
  return out;
}

/** Who is looking, for `breakPhotos`: null when anonymous. Shared by the break page and the result page. */
export function photoViewer(caller: Caller | null, ctx: { hostId: string; holderIds: ReadonlySet<string> }): PhotoViewer | null {
  if (!caller) return null;
  return { id: caller.id, isHost: caller.id === ctx.hostId, isHolder: ctx.holderIds.has(caller.id), isAdmin: caller.role === "admin" };
}

/** What `pagePhotos` may show: the host first, then holders, everyone else (admins included) the public view. */
export function photoAudience(v: PhotoViewer | null): PhotoAudience {
  if (v?.isHost) return "host";
  return v?.isHolder ? "holder" : "other";
}
