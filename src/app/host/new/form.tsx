"use client";
import { useActionState, useState } from "react";
import { saveBreak, type ComposerState } from "./actions";
import { previewText } from "./preview";
import type { ComposerInitial } from "./initial";
import { Button } from "@/components/button";
import { Stepper } from "@/components/stepper";
import { GridPreview } from "@/components/grid/grid-preview";

const field = "h-12 w-full rounded-input border border-wire-strong bg-card px-3";
const area = "w-full rounded-input border border-wire-strong bg-card px-3 py-2";
const label = "block text-small font-semibold";
const MODES = [
  { value: "pick_or_random", title: "Pick or random", help: "Buyers pick lines or take random ones." },
  { value: "pick_only", title: "Pick only, no randoms", help: "Buyers pick every line themselves." },
  { value: "straight", title: "Straight fill", help: "Buyers say how many and get the next open numbers." },
] as const;

type Props = {
  /** Starting values: the host's last break for a new break, the draft itself when editing (initial.breakId set). */
  initial: ComposerInitial;
  /** MAX_LINES, passed from the server page so this client file imports no domain values. */
  maxLines: number;
};

export function ComposerForm({ initial, maxLines }: Props) {
  const [state, submit, pending] = useActionState<ComposerState, FormData>(saveBreak, null);
  const [lineCount, setLineCount] = useState(initial.lineCount);
  const [price, setPrice] = useState(initial.price);
  const [choices, setChoices] = useState<string[]>(initial.prize1);
  const [second, setSecond] = useState(initial.prize2 !== "");
  const preview = previewText(lineCount, price);
  const val = (name: string, fallback: string) => state?.values?.[name] ?? fallback;

  return (
    <form action={submit} className="mt-4 space-y-8">
      {/* Enter in a text field presses the first submit button in the DOM: make that a harmless draft save. */}
      <button type="submit" name="intent" value="draft" hidden aria-hidden tabIndex={-1} />
      {initial.breakId && <input type="hidden" name="breakId" value={initial.breakId} />}
      <div className="space-y-1">
        <label htmlFor="title" className={label}>Title</label>
        <input id="title" name="title" defaultValue={val("title", initial.title)} required maxLength={120} placeholder="Target Phil Taylor Chronos" className={field} />
      </div>

      <fieldset className="space-y-3">
        <legend className="text-headline font-semibold">Prize</legend>
        {choices.map((value, i) => (
          <div key={i} className="space-y-1">
            <label htmlFor={`prize1-${i}`} className={label}>{i === 0 ? "Top spot gets" : "or"}</label>
            <div className="flex gap-2">
              <input id={`prize1-${i}`} name="prize1" required={i === 0} value={value} maxLength={120}
                onChange={(e) => setChoices((cur) => cur.map((c, j) => (j === i ? e.target.value : c)))}
                placeholder={i === 0 ? "Chronos 22g steel" : "Chronos 18g soft"} className={field} />
              {i > 0 && <Button variant="text" onClick={() => setChoices((cur) => cur.filter((_, j) => j !== i))}>Remove</Button>}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-4">
          <Button variant="text" onClick={() => setChoices((cur) => [...cur, ""])}>Add a choice</Button>
          {!second && <Button variant="text" onClick={() => setSecond(true)}>Add 2nd place</Button>}
        </div>
        {second && (
          <div className="space-y-1">
            <label htmlFor="prize2" className={label}>2nd place gets</label>
            <input id="prize2" name="prize2" defaultValue={val("prize2", initial.prize2)} maxLength={120} placeholder="Flight pack" className={field} />
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-headline font-semibold">Lines</legend>
        <div className="flex flex-wrap items-end gap-6">
          <div className="space-y-1">
            <span className={label}>Lines</span>
            <Stepper label="Lines" name="lineCount" value={lineCount} min={2} max={maxLines} onChange={setLineCount} />
          </div>
          <div className="space-y-1">
            <label htmlFor="linePrice" className={label}>Price per line, $</label>
            <input id="linePrice" name="linePrice" inputMode="decimal" required value={price} onChange={(e) => setPrice(e.target.value)} className={`${field} w-32`} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="paymentWindowHours" className={label}>Hours to pay</label>
            <input id="paymentWindowHours" name="paymentWindowHours" inputMode="numeric" placeholder="24" defaultValue={val("paymentWindowHours", initial.paymentWindowHours)} className={field} />
          </div>
          <div className="space-y-1">
            <label htmlFor="maxLinesPerUser" className={label}>Lines per person</label>
            <input id="maxLinesPerUser" name="maxLinesPerUser" inputMode="numeric" placeholder="No limit" defaultValue={val("maxLinesPerUser", initial.maxLinesPerUser)} className={field} />
          </div>
        </div>
        <div role="radiogroup" aria-label="Picking mode" className="space-y-2">
          <span className={label}>Picking mode</span>
          {MODES.map((m) => (
            <label key={m.value} className="flex min-h-11 items-start gap-3 rounded-input border border-wire-strong bg-card px-3 py-2">
              <input type="radio" name="claimMode" value={m.value} defaultChecked={m.value === val("claimMode", initial.claimMode)} className="mt-1 size-5 accent-[var(--ink)]" />
              <span><span className="block font-semibold">{m.title}</span><span className="block text-small text-ink-2">{m.help}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-headline font-semibold">Payment</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="venmo" className={label}>Venmo handle</label>
            <input id="venmo" name="venmo" defaultValue={val("venmo", initial.venmo)} placeholder="@Jim-Roberts-36" autoCapitalize="none" className={field} />
          </div>
          <div className="space-y-1">
            <label htmlFor="paypal" className={label}>PayPal.me name</label>
            <input id="paypal" name="paypal" defaultValue={val("paypal", initial.paypal)} placeholder="JamesRoberts603182" autoCapitalize="none" className={field} />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="paymentInstructions" className={label}>Payment instructions</label>
          <textarea id="paymentInstructions" name="paymentInstructions" rows={2} maxLength={500} placeholder="Leave blank to build them from your handles" defaultValue={val("paymentInstructions", initial.paymentInstructions)} className={area} />
        </div>
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="text-headline font-semibold">About</legend>
        <label htmlFor="description" className="sr-only">Description</label>
        <textarea id="description" name="description" rows={3} maxLength={2000} defaultValue={val("description", initial.description)} placeholder="Condition, shipping, anything buyers should know" className={area} />
      </fieldset>

      <div className="flex items-center gap-4 rounded-card border border-wire bg-card p-3">
        <GridPreview count={lineCount} size={64} />
        <p className="font-condensed text-headline font-semibold tabular" aria-live="polite">{preview}</p>
      </div>

      {state?.error && <p role="alert" className="text-small text-red">{state.error}</p>}
      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <Button type="submit" name="intent" value="open" disabled={pending} data-testid="composer-open">Open break</Button>
        <Button type="submit" name="intent" value="draft" variant="secondary" disabled={pending} data-testid="composer-draft">Save draft</Button>
      </div>
    </form>
  );
}
