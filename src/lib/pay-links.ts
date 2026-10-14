export type PayLink = { app: string; web: string };

/** Deep links with an empty note. Venmo's scheme is often blocked in in-app browsers, so it carries a web fallback. */
export function payLinks(h: { venmo?: string; paypal?: string }, amountCents: number): { venmo?: PayLink; paypal?: PayLink } {
  const amount = (amountCents / 100).toFixed(2);
  const out: { venmo?: PayLink; paypal?: PayLink } = {};
  if (h.venmo) {
    const v = encodeURIComponent(h.venmo.replace(/^@/, ""));
    out.venmo = { app: `venmo://paycharge?txn=pay&recipients=${v}&amount=${amount}&note=`, web: `https://account.venmo.com/u/${v}` };
  }
  if (h.paypal) {
    const link = `https://paypal.me/${encodeURIComponent(h.paypal.replace(/^@/, ""))}/${amount}`;
    out.paypal = { app: link, web: link };
  }
  return out;
}
