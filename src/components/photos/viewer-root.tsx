"use client";
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ViewerPhoto } from "./viewer-model";

// The viewer's code is a separate chunk, fetched on the first tap (or earlier on hover, focus or touch).
const loadViewer = () => import("./photo-viewer").then((m) => m.PhotoViewer);
const PhotoViewer = dynamic(loadViewer, { ssr: false });

type Ctx = { open(index: number, opener: HTMLElement): void; busy: boolean };
const ViewerContext = createContext<Ctx | null>(null);

type Opened = { index: number; opener: HTMLElement | null };

/** Holds which photo the viewer shows. Renders nothing of the viewer until a plate is tapped. */
export function ViewerRoot({ photos, children }: { photos: ViewerPhoto[]; children: React.ReactNode }) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [busy, setBusy] = useState(false);
  const open = useCallback((index: number, opener: HTMLElement) => {
    setBusy(true);
    loadViewer().then(() => { setOpened({ index, opener }); setBusy(false); }, () => setBusy(false));
  }, []);
  const ctx = useMemo(() => ({ open, busy }), [open, busy]);
  return (
    <ViewerContext.Provider value={ctx}>
      {children}
      {opened && (
        <PhotoViewer
          photos={photos} index={opened.index} opener={opened.opener}
          onIndex={(i) => setOpened((o) => (o ? { ...o, index: i } : o))}
          onClose={() => setOpened(null)}
        />
      )}
    </ViewerContext.Provider>
  );
}

/** A plate that opens the viewer at `index`. Outside a ViewerRoot it is a plain button. It adds no padding or border. */
export function ViewerButton({ index, name, testId, className, children }: {
  index: number; name: string; testId?: string; className?: string; children: React.ReactNode;
}) {
  const ctx = useContext(ViewerContext);
  const warm = () => { void loadViewer(); };
  return (
    <button
      type="button" aria-label={name} data-testid={testId} className={className}
      aria-busy={ctx?.busy || undefined}
      onPointerEnter={warm} onFocus={warm} onTouchStart={warm}
      onClick={(e) => ctx?.open(index, e.currentTarget)}
    >
      {children}
    </button>
  );
}
