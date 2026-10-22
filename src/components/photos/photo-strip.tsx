"use client";
import { useCallback, useEffect, useId, useReducer, useRef, useState, type ChangeEvent, type PointerEvent } from "react";
import { Button } from "@/components/button";
import { describePhotoAction, removePhotoAction, reorderPhotosAction, requestPhotoUpload, retagPhotoAction } from "@/app/photos/actions";
import { shrinkForUpload, CannotRead } from "./shrink";
import { NETWORK_FAILED, UploadError, uploadPhoto } from "./upload-client";
import { removalQueue, timers, type RemovalQueue } from "./removal-queue";
import { guardUnload } from "./unload-guard";
import { StripTile } from "./strip-tile";
import {
  NEED_FORM_NOTICE, defaultAlt, initStrip, nextToStart, readyIds, stripReducer, uploadsInFlight,
  type StripAction, type StripPhoto, type StripRemoval, type StripState, type StripTile as Tile,
} from "./strip-state";

export type StripPrize = { slot: string; label: string; itemName: string | null }; // label: typed name, else "Top spot" / "2nd place"
/** `slots`: the prize slots the request carried, i.e. what the server holds once it succeeds. */
export type EnsureDraft = () => Promise<{ ok: true; slots: string[] } | { ok: false; message: string }>;
export type PhotoStripProps = {
  breakId: string; initial: StripPhoto[]; prizes: StripPrize[]; title: string; max: number;
  canAdd: boolean;                 // composer: canAddPhotos(form); the sheet: true
  claimed: boolean;                // breaks.first_claimed_at is set
  ensureDraft?: EnsureDraft;       // composer, new break only
  saveDraft?: EnsureDraft;         // composer: saves the form's current prizes, so a tag can name one the server has not seen
  onCount?: (live: number) => void;
  onChange?: () => void;           // any committed action (Task 7c refreshes on close)
};

const ALT_NOTICE = "Describe the photo in 1 to 120 characters.";
const SOMETHING_WRONG = "Something went wrong. Please try again.";
const failed = { ok: false as const, code: "client_error", message: SOMETHING_WRONG };
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic";
const addClass = "inline-flex min-h-11 items-center justify-center rounded-input border border-wire-strong bg-card px-4 text-body font-semibold text-ink hover:bg-wire-2";

type Mode = "menu" | "tag" | "describe" | "confirm";
type Panel = { key: string; mode: Mode } | null;

/** The order the server holds: the live photos, then a removal still waiting to commit (it counts until it does). */
const serverOrder = (s: StripState): string[] => [...readyIds(s), ...(s.removal?.tile.photoId ? [s.removal.tile.photoId] : [])];

