"use client";
import { useState } from "react";
import { Button } from "@/components/button";
import { LedgerSheet, type LedgerSheetProps } from "./ledger-sheet";

/** Page-level button under the legend (the global header cannot know the break). */
export function HostTools(props: Omit<LedgerSheetProps, "open" | "onClose">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} data-testid="host-tools">Host tools</Button>
      <LedgerSheet {...props} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
