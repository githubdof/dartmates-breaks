"use client";

export type GridLine = {
  number: number;
  state: "open" | "claimed" | "sent" | "paid" | "overdue" | "reserved";
  label: string | null;
  mine: boolean;
  isBonus: boolean;
};

const CLS: Record<GridLine["state"], string> = {
  reserved: "bg-purple-100 text-purple-800",
  open: "bg-white border",
  paid: "bg-green-200",
  overdue: "bg-red-200",
  sent: "bg-blue-100",
  claimed: "bg-amber-100",
};

export function Grid({ lines, lineCount }: { lines: GridLine[]; lineCount: number }) {
  const label = (l: GridLine) => (l.state === "open" ? "open" : l.state === "reserved" ? "reserved" : l.label ?? "taken");
  const cols = lineCount > 30 ? "grid-cols-6" : "grid-cols-4";
  return (
    <div className={`mt-4 grid ${cols} gap-2`}>
      {lines.map((l) => (
        <div key={l.number} className={`rounded p-2 text-center text-xs ${CLS[l.state]} ${l.mine ? "ring-2 ring-black" : ""}`}>
          <div className="text-base font-semibold">{l.number}{l.isBonus ? "★" : ""}</div>
          <div className="truncate">{label(l)}</div>
        </div>
      ))}
    </div>
  );
}
