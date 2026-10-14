"use client";
import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { CopyField } from "@/components/copy-field";

/** Copies the share text; when the clipboard is blocked, shows the text in a selectable field instead. */
export function ShareButton({ value }: { value: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="mt-4 space-y-3">
      <CopyButton value={value} label="Share" copiedLabel="Copied" testId="share" onFail={() => setFailed(true)} />
      {failed && <CopyField label="Share text" value={value} />}
    </div>
  );
}
