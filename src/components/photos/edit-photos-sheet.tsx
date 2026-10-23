"use client";
import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { Sheet } from "@/components/sheet";
import type { PhotoStripProps } from "./photo-strip";

// The strip (upload, shrink and removal-queue code) is host-only and mounts on the first open, so it loads then,
// not with the break page every visitor downloads (the first-load budget, `pnpm budget`).
const PhotoStrip = dynamic(() => import("./photo-strip").then((m) => m.PhotoStrip), { ssr: false });

/**
 * The host's photo strip on an open or filled break. The strip mounts on the first open and stays mounted: it hides
 * with the dialog, so an upload started before a close keeps running and the strip stays the source of truth.
 * Closing tells it to commit a removal still waiting on Undo. The page refreshes (so the break page's own photo
 * data follows the host's edits) once something changed: on close, or later if the change lands behind a closed sheet.
 */
export function EditPhotosSheet(p: Omit<PhotoStripProps, "canAdd" | "ensureDraft" | "onCount" | "onChange" | "flushToken">) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [closes, setCloses] = useState(0);
  const isOpen = useRef(false);
  const changed = useRef(false);

  function refresh() { changed.current = false; router.refresh(); }
  function show() { isOpen.current = true; setMounted(true); setOpen(true); }
  function close() {
    isOpen.current = false;
    setOpen(false);
    setCloses((n) => n + 1);
    if (changed.current) refresh();
  }
  function onChange() {
    changed.current = true;
    if (!isOpen.current) refresh();
  }

  return (
    <>
      <Button variant="secondary" data-testid="edit-photos" onClick={show}>Edit photos</Button>
      <Sheet open={open} onClose={close} title="Edit photos">
        {mounted && <PhotoStrip {...p} canAdd onChange={onChange} flushToken={closes} />}
      </Sheet>
    </>
  );
}
