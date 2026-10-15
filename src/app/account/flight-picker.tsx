"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/button";
import { Cell } from "@/components/grid/cell";
import { FlightGlyph } from "@/components/flight-glyph";
import { FLIGHT_COLOURS, FLIGHT_SHAPES, type Flight } from "@/domain/flights";
import { saveFlight, type PickerState } from "./actions";
import { flightGrid, previewCells } from "./preview-cells";

const GRID = flightGrid();

/** "Your flight" (§8): 32 flights as one radio grid, the current one ringed; the preview follows the pick. Paper. */
export function FlightPicker({ current }: { current: Flight }) {
  const [state, submit, pending] = useActionState<PickerState, FormData>(saveFlight, null);
  const [pick, setPick] = useState<Flight>(current);
  const preview = previewCells(pick);
  return (
    <form action={submit} className="space-y-4">
      <fieldset data-testid="flight-picker" className="space-y-3">
        <legend className="text-headline font-semibold">Your flight</legend>
        {/* The preview is decorative: the radios carry the choice. Paper, so the wire is --board-steel. */}
        <div aria-hidden className="space-y-2">
          <div className="board-wire grid w-[88px]" style={{ marginInline: 0, gridTemplateColumns: "88px" }}><Cell cell={preview.big} px={88} /></div>
          <div className="board-wire grid" style={{ marginInline: 0, width: 7 * 45 - 1, gridTemplateColumns: "repeat(7, 44px)" }}>
            {preview.row.map((c) => <Cell key={c.number} cell={c} px={44} />)}
          </div>
        </div>
        <div className="grid grid-cols-8 border-t border-l border-[var(--board-steel)]">
          {GRID.flat().map((f) => {
            const checked = pick.colour === f.colour && pick.shape === f.shape;
            return (
              <label key={`${f.colour}-${f.shape}`}
                className={`relative flex aspect-square cursor-pointer items-center justify-center border-r border-b border-[var(--board-steel)] bg-[var(--board-cream)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-green ${checked ? "shadow-[inset_0_0_0_2px_var(--board-cream),inset_0_0_0_4px_var(--board-ink),inset_0_0_0_6px_var(--board-cream)]" : ""}`}>
                <input type="radio" name="flight" value={`${f.colour}-${f.shape}`} checked={checked} onChange={() => setPick(f)}
                  data-testid={`flight-${f.colour}-${f.shape}`} className="absolute inset-0 m-0 cursor-pointer appearance-none opacity-0" />
                <FlightGlyph flight={f} size={20} />
                {/* The name lives in the content, never in an aria-label (the e2e privacy rule). */}
                <span className="sr-only">{FLIGHT_COLOURS[f.colour].label} {FLIGHT_SHAPES[f.shape].label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <Button type="submit" disabled={pending} data-testid="flight-save">Save flight</Button>
      <p role="status" className="text-small">{state?.saved ? "Saved." : ""}</p>
      {state?.error && <p role="alert" className="text-small text-red">{state.error}</p>}
    </form>
  );
}
