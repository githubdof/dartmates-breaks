import { formatMoney } from "./money";

export type ShareInput =
  | { state: "open"; title: string; lineCount: number; priceCents: number; openCount: number; url: string }
  | { state: "closed"; title: string; url: string }
  | { state: "running"; title: string; url: string }
  | { state: "ran"; topLine: number; topHandle: string | null; url: string };

/** Copied to the clipboard by Share (design §6). "CLOSED n RAN" is quoted community idiom, the one caps exception. */
export function shareText(i: ShareInput): string {
  switch (i.state) {
    case "open":
      if (i.openCount === 0) return `Every spot is taken. If you've claimed, please send payment. ${i.url}`;
      // The count is "N to go" everywhere a count appears (Mosaic §9), share text included.
      if (i.openCount <= 5) return `${i.openCount} to go. If you've claimed, please send payment. ${i.url}`;
      return `${i.title} break. ${i.lineCount} lines at ${formatMoney(i.priceCents)}. Pick yours: ${i.url}`;
    case "closed":
      return `CLOSED. ${i.title}. Draw tonight. ${i.url}`;
    case "running":
      return `CLOSED. ${i.title}. Draw running now. ${i.url}`;
    case "ran":
      return `CLOSED n RAN. Top spot: line ${i.topLine}${i.topHandle ? `, @${i.topHandle}` : ""}. Check the draw: ${i.url}`;
  }
}

export type ShareSource = {
  status: string; title: string; url: string; lineCount: number; priceCents: number; openCount: number;
  top: { line: number; handle: string | null } | null;
};

/** The break page's Share text by state. Null hides Share: drafts are private and a cancelled break has nothing to share. */
export function pageShare(p: ShareSource): string | null {
  switch (p.status) {
    case "open": return shareText({ state: "open", title: p.title, lineCount: p.lineCount, priceCents: p.priceCents, openCount: p.openCount, url: p.url });
    case "filled": return shareText({ state: "closed", title: p.title, url: p.url });
    case "drawing": return shareText({ state: "running", title: p.title, url: p.url });
    case "drawn": return p.top ? shareText({ state: "ran", topLine: p.top.line, topHandle: p.top.handle, url: `${p.url}/result` }) : null;
    default: return null;
  }
}
