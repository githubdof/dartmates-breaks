import { eq } from "drizzle-orm";
import { requireCaller } from "@/auth/session";
import { db } from "@/db/client";
import { hostProfiles } from "@/db/schema";
import { ComposerForm } from "./form";

export default async function NewBreakPage() {
  const caller = await requireCaller("/host/new");
  if (caller.role !== "host" && caller.role !== "admin") return <main className="p-4">Only hosts can list a break.</main>;
  const [profile] = await db.select({ paymentHandles: hostProfiles.paymentHandles }).from(hostProfiles).where(eq(hostProfiles.userId, caller.id));
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-semibold">New break</h1>
      <ComposerForm handles={profile?.paymentHandles ?? {}} />
    </main>
  );
}
