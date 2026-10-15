import type { CSSProperties } from "react";
import type { CellMoment } from "./cell-moments";

/** Moments that draw the cell as it was (the ghost): sent cross-fades it, paid holds its ink, undo fades it out. Task 11b adds release. */
export const GHOSTED_MOMENTS: ReadonlySet<CellMoment> = new Set<CellMoment>(["sent", "paid", "paid-undo"]);

export type MomentAttrs = { moment: Exclude<CellMoment, "still"> | undefined; style: CSSProperties; glint: boolean; ghost: boolean };

/** What a cell renders for its moment: `data-moment`, its stagger index `--i`, the drop's glint, the ghost layer. Still sets nothing. */
export function momentAttrs(moment: CellMoment | undefined, order = 0): MomentAttrs {
  if (!moment || moment === "still") return { moment: undefined, style: {}, glint: false, ghost: false };
  return { moment, style: { "--i": order } as CSSProperties, glint: moment === "drop", ghost: GHOSTED_MOMENTS.has(moment) };
}
