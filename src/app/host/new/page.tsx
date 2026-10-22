import { randomUUID } from "node:crypto";
import { requireCaller } from "@/auth/session";
import { db } from "@/db/client";
import Link from "next/link";
import { hostKit, hostPaymentHandles, lastBreakDefaults } from "@/domain/breaks/queries";
import { MAX_LINES } from "@/domain/breaks/rules";
import { MAX_PHOTOS } from "@/domain/photos/types";
import { ComposerForm } from "./form";
import { newComposerInitial } from "./initial";

export const metadata = { title: "New break" };

export default async function NewBreakPage() {
  const caller = await requireCaller("/host/new");
  if (caller.role !== "host" && caller.role !== "admin") {
    return <main className="mx-auto max-w-[600px] px-4 py-6"><p>Only hosts can list a break.</p></main>;
  }
  const { handles, defaults, kit } = await db.transaction(async (tx) => ({
    handles: await hostPaymentHandles(tx, caller.id),
    defaults: await lastBreakDefaults(tx, caller.id),
    kit: await hostKit(tx, caller.id),
  }));
  return (
    <main className="mx-auto max-w-[600px] px-4 py-6 sm:px-6">
      <h1 className="font-condensed text-title font-semibold">New break</h1>
      {/* A host who has not picked a kit shares the default until they do (§13); the kit is never tied to results. */}
      {!kit.chosen && (
        <p className="mt-2 text-small" data-testid="kit-nudge">
          Your boards wear the default kit, Blue with Yellow. <Link href="/account#kit" className="underline underline-offset-4">Choose a kit in your account.</Link>
        </p>
      )}
      <ComposerForm initial={newComposerInitial(defaults, handles, randomUUID)} maxLines={MAX_LINES} kit={kit.kit} maxPhotos={MAX_PHOTOS} />
    </main>
  );
}
