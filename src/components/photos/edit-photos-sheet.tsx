"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { Sheet } from "@/components/sheet";
import { PhotoStrip, type PhotoStripProps } from "./photo-strip";

/**
 * The host's photo strip on an open or filled break. The strip mounts only while the sheet is open, so closing
 * unmounts it and flushes a pending Undo removal; that commit reports a change after the close, which refreshes too.
 */
export function EditPhotosSheet(p: Omit<PhotoStripProps, "canAdd" | "ensureDraft" | "onCount" | "onChange">) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // The button waits out a refresh, so a reopened strip never starts from the photos as they were before the close.
  const [refreshing, startRefresh] = useTransition();
  const isOpen = useRef(false);
  const changed = useRef(false);

  function close() {
    isOpen.current = false;
    setOpen(false);
    if (changed.current) { changed.current = false; startRefresh(() => router.refresh()); }
  }
  function onChange() {
    changed.current = true;
    // A removal flushed by the close commits after it: nothing else would refresh for it.
    if (!isOpen.current) { changed.current = false; startRefresh(() => router.refresh()); }
  }

  return (
    <>
      <Button variant="secondary" data-testid="edit-photos" disabled={refreshing} onClick={() => { isOpen.current = true; setOpen(true); }}>Edit photos</Button>
      <Sheet open={open} onClose={close} title="Edit photos">
        {open && <PhotoStrip {...p} canAdd onChange={onChange} />}
      </Sheet>
    </>
  );
}
