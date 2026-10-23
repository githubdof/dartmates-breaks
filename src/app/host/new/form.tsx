"use client";
import { useActionState, useCallback, useRef, useState, type FormEvent } from "react";
import { ensureDraftAction, saveBreak, type ComposerState } from "./actions";
import { previewText } from "./preview";
import { composerBreakId, type ComposerInitial } from "./initial";
import { moveToEditAddress } from "./draft-address";
import { Button } from "@/components/button";
import { Stepper } from "@/components/stepper";
import { GridPreview } from "@/components/grid/grid-preview";
import type { Kit } from "@/domain/flights";
import { CONDITION_LABEL, ITEM_CONDITIONS, isItemCondition, type ItemCondition } from "@/domain/breaks/condition";
import { DeleteDraftButton } from "../delete-draft-button";
import { PhotoStrip, type EnsureDraft, type StripPrize } from "@/components/photos/photo-strip";
import { canAddPhotos } from "@/components/photos/strip-state";
import { addChoice, blankRow, removeChoice, setCondition, setName, type PrizeRow } from "./prize-rows";

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
  /** The host's kit (hostKit): the preview shows the board in the kit it opens in (recorded ruling 32). */
  kit: Kit;
  /** MAX_PHOTOS, passed from the server page for the same reason. */
  maxPhotos: number;
};

/** The slots of the named prize rows in a form as it was posted: what a successful save leaves on the server. */
function sentSlots(f: FormData): string[] {
  const text = (k: string) => f.getAll(k).filter((v): v is string => typeof v === "string");
  const names = text("prize1");
  const slots = text("prize1Slot").filter((_, i) => (names[i] ?? "").trim() !== "");
  const second = text("prize2")[0]?.trim() ? text("prize2Slot") : [];
  return [...slots, ...second];
}

/** One strip prize per named row, keyed by its stable slot, for the Tag menu. */
function stripPrizes(choices: readonly PrizeRow[], second: PrizeRow | null): StripPrize[] {
  return [...choices, ...(second ? [second] : [])]
    .filter((r) => r.name.trim() !== "")
    .map((r) => ({ slot: r.slotKey, label: r.name.trim(), itemName: r.name.trim() }));
}

