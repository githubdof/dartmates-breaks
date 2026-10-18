"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/button";
import { Cell } from "@/components/grid/cell";
import { kitVars } from "@/components/grid/grid";
import { DARK_COLOURS, FLIGHT_COLOURS, LIGHT_COLOURS, type FlightColour, type Kit } from "@/domain/flights";
import { saveKit, type PickerState } from "./actions";
import { KIT_PREVIEW } from "./preview-cells";

/** The form fields parseKit reads (Task 4b): "kitDark" and "kitLight" (recorded ruling 9). */
function ColourGroup({ legend, name, options, value, onChange }: { legend: string; name: "kitDark" | "kitLight"; options: readonly FlightColour[]; value: FlightColour; onChange: (c: FlightColour) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-small font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((c) => (
          <label key={c} className="relative flex min-h-11 cursor-pointer items-center gap-2 rounded-input border border-wire-strong bg-card px-3 has-[:checked]:border-ink has-[:checked]:shadow-[inset_0_0_0_1px_var(--ink)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-green">
            <input type="radio" name={name} value={c} checked={value === c} onChange={() => onChange(c)} className="absolute inset-0 m-0 cursor-pointer appearance-none opacity-0" />
            <span aria-hidden className="block size-5 border border-[var(--board-steel)]" style={{ background: FLIGHT_COLOURS[c].face }} />
            <span className="text-small">{FLIGHT_COLOURS[c].label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** "Your kit" (§8, hosts): one dark and one light colour, 15 kits, all free; a framed four-cell board shows the pick. */
export function KitPicker({ current }: { current: Kit }) {
  const [state, submit, pending] = useActionState<PickerState, FormData>(saveKit, null);
  const [kit, setKit] = useState<Kit>(current);
  return (
    <form action={submit} id="kit" className="space-y-4">
      <fieldset data-testid="kit-picker" className="space-y-4">
        <legend className="text-headline font-semibold">Your kit</legend>
        <p className="text-small text-ink-2">The surround on every board you host.</p>
        {/* The board's own frame: kitVars sets the two colours, .board-frame draws the surround. */}
        <div aria-hidden data-testid={`kit-${kit.dark}-${kit.light}`} className="p-3" style={kitVars(kit)}>
          <div className="board-frame grid w-[180px] grid-cols-4" style={{ marginInline: 0 }}>
            {KIT_PREVIEW.map((c) => <Cell key={c.number} cell={c} view="kit" />)}
          </div>
        </div>
        <ColourGroup legend="Dark colour" name="kitDark" options={DARK_COLOURS} value={kit.dark} onChange={(dark) => setKit((k) => ({ ...k, dark }))} />
        <ColourGroup legend="Light colour" name="kitLight" options={LIGHT_COLOURS} value={kit.light} onChange={(light) => setKit((k) => ({ ...k, light }))} />
      </fieldset>
      <Button type="submit" disabled={pending} data-testid="kit-save">Save kit</Button>
      <p role="status" className="text-small">{state?.saved ? "Saved." : ""}</p>
      {state?.error && <p role="alert" className="text-small text-red">{state.error}</p>}
    </form>
  );
}
