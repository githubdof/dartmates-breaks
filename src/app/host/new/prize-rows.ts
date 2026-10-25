import type { ItemCondition } from "@/domain/breaks/condition";

/** One prize row of the composer: its stable slot, the name typed and the condition chosen ("" until chosen). */
export type PrizeRow = { slotKey: string; name: string; condition: ItemCondition | "" };

export const blankRow = (newId: () => string): PrizeRow => ({ slotKey: newId(), name: "", condition: "" });

export const addChoice = (rows: readonly PrizeRow[], newId: () => string): PrizeRow[] => [...rows, blankRow(newId)];

/** Row 0 (the top spot) is never removed; the other rows keep their slots. */
export const removeChoice = (rows: readonly PrizeRow[], i: number): PrizeRow[] => (i === 0 ? [...rows] : rows.filter((_, j) => j !== i));

export const setName = (rows: readonly PrizeRow[], i: number, name: string): PrizeRow[] => rows.map((r, j) => (j === i ? { ...r, name } : r));

export const setCondition = (rows: readonly PrizeRow[], i: number, condition: ItemCondition | ""): PrizeRow[] => rows.map((r, j) => (j === i ? { ...r, condition } : r));
