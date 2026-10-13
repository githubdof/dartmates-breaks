"use client";
import { useState } from "react";

export function Share({ text }: { text: string }) {
  const [copied, setCopied] = useState<null | boolean>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false); // clipboard blocked: the text stays selectable in the box
    }
  }
  return (
    <div className="mt-3 rounded border p-3 text-sm">
      <div className="font-medium">Share</div>
      <textarea readOnly value={text} rows={3} onFocus={(e) => e.currentTarget.select()} className="mt-2 w-full rounded border p-2 text-xs" />
      <button onClick={copy} className="mt-2 rounded border px-3 py-1">
        {copied === true ? "Copied" : copied === false ? "Copy failed — select the text above" : "Copy"}
      </button>
    </div>
  );
}