export function PhotoStrip(p: PhotoStripProps) {
  const { breakId, prizes, max, canAdd, claimed, onCount } = p;
  const [state, dispatch] = useReducer(stripReducer, null, () => initStrip(p.initial, max));
  const latest = useRef({ state, p });
  useEffect(() => { latest.current = { state, p }; });
  const files = useRef(new Map<string, File>());
  const previews = useRef(new Map<string, string>());
  const controllers = useRef(new Map<string, AbortController>());
  const running = useRef(new Set<string>());
  const counter = useRef(0);
  // Prize slots the server holds. With a composer that creates the draft later, none until it does.
  const savedSlots = useRef(new Set<string>(p.ensureDraft ? [] : p.prizes.map((x) => x.slot)));
  const input = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const [panel, setPanel] = useState<Panel>(null);
  const [describeText, setDescribeText] = useState("");
  const [panelError, setPanelError] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);

  const notice = useCallback((text: string | null) => dispatch({ type: "notice", text }), []);
  const changed = useCallback(() => latest.current.p.onChange?.(), []);

  const commitRemoval = useCallback(async (item: StripRemoval) => {
    const id = item.tile.photoId;
    if (!id) return;
    const r = await removePhotoAction(id).catch(() => failed);
    if (r.ok) {
      dispatch({ type: "removalDone", photoId: id });
      changed();
    } else {
      dispatch({ type: "removeFailed", removal: item, error: r.message });
    }
  }, [changed]);
  // The Undo window: one removal waits here, and unmounting commits it.
  const queue = useRef<RemovalQueue<StripRemoval> | null>(null);
  useEffect(() => {
    const q = removalQueue<StripRemoval>((item) => { void commitRemoval(item); }, timers);
    queue.current = q;
    return () => { q.flush(); queue.current = null; };
  }, [commitRemoval]);

  // One upload: the draft (first photo of a new break), the shrink, the upload grant, the bytes, the finalise.
  const run = useCallback(async (key: string) => {
    const file = files.current.get(key);
    if (running.current.has(key) || !file) return;
    running.current.add(key);
    const ac = new AbortController();
    controllers.current.set(key, ac);
    dispatch({ type: "start", key });
    const fail = (k: string, error: string, retryable: boolean) => dispatch({ type: "fail", key: k, error, retryable });
    try {
      const { ensureDraft, title } = latest.current.p;
      if (ensureDraft) {
        const r = await ensureDraft();
        if (!r.ok) {
          // Every tile waiting on the draft gets the reason; Retry asks again.
          for (const t of latest.current.state.tiles) if (t.status === "queued") fail(t.key, r.message, true);
          fail(key, r.message, true);
          return;
        }
        for (const slot of r.slots) savedSlots.current.add(slot);
      }
      let blob: Blob;
      try {
        blob = await shrinkForUpload(file);
      } catch (e) {
        if (e instanceof CannotRead) { dispatch({ type: "unreadable", key }); return; }
        throw e;
      }
      const tile = latest.current.state.tiles.find((t) => t.key === key);
      const out = await uploadPhoto({
        breakId, blob, slot: tile?.slot ?? null, alt: tile?.alt ?? defaultAlt({ itemName: null, title }), signal: ac.signal, request: requestPhotoUpload,
        onProgress: (fraction) => dispatch({ type: "progress", key, fraction }),
        onFinishing: () => dispatch({ type: "finishing", key }),
      });
      dispatch({ type: "done", key, photoId: out.photoId, src: out.src });
      changed();
    } catch (e) {
      if (ac.signal.aborted) return;
      if (e instanceof UploadError) fail(key, e.message, e.retryable);
      else fail(key, NETWORK_FAILED, true);
    } finally {
      running.current.delete(key);
      controllers.current.delete(key);
    }
  }, [breakId, changed]);

  useEffect(() => {
    for (const key of nextToStart(state)) void run(key);
  }, [state, run]);

  // A picked file's local preview and bytes are let go once its tile is ready or gone.
  useEffect(() => {
    for (const [key, url] of previews.current) {
      const t = state.tiles.find((x) => x.key === key);
      if (t && t.status !== "ready") continue;
      URL.revokeObjectURL(url);
      previews.current.delete(key);
      files.current.delete(key);
    }
  }, [state.tiles]);

  const uploading = uploadsInFlight(state) > 0;
  useEffect(() => guardUnload(window, uploading), [uploading]);
  useEffect(() => {
    const online = () => dispatch({ type: "online" });
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, []);
  useEffect(() => () => {
    for (const ac of controllers.current.values()) ac.abort();
    for (const url of previews.current.values()) URL.revokeObjectURL(url);
  }, []);

  const readyCount = state.tiles.filter((t) => t.status === "ready").length;
  useEffect(() => { onCount?.(readyCount); }, [readyCount, onCount]);
  const validSlots = prizes.map((x) => x.slot).join("|");
  useEffect(() => { dispatch({ type: "slots", valid: validSlots ? validSlots.split("|") : [] }); }, [validSlots]);

  const open = panel ? state.tiles.find((t) => t.key === panel.key && t.status === "ready") ?? null : null;
  const closePanel = () => { setPanel(null); setPanelError(null); };

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ""; // the same file may be picked again
    if (picked.length === 0 || !canAdd) return;
    const alt = defaultAlt({ itemName: null, title: p.title });
    const entries = picked.map((file) => ({ key: `u${++counter.current}`, file }));
    // The reducer decides how many fit; only those get a preview and keep their bytes.
    const probe = stripReducer(latest.current.state, { type: "pick", files: entries.map((x) => ({ key: x.key, preview: "", alt })) });
    const admitted = new Set(probe.tiles.map((t) => t.key));
    const withPreview = entries.map((x) => {
      if (!admitted.has(x.key)) return { key: x.key, preview: "", alt };
      const url = URL.createObjectURL(x.file);
      files.current.set(x.key, x.file);
      previews.current.set(x.key, url);
      return { key: x.key, preview: url, alt };
    });
    dispatch({ type: "pick", files: withPreview });
  }

  function cancel(key: string) {
    controllers.current.get(key)?.abort();
    dispatch({ type: "cancel", key });
  }

  async function saveOrder(ids: string[], before: string[]) {
    const r = await reorderPhotosAction(breakId, ids).catch(() => failed);
    if (r.ok) { changed(); return; }
    dispatch({ type: "order", ids: before });
    notice(r.message);
  }
  function reorder(a: StripAction) {
    const cur = latest.current.state;
    const next = stripReducer(cur, a);
    const ids = serverOrder(next);
    const before = serverOrder(cur);
    if (ids.join() === before.join()) return;
    dispatch(a);
    void saveOrder(ids, readyIds(cur));
  }

  async function tag(tile: Tile, prize: StripPrize | null) {
    const slot = prize?.slot ?? null;
    const photoId = tile.photoId;
    if (!photoId || slot === tile.slot) return;
    const alt = defaultAlt({ itemName: prize?.itemName ?? null, title: p.title });
    dispatch({ type: "tag", key: tile.key, slot, defaultAlt: alt });
    const revert = (message: string) => {
      dispatch({ type: "tag", key: tile.key, slot: tile.slot, defaultAlt: tile.alt });
      notice(message);
    };
    if (prize && !savedSlots.current.has(prize.slot) && p.saveDraft) {
      // A prize typed since the draft was last saved: the server only accepts a tag on a saved one.
      const saved = await p.saveDraft().catch(() => ({ ok: false as const, message: SOMETHING_WRONG }));
      if (!saved.ok) { revert(saved.message); return; }
      for (const s of saved.slots) savedSlots.current.add(s);
      if (!savedSlots.current.has(prize.slot)) { revert(SOMETHING_WRONG); return; }
    }
    const r = await retagPhotoAction(photoId, slot).catch(() => failed);
    if (!r.ok) { revert(r.message); return; }
    if (!tile.altEdited) {
      const d = await describePhotoAction(photoId, alt).catch(() => failed);
      if (!d.ok) notice(d.message);
    }
    changed();
  }

  async function describe(tile: Tile, text: string) {
    const alt = text.trim();
    const photoId = tile.photoId;
    if (!photoId) return;
    if (alt.length < 1 || alt.length > 120) { setPanelError(ALT_NOTICE); return; }
    setPanelError(null);
    dispatch({ type: "alt", key: tile.key, alt });
    const r = await describePhotoAction(photoId, alt).catch(() => failed);
    if (r.ok) { changed(); closePanel(); return; }
    dispatch({ type: "alt", key: tile.key, alt: tile.alt });
    setPanelError(r.message);
  }

  function remove(tile: Tile) {
    const cur = latest.current.state;
    const item: StripRemoval = { tile, index: cur.tiles.findIndex((t) => t.key === tile.key) };
    if (claimed) {
      // After a claim buyers are told, so there is no Undo: it commits at once.
      dispatch({ type: "remove", key: tile.key });
      void commitRemoval(item);
    } else {
      queue.current?.remove(item);
      dispatch({ type: "remove", key: tile.key });
    }
    closePanel();
  }

  function undo() {
    const cur = latest.current.state;
    // The held removal is released only if the photo really goes back; with no room it stays queued.
    if (cur.removal && stripReducer(cur, { type: "undo" }).removal === null) queue.current?.undo();
    dispatch({ type: "undo" });
  }

  function gripUp(tile: Tile, e: PointerEvent<HTMLDivElement>) {
    setDragKey(null);
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-testid="photo-tile"]');
    const target = over?.getAttribute("data-tile-key");
    if (!target || target === tile.key) return;
    const cur = latest.current.state;
    const to = cur.tiles.findIndex((t) => t.key === target && t.status === "ready");
    if (to >= 0) reorder({ type: "drag", key: tile.key, to });
  }

  const toggle = (t: Tile) => { setPanelError(null); setPanel(panel?.key === t.key ? null : { key: t.key, mode: "menu" }); };
  const openAt = (t: Tile, mode: Mode) => { setPanelError(null); setPanel({ key: t.key, mode }); };
  const n = open ? state.tiles.indexOf(open) + 1 : 0;
  const readyIndex = open ? state.tiles.filter((t) => t.status === "ready").indexOf(open) : -1;

  return (
    <div data-testid="photo-strip" className="space-y-3">
      <p className="text-small text-ink-2">Photos of the items. Rules and specs go in the description.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button" data-testid="photo-add" disabled={!canAdd} aria-describedby={canAdd ? undefined : `${panelId}-why`}
          onClick={() => input.current?.click()} className={canAdd ? addClass : `${addClass} opacity-50 cursor-not-allowed`}
        >Add photos</button>
        <span data-testid="photo-count" className="text-small tabular text-ink-2">{`${state.tiles.length} of ${max} photos`}</span>
        {!canAdd && <span id={`${panelId}-why`} className="text-small text-ink-2">{NEED_FORM_NOTICE}</span>}
      </div>
      <input ref={input} type="file" accept={ACCEPT} multiple hidden data-testid="photo-input" onChange={onPick} />
      {uploading && (
        <p role="status" data-testid="photo-uploading-banner" className="text-small text-ink-2">Photos are still uploading. Stay on this page until they finish.</p>
      )}
      {state.notice && <p role="status" data-testid="photo-notice" className="text-small text-red">{state.notice}</p>}
      <div role="status" aria-live="polite">
        {state.removal && !claimed && (
          <p className="flex items-center gap-3 text-small">
            <span>Photo removed.</span>
            <Button variant="text" data-testid="photo-undo" onClick={undo}>Undo</Button>
          </p>
        )}
      </div>
      {state.tiles.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {state.tiles.map((t, i) => (
            <StripTile
              key={t.key} tile={t} index={i} lead={i === 0} dragging={dragKey === t.key} optionsOpen={open?.key === t.key} panelId={panelId}
              onOptions={() => toggle(t)} onRetry={() => dispatch({ type: "retry", key: t.key })} onCancel={() => cancel(t.key)}
              onGripDown={(e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no capture: the move still ends on pointerup */ } setDragKey(t.key); }}
              onGripUp={(e) => gripUp(t, e)} onGripCancel={() => setDragKey(null)}
            />
          ))}
        </ul>
      )}
      {open && (
        <div
          id={panelId} role="group" aria-label={`Photo ${n} options`} className="space-y-3 rounded-card border border-wire bg-card p-3"
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            closePanel();
            document.querySelector<HTMLElement>(`[data-testid="photo-options-${n}"]`)?.focus();
          }}
        >
          {panelError && <p role="alert" className="text-small text-red">{panelError}</p>}
          {panel?.mode === "menu" && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" aria-disabled={n === 1} onClick={() => { if (n > 1) reorder({ type: "lead", key: open.key }); }}>Make lead</Button>
              <Button variant="secondary" onClick={() => openAt(open, "tag")}>Tag</Button>
              <Button variant="secondary" onClick={() => { setDescribeText(open.alt); openAt(open, "describe"); }}>Describe</Button>
              <Button variant="secondary" aria-disabled={n === 1} onClick={() => { if (n > 1) reorder({ type: "move", key: open.key, by: -1 }); }}>Move earlier</Button>
              <Button variant="secondary" aria-disabled={readyIndex === readyCount - 1} onClick={() => { if (readyIndex < readyCount - 1) reorder({ type: "move", key: open.key, by: 1 }); }}>Move later</Button>
              <Button variant="secondary" onClick={() => (claimed ? openAt(open, "confirm") : remove(open))}>Remove</Button>
            </div>
          )}
          {panel?.mode === "tag" && (
            <fieldset className="space-y-1">
              <legend className="text-small font-semibold">Tag</legend>
              {[...prizes.map((x) => ({ id: x.slot, label: x.label, prize: x })), { id: "none", label: "No tag", prize: null }].map((o) => (
                <label key={o.id} className="flex min-h-11 items-center gap-3">
                  <input
                    type="radio" name={`${panelId}-tag`} checked={(open.slot ?? "none") === o.id} className="size-5 accent-[var(--ink)]"
                    onChange={() => { void tag(open, o.prize); }}
                  />
                  <span>{o.label}</span>
                </label>
              ))}
              <Button variant="text" onClick={() => openAt(open, "menu")}>Back</Button>
            </fieldset>
          )}
          {panel?.mode === "describe" && (
            <div className="space-y-2">
              <label htmlFor={`${panelId}-alt`} className="block text-small font-semibold">Describe</label>
              <input
                id={`${panelId}-alt`} value={describeText} maxLength={120} onChange={(e) => setDescribeText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void describe(open, describeText); } }}
                className="h-12 w-full rounded-input border border-wire-strong bg-card px-3"
              />
              <div className="flex gap-3">
                <Button onClick={() => { void describe(open, describeText); }}>Save description</Button>
                <Button variant="text" onClick={() => openAt(open, "menu")}>Back</Button>
              </div>
            </div>
          )}
          {panel?.mode === "confirm" && (
            <div className="space-y-2">
              <p>Buyers in this break will still see this photo, marked Removed.</p>
              <div className="flex gap-3">
                <Button onClick={() => remove(open)}>Remove photo</Button>
                <Button variant="secondary" onClick={() => openAt(open, "menu")}>Keep photo</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
