"use client";
import { useState } from "react";
import { Sheet } from "@/components/sheet";
import { Stepper } from "@/components/stepper";
import { CopyButton } from "@/components/copy-button";
import { CopyField } from "@/components/copy-field";
import { SegmentedControl } from "@/components/segmented-control";
import { FilterChips } from "@/components/filter-chips";
import { Toast } from "@/components/toast";
import { Button } from "@/components/button";
import { StickyBar } from "@/components/sticky-bar";

export function Demo() {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [n, setN] = useState(1);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [filter, setFilter] = useState<"all" | "sent" | "unpaid" | "overdue">("all");
  const [toast, setToast] = useState<string | null>(null);
  return (
    <section className="space-y-4">
      <h2 className="text-headline font-semibold">Interactive</h2>
      <SegmentedControl label="Show lines as" value={view} onChange={setView} options={[{ value: "grid", label: "Grid" }, { value: "list", label: "List" }]} />
      <FilterChips label="Filter" value={filter} onChange={setFilter} options={[{ value: "all", label: "All", count: 12 }, { value: "sent", label: "Sent", count: 3 }, { value: "unpaid", label: "Unpaid", count: 5 }, { value: "overdue", label: "Overdue", count: 1 }]} />
      <Stepper label="Number of lines" value={n} min={1} max={5} onChange={setN} />
      <CopyButton value="@Jim-Roberts-36" label="Copy handle" />
      <CopyField label="Commitment" value={"ab".repeat(32)} />
      <div className="flex gap-2">
        <Button onClick={() => setOpen(true)}>Bottom sheet</Button>
        <Button variant="secondary" onClick={() => setFull(true)}>Full sheet</Button>
        <Button variant="text" onClick={() => setToast("Marked @dave paid (3 lines, $15).")}>Toast</Button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Pay for your lines">
        <p>Sheet content. Escape, the backdrop and Close all close it.</p>
        <input className="mt-3 h-11 w-full rounded-input border border-wire-strong px-3" placeholder="Focus me: the bar hides" />
      </Sheet>
      <Sheet full open={full} onClose={() => setFull(false)} title="Host tools"><p>Full-screen sheet.</p></Sheet>
      <Toast message={toast} action="Undo" onAction={() => setToast(null)} />
      <StickyBar><p className="flex-1 text-small">Lines 7, 12, $10</p><Stepper label="Lines in the bar" value={n} min={1} max={5} onChange={setN} /><Button>Claim 2 lines</Button></StickyBar>
    </section>
  );
}
