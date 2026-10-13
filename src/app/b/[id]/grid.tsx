"use client";
import { isOverdue } from "@/domain/lines/rules";

type L = { number: number; ownerId: string | null; ownerHandle: string | null; claimedAt: Date | null; sentAt: Date | null; paidAt: Date | null; reservedForMiniId: string | null; isBonus: boolean };

export function Grid({ lines, lineCount, viewerId, showHandles, paymentWindowHours }: { lines: L[]; lineCount: number; viewerId: string | null; showHandles: boolean; paymentWindowHours: number }) {
  const cls = (l: L) => {
    if (l.reservedForMiniId) return "bg-purple-100 text-purple-800";
    if (!l.ownerId) return "bg-white border";
    if (l.paidAt) return "bg-green-200";
    if (isOverdue(l, { paymentWindowHours })) return "bg-red-200";
    if (l.sentAt) return "bg-blue-100";
    return "bg-amber-100";
  };
  const label = (l: L) => (!l.ownerId ? "open" : showHandles ? l.ownerHandle ?? "?" : "taken");
  const cols = lineCount > 30 ? "grid-cols-6" : "grid-cols-4";
  return (
    <div className={`mt-4 grid ${cols} gap-2`}>
      {lines.map((l) => (
        <div key={l.number} className={`rounded p-2 text-center text-xs ${cls(l)} ${viewerId && l.ownerId === viewerId ? "ring-2 ring-black" : ""}`}>
          <div className="text-base font-semibold">{l.number}{l.isBonus ? "★" : ""}</div>
          <div className="truncate">{label(l)}</div>
        </div>
      ))}
    </div>
  );
}
