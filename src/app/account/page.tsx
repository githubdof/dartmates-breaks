import { requireCaller } from "@/auth/session";
import { db } from "@/db/client";
import { accountOf } from "@/domain/users/queries";
import { nameLocked } from "@/domain/users/commands";
import { Button } from "@/components/button";
import { AccountForm } from "./form";
import { signOutAction } from "./actions";

export const metadata = { title: "Your account" };

export default async function AccountPage() {
  // A half-set-up account goes to onboarding first (requireCaller), which can now finish it.
  const caller = await requireCaller("/account");
  const account = await db.transaction((tx) => accountOf(tx, caller.id));
  return (
    <main className="mx-auto max-w-[400px] space-y-8 px-4 py-6">
      <h1 className="font-condensed text-title font-semibold">Your account</h1>
      <AccountForm
        handle={account?.handle ?? ""}
        displayName={account?.displayName ?? ""}
        paymentName={account?.paymentName ?? ""}
        locked={account ? nameLocked(account.createdAt, new Date()) : false}
      />
      <form action={signOutAction}>
        <Button type="submit" variant="secondary" data-testid="sign-out">Sign out</Button>
      </form>
    </main>
  );
}
