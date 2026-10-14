import { formatMoney } from "@/lib/money";

export function previewText(lineCount: number, price: string): string {
  const cleaned = price.replace(/[$,\s]/g, "");
  const dollars = Number(cleaned);
  if (!cleaned || !Number.isFinite(dollars) || dollars <= 0) return "";
  const cents = Math.round(dollars * 100);
  return `${lineCount} lines at ${formatMoney(cents)} = ${formatMoney(lineCount * cents)}`;
}
