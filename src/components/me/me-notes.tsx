"use client";
import { createContext, useCallback, useState, type ReactNode } from "react";

/** Sets the page-level note on /me. Null outside MeNotes. */
export const MeNoteContext = createContext<((text: string) => void) | null>(null);

/**
 * A `role="status"` line above the /me lists for a confirmation whose card is about to go: a give-back of every line in a
 * break removes its card on the refresh, so the card hands its note up here. It lasts until the next navigation.
 */
export function MeNotes({ children }: { children: ReactNode }) {
  const [note, setNote] = useState({ text: "", n: 0 });
  const say = useCallback((text: string) => setNote((s) => ({ text, n: s.n + 1 })), []);
  return (
    <MeNoteContext.Provider value={say}>
      {/* Kept in the accessibility tree while empty (sr-only, out of the flow) so the first note is announced. */}
      <p role="status" className={note.text ? "text-small" : "sr-only"} data-testid="me-note"><span key={note.n}>{note.text}</span></p>
      {children}
    </MeNoteContext.Provider>
  );
}
