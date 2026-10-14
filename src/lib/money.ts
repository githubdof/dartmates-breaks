/** "$20.00": always two decimals. Machine-facing text only (deep links use their own amount format). */
export const formatCents = (n: number) => `$${(n / 100).toFixed(2)}`;

/** UI money (design §6): "$5", "$5.50", "$1,250". Whole dollars drop the cents. */
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rest = abs % 100;
  return `${sign}$${whole}${rest ? `.${String(rest).padStart(2, "0")}` : ""}`;
}
