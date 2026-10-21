import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { requireCaller } from "@/auth/session";
import { db } from "@/db/client";
import { draftForEdit, hostKit, hostPaymentHandles } from "@/domain/breaks/queries";
import { isHostView } from "@/domain/breaks/grid";
import { MAX_LINES } from "@/domain/breaks/rules";
import { isUuid } from "@/lib/is-uuid";
import { ComposerForm } from "../../new/form";
import { draftComposerInitial } from "../../new/initial";

export const metadata = { title: "Edit draft" };

export default async function EditDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const caller = await requireCaller(`/host/${id}/edit`);
  const data = await db.transaction(async (tx) => {
    const draft = await draftForEdit(tx, id);
    if (!draft || !isHostView(draft.hostId, caller)) return null;
    // The draft's host's handles, never the caller's: an admin's edit must not send blank handles (updateDraft ignores them for non-hosts anyway).
    // The draft's host's kit too: the preview shows the board in the kit it opens in (recorded ruling 32).
    return { draft, handles: await hostPaymentHandles(tx, draft.hostId), kit: (await hostKit(tx, draft.hostId)).kit };
  });
  // Drafts are private: anyone but the host (or an admin) gets the same 404 as a missing break.
  if (!data) notFound();
  if (data.draft.status !== "draft") redirect(`/b/${id}`);
  return (
    <main className="mx-auto max-w-[600px] px-4 py-6 sm:px-6">
      <h1 className="font-condensed text-title font-semibold">Edit draft</h1>
      <ComposerForm initial={draftComposerInitial(data.draft, data.handles, randomUUID)} maxLines={MAX_LINES} kit={data.kit} />
    </main>
  );
}
