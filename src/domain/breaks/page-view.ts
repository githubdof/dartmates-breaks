import type { Tx } from "@/db/client";
import type { Role } from "@/domain/types";
import { globalUnpaidCount, ledgerByBuyer, type LedgerBuyer } from "@/domain/lines/queries";
import { getDrawResult } from "@/domain/draws/queries";
import { getBreakPage, hostTrust, type BreakPage, type HostTrust } from "./queries";
import { canViewBreak, isHostView } from "./grid";

export type BreakViewer = { id: string; role: Role };
export type BreakView = {
  page: BreakPage;
  /** The host's trust figures and record (Mosaic §9): the small line and the ledger header both read it. */
  trust: HostTrust;
  globalUnpaid: number;
  top: { line: number; handle: string | null } | null;
  ledger: LedgerBuyer[];
};

/**
 * Everything the break page reads, in the caller's one transaction. Null for a missing break and for a draft the
 * viewer may not see: that check comes straight after the first read, so a hidden draft costs no further query.
 */
export async function readBreakView(tx: Tx, breakId: string, viewer: BreakViewer | null, now: Date): Promise<BreakView | null> {
  const page = await getBreakPage(tx, breakId);
  if (!page) return null;
  const hostView = isHostView(page.break.hostId, viewer);
  if (!canViewBreak(page.break.status, hostView)) return null;
  const trust = await hostTrust(tx, page.host.id);
  const globalUnpaid = viewer ? await globalUnpaidCount(tx, viewer.id) : 0;
  let top: BreakView["top"] = null;
  if (page.break.status === "drawn") {
    const res = await getDrawResult(tx, breakId);
    const line = res?.ranking[0];
    if (res && line !== undefined) top = { line, handle: res.entries.find((e) => e.number === line)?.handleAtDraw || null };
  }
  // Rows arrive in the ledger order (compareLedger); the sheet freezes that order.
  const ledger = hostView ? await ledgerByBuyer(tx, breakId, now) : [];
  return { page, trust, globalUnpaid, top, ledger };
}
