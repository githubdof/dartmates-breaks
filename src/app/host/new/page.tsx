import { requireCaller } from "@/auth/session";
import { db } from "@/db/client";
import { hostPaymentHandles, lastBreakDefaults } from "@/domain/breaks/queries";
import { MAX_LINES } from "@/domain/breaks/rules";
import { ComposerForm } from "./form";
import { newComposerInitial } from "./initial";

export const metadata = { title: "New break" };

export default async function NewBreakPage() {
  const caller = await requireCaller("/host/new");
  if (caller.role !== "host" && caller.role !== "admin") {
    return <main className="mx-auto max-w-[600px] px-4 py-6"><p>Only hosts can list a break.</p></main>;
  }
  const { handles, defaults } = await db.transaction(async (tx) => ({
    handles: await hostPaymentHandles(tx, caller.id),
    defaults: await lastBreakDefaults(tx, caller.id),
  }));
  return (
    <main className="mx-auto max-w-[600px] px-4 py-6 sm:px-6">
      <h1 className="font-condensed text-title font-semibold">New break</h1>
      <ComposerForm initial={newComposerInitial(defaults, handles)} maxLines={MAX_LINES} />
    </main>
  );
}
