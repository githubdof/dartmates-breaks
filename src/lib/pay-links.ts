export function payLinks(h: { venmo?: string; paypal?: string }, amountCents: number) {
  const amount = (amountCents / 100).toFixed(2);
  const out: { venmo?: string; paypal?: string } = {};
  if (h.venmo) out.venmo = `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(h.venmo.replace(/^@/, ""))}&amount=${amount}&note=`;
  if (h.paypal) out.paypal = `https://paypal.me/${encodeURIComponent(h.paypal.replace(/^@/, ""))}/${amount}`;
  return out;
}
