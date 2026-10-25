"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/button";
import { deleteDraftAction } from "./actions";

/** Delete draft with an inline confirm (the ledger row's pattern). Success redirects to /host from the server. */
export function DeleteDraftButton({ breakId, title }: { breakId: string; title: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const remove = () => start(async () => {
    const r = await deleteDraftAction(breakId);
    setError(r.message);
  });

  if (!confirming) {
    return <Button variant="text" type="button" data-testid="delete-draft" aria-label={`Delete draft ${title}`} onClick={() => setConfirming(true)}>Delete draft</Button>;
  }
  return (
    <div role="group" aria-label={`Delete draft ${title}`} className="space-y-2 rounded-card border border-wire bg-card p-3">
      <p className="text-small">Delete this draft? Its prizes and photos go too. This can&apos;t be undone.</p>
      <div className="flex gap-3">
        <Button variant="secondary" type="button" data-testid="delete-draft-confirm" disabled={pending} onClick={remove}>Delete draft</Button>
        <Button variant="text" type="button" disabled={pending} onClick={() => { setConfirming(false); setError(null); }}>Keep</Button>
      </div>
      {error && <p role="alert" className="text-small text-red">{error}</p>}
    </div>
  );
}
