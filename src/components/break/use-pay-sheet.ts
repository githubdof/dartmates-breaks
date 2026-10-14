"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sent } from "@/app/b/[id]/actions";
import { canRefresh, NETWORK_NOTE, OFFLINE_NOTE } from "@/lib/network-note";

/** What the viewer owes for unsent lines. The deadline travels as ISO plus the server's fallback text (LocalTime). */
export type Owe = {
  numbers: number[]; cents: number; payByIso: string | null; payByFallback: string | null; late: boolean;
  /** Bonus lines a give-back of every owed line would take with it (recorded ruling 6); the give-back confirm names them. */
  bonusLost?: number[];
};
export type SheetError = { for: "sent" | "retry"; text: string };

type Options = {
  breakId: string;
  /** What the server says is owed; a provisional owe (set after a claim) stands in until fresh props arrive. */
  owe: Owe | null;
  /** A failure while the sheet is closed shows on the page through this. */
  onNote?: (text: string) => void;
  /** Every failure, wherever it shows, as it happens (before any re-render): /me keeps it in case the card leaves. */
  onFail?: (forWhat: SheetError["for"], text: string) => void;
  /** The polite live region. */
  say?: (text: string) => void;
  onSentOk?: () => void;
  onClosed?: () => void;
};

/** The pay sheet's state, shared by the break page and /me: open and close, its error, the provisional owe, "I've sent it". */
export function usePaySheet(o: Options) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<SheetError | null>(null);
  const [pendingOwe, setPendingOwe] = useState<Owe | null>(null);
  const [pending, start] = useTransition();
  const openRef = useRef(false);
  openRef.current = open;
  // Fresh server props carry the real amount and deadline; drop the provisional one.
  useEffect(() => { setPendingOwe(null); }, [o.owe]);
  const owe = o.owe ?? pendingOwe;

  const show = () => { setError(null); setOpen(true); };
  const close = () => { setError(null); setOpen(false); o.onClosed?.(); };
  /** A failure shows inside the sheet while it is open (the page behind a modal is inert), else on the page. */
  const fail = (forWhat: SheetError["for"], text: string) => {
    if (openRef.current) setError({ for: forWhat, text });
    else o.onNote?.(text);
    o.say?.(text);
    o.onFail?.(forWhat, text);
  };
  /** "I've sent it" for every line still owed. `done` runs only once the server accepted it. */
  const markSent = (done?: () => void) => {
    if (!owe) return;
    setError(null);
    const numbers = owe.numbers;
    start(async () => {
      let r: Awaited<ReturnType<typeof sent>>;
      try {
        r = await sent(o.breakId, numbers);
      } catch {
        if (canRefresh()) { router.refresh(); fail("sent", NETWORK_NOTE); } else fail("sent", OFFLINE_NOTE);
        return;
      }
      if (r.ok) {
        done?.();
        setPendingOwe(null);
        close();
        o.onSentOk?.();
        return;
      }
      // The owe or the lines changed under us: catch the props up now.
      router.refresh();
      fail("sent", r.message);
    });
  };
  return { open, show, close, error, setError, fail, owe, pendingOwe, setPendingOwe, markSent, pending };
}
