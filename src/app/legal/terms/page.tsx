import { TERMS_VERSION } from "@/domain/users/commands";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-prose p-4">
      <h1 className="text-xl font-semibold">Terms of service</h1>
      <p className="mt-1 text-xs text-gray-500">Version {TERMS_VERSION} (placeholder)</p>
      <p className="mt-4 text-sm">
        Hosts are solely responsible for their breaks. Payment happens outside the platform, at your own risk. The platform records ledger and
        allocation results permanently. You must be 18 or older to use it. Final terms, reviewed by counsel, will replace this text before public launch.
      </p>
    </main>
  );
}