export function ComposerForm({ initial, maxLines, kit, maxPhotos }: Props) {
  // React resets a <form action> after every action, failed ones too, and a controlled select keeps its mount-time
  // option as the reset target. Counting the answers lets the selects remount, so they come back showing their state.
  const [answers, setAnswers] = useState(0);
  const [state, submit, pending] = useActionState<ComposerState, FormData>(async (prev, form) => {
    const next = await saveBreak(prev, form);
    setAnswers((n) => n + 1);
    return next;
  }, null);
  // Pinned at mount: a server refresh re-renders the page with fresh props, and a new break's id must not change under
  // its photos (ruling 22: the id is the server's, and it is the one this page rendered with).
  const [breakId] = useState(() => {
    const id = composerBreakId(initial);
    if (!id) throw new Error("The composer needs a break id");
    return id;
  });
  const formRef = useRef<HTMLFormElement>(null);
  const [title, setTitle] = useState(initial.title);
  const [photoCount, setPhotoCount] = useState(initial.photos.length);
  // The first photo saves the form as a draft (once; a failure clears the memo so Retry asks again) and moves the address.
  const draftRef = useRef<ReturnType<EnsureDraft> | null>(null);
  const ensureDraft: EnsureDraft = () => {
    if (!draftRef.current) {
      draftRef.current = (async () => {
        try {
          const sent = new FormData(formRef.current ?? undefined);
          const r = await ensureDraftAction(sent);
          if (r.ok) { moveToEditAddress(r.data.breakId); return { ok: true as const, slots: sentSlots(sent) }; }
          draftRef.current = null;
          return { ok: false as const, message: r.message };
        } catch {
          draftRef.current = null;
          return { ok: false as const, message: "Something went wrong. Please try again." };
        }
      })();
    }
    return draftRef.current;
  };
  // Saves the form as it stands (the draft exists by now), so prizes typed since can be tagged.
  const saveDraft: EnsureDraft = async () => {
    try {
      const sent = new FormData(formRef.current ?? undefined);
      const r = await ensureDraftAction(sent);
      if (r.ok) moveToEditAddress(r.data.breakId);
      return r.ok ? { ok: true, slots: sentSlots(sent) } : { ok: false, message: r.message };
    } catch {
      return { ok: false, message: "Something went wrong. Please try again." };
    }
  };
  // Save draft and Open break never cut an upload off (spec §5.3): pressed while photos upload, the press waits for
  // them and goes ahead once they settle (the strip's banner shows meanwhile). If one failed, the host decides again.
  const inFlight = useRef(0);
  const waitingFor = useRef<HTMLElement | null>(null);
  const [waiting, setWaiting] = useState(false);
  const onUploads = useCallback((n: number, failed: number) => {
    inFlight.current = n;
    const submitter = waitingFor.current;
    if (n > 0 || !submitter) return;
    waitingFor.current = null;
    setWaiting(false);
    if (failed === 0) formRef.current?.requestSubmit(submitter);
  }, []);
  const holdWhileUploading = (e: FormEvent<HTMLFormElement>) => {
    if (inFlight.current === 0) return;
    e.preventDefault(); // React runs no form action for a cancelled submit
    waitingFor.current = (e.nativeEvent as SubmitEvent).submitter ?? null;
    setWaiting(true);
  };
  const [lineCount, setLineCount] = useState(initial.lineCount);
  const [price, setPrice] = useState(initial.price);
  // The prize rows are controlled, so their slots and conditions survive re-renders and a failed save.
  const [choices, setChoices] = useState<PrizeRow[]>(initial.prize1);
  const [second, setSecond] = useState<PrizeRow | null>(initial.prize2);
  const preview = previewText(lineCount, price);
  const val = (name: string, fallback: string) => state?.values?.[name] ?? fallback;

  return (
    <>
    <form ref={formRef} action={submit} onSubmit={holdWhileUploading} className="mt-4 space-y-8">
      {/* Enter in a text field presses the first submit button in the DOM: make that a harmless draft save. */}
      <button type="submit" name="intent" value="draft" hidden aria-hidden tabIndex={-1} />
      {initial.newBreakId && <input type="hidden" name="newBreakId" value={breakId} />}
      {initial.breakId && <input type="hidden" name="breakId" value={breakId} />}
      <div className="space-y-1">
        <label htmlFor="title" className={label}>Title</label>
        <input id="title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} placeholder="Target Phil Taylor Chronos" className={field} />
      </div>

      <fieldset className="space-y-3">
        <legend className="text-headline font-semibold">Prize</legend>
        {choices.map((row, i) => (
          <div key={row.slotKey} className="space-y-1">
            <label htmlFor={`prize1-${i}`} className={label}>{i === 0 ? "Top spot gets" : "or"}</label>
            <div className="flex gap-2">
              <input id={`prize1-${i}`} name="prize1" required={i === 0} value={row.name} maxLength={120}
                onChange={(e) => setChoices((cur) => setName(cur, i, e.target.value))}
                placeholder={i === 0 ? "Chronos 22g steel" : "Chronos 18g soft"} className={field} />
              {i > 0 && <Button variant="text" onClick={() => setChoices((cur) => removeChoice(cur, i))}>Remove</Button>}
            </div>
            <input type="hidden" name="prize1Slot" value={row.slotKey} />
            <ConditionSelect epoch={answers} id={`prize1-condition-${i}`} name="prize1Condition" row={row} required={i === 0 || row.name.trim() !== ""}
              labelFor={i === 0 ? "the top spot" : `choice ${i + 1}`} onChange={(c) => setChoices((cur) => setCondition(cur, i, c))} />
          </div>
        ))}
        <div className="flex flex-wrap gap-4">
          <Button variant="text" onClick={() => setChoices((cur) => addChoice(cur, () => crypto.randomUUID()))}>Add a choice</Button>
          {!second && <Button variant="text" onClick={() => setSecond(blankRow(() => crypto.randomUUID()))}>Add 2nd place</Button>}
        </div>
        {second && (
          <div className="space-y-1">
            <label htmlFor="prize2" className={label}>2nd place gets</label>
            <input id="prize2" name="prize2" value={second.name} maxLength={120} placeholder="Flight pack"
              onChange={(e) => setSecond({ ...second, name: e.target.value })} className={field} />
            <input type="hidden" name="prize2Slot" value={second.slotKey} />
            <ConditionSelect epoch={answers} id="prize2-condition" name="prize2Condition" row={second} required={second.name.trim() !== ""} labelFor="2nd place"
              onChange={(c) => setSecond({ ...second, condition: c })} />
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
        <legend className="text-headline font-semibold">Photos</legend>
        <PhotoStrip
          breakId={breakId} initial={initial.photos} prizes={stripPrizes(choices, second)} title={title} max={maxPhotos}
          canAdd={canAddPhotos({ title, lineCount, price, maxLines, topSpot: choices[0] ?? null })}
          claimed={false} ensureDraft={initial.newBreakId === null ? undefined : ensureDraft} saveDraft={saveDraft} onCount={setPhotoCount} onUploads={onUploads}
        />
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
        <GridPreview count={lineCount} size={64} kit={kit} />
        <p className="font-condensed text-headline font-semibold tabular" aria-live="polite">{preview}</p>
      </div>

      {photoCount === 0 && <p className="text-small text-ink-2">Buyers see the lead photo first in the feed.</p>}
      {state?.error && <p role="alert" className="text-small text-red">{state.error}</p>}
      {waiting && <p role="status" data-testid="composer-waiting" className="text-small text-ink-2">This goes ahead once the photos finish uploading.</p>}
      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <Button type="submit" name="intent" value="open" disabled={pending} data-testid="composer-open">Open break</Button>
        <Button type="submit" name="intent" value="draft" variant="secondary" disabled={pending} data-testid="composer-draft">Save draft</Button>
      </div>
    </form>
    {/* Outside the form: its button never submits the composer. */}
    {initial.breakId && <div className="mt-6"><DeleteDraftButton breakId={initial.breakId} title={initial.title} /></div>}
    </>
  );
}

/** A required Condition select for one prize row; the label is for screen readers, the first option shows on screen. */
function ConditionSelect({ epoch, id, name, row, required, labelFor, onChange }: {
  epoch: number; id: string; name: string; row: PrizeRow; required: boolean; labelFor: string; onChange: (c: ItemCondition | "") => void;
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">Condition of {labelFor}</label>
      {/* Not controlled: React's controlled select marks no option as its reset target, so the form reset after a
          failed save would blank it. The key remounts it after each answer with defaultValue = the row's state. */}
      <select key={epoch} id={id} name={name} required={required} defaultValue={row.condition || undefined} className={field}
        onChange={(e) => onChange(isItemCondition(e.target.value) ? e.target.value : "")}>
        <option value="">Condition</option>
        {ITEM_CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
      </select>
    </>
  );
}
