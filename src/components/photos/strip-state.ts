// Pure state for the photo strip: no DOM, no React, no crypto (every key comes from the caller).
import type { PhotoSrc } from "@/photos/urls";
import { isItemCondition } from "@/domain/breaks/condition";

export type StripPhoto = { photoId: string; src: PhotoSrc; slot: string | null; alt: string };
export type TileStatus = "queued" | "uploading" | "finishing" | "failed" | "ready";
export type StripTile = {
  key: string; photoId: string | null; status: TileStatus; progress: number; preview: string | null; src: PhotoSrc | null;
  slot: string | null; alt: string; altEdited: boolean; error: string | null; retryable: boolean; autoRetried: boolean;
};
export type StripRemoval = { tile: StripTile; index: number };
export type StripState = { tiles: StripTile[]; notice: string | null; removal: StripRemoval | null; max: number };
export type StripAction =
  | { type: "pick"; files: { key: string; preview: string; alt: string }[] }
  | { type: "start"; key: string } | { type: "progress"; key: string; fraction: number } | { type: "finishing"; key: string }
  | { type: "done"; key: string; photoId: string; src: PhotoSrc }
  | { type: "fail"; key: string; error: string; retryable: boolean }
  | { type: "retry"; key: string } | { type: "online" } | { type: "unreadable"; key: string }
  | { type: "cancel"; key: string }
  | { type: "lead"; key: string } | { type: "move"; key: string; by: -1 | 1 } | { type: "drag"; key: string; to: number }
  | { type: "order"; ids: string[] }
  | { type: "tag"; key: string; slot: string | null; defaultAlt: string } | { type: "alt"; key: string; alt: string }
  | { type: "slots"; valid: string[] }
  | { type: "remove"; key: string } | { type: "undo" }
  | { type: "removalDone"; photoId: string }
  | { type: "removeFailed"; removal: StripRemoval; error: string }
  | { type: "notice"; text: string | null };

export const UNREADABLE_NOTICE = "This photo can't be read here. Pick a JPEG or PNG.";
export const NEED_FORM_NOTICE = "Add a title, a price and the top spot first.";
const MAX_ALT = 120;
const FALLBACK_ALT = "Photo of the items";

export function limitNotice(notAdded: number): string {
  return `Photos are limited to 8 per break. ${notAdded} ${notAdded === 1 ? "photo was" : "photos were"} not added.`;
}

export function initStrip(photos: readonly StripPhoto[], max: number): StripState {
  return {
    tiles: photos.map((p) => ({
      key: p.photoId, photoId: p.photoId, status: "ready", progress: 1, preview: null, src: p.src, slot: p.slot, alt: p.alt,
      altEdited: true, error: null, retryable: false, autoRetried: false,
    })),
    notice: null, removal: null, max,
  };
}

const readyCount = (tiles: readonly StripTile[]) => tiles.filter((t) => t.status === "ready").length;
const indexOf = (s: StripState, key: string) => s.tiles.findIndex((t) => t.key === key);
const patch = (s: StripState, key: string, from: TileStatus[], change: Partial<StripTile>): StripState => {
  const i = indexOf(s, key);
  if (i < 0 || !from.includes(s.tiles[i].status)) return s;
  const tiles = s.tiles.slice();
  tiles[i] = { ...tiles[i], ...change };
  return { ...s, tiles };
};
/** Moves the ready tile at index `from` to index `to`, clamped to the ready run. */
function moveReady(s: StripState, from: number, to: number): StripState {
  const target = Math.max(0, Math.min(to, readyCount(s.tiles) - 1));
  if (from === target) return s;
  const tiles = s.tiles.slice();
  const [t] = tiles.splice(from, 1);
  tiles.splice(target, 0, t);
  return { ...s, tiles };
}
const insertReady = (tiles: StripTile[], tile: StripTile, index: number): StripTile[] => {
  const out = tiles.slice();
  out.splice(Math.max(0, Math.min(index, readyCount(out))), 0, tile);
  return out;
};

export function stripReducer(s: StripState, a: StripAction): StripState {
  switch (a.type) {
    case "pick": {
      const room = Math.max(0, s.max - s.tiles.length);
      const admitted = a.files.slice(0, room);
      const refused = a.files.length - admitted.length;
      const added: StripTile[] = admitted.map((f) => ({
        key: f.key, photoId: null, status: "queued", progress: 0, preview: f.preview, src: null, slot: null, alt: f.alt,
        altEdited: false, error: null, retryable: true, autoRetried: false,
      }));
      const notice = refused > 0 ? limitNotice(refused) : null;
      if (added.length === 0 && notice === s.notice) return s;
      return { ...s, tiles: [...s.tiles, ...added], notice };
    }
    case "start": return patch(s, a.key, ["queued"], { status: "uploading", progress: 0 });
    case "progress": return patch(s, a.key, ["uploading"], { progress: Math.max(0, Math.min(1, a.fraction)) });
    case "finishing": return patch(s, a.key, ["uploading"], { status: "finishing", progress: 1 });
    case "done": {
      const i = indexOf(s, a.key);
      if (i < 0 || !["uploading", "finishing"].includes(s.tiles[i].status)) return s;
      const done: StripTile = { ...s.tiles[i], status: "ready", progress: 1, photoId: a.photoId, src: a.src, error: null };
      const rest = s.tiles.filter((_, j) => j !== i);
      return { ...s, tiles: insertReady(rest, done, readyCount(rest)) };
    }
    case "fail": return patch(s, a.key, ["queued", "uploading", "finishing"], { status: "failed", error: a.error, retryable: a.retryable });
    case "retry": return patch(s, a.key, ["failed"], { status: "queued", progress: 0, error: null });
    case "online": {
      let changed = false;
      const tiles = s.tiles.map((t) => {
        if (t.status !== "failed" || !t.retryable || t.autoRetried) return t;
        changed = true;
        return { ...t, status: "queued" as const, progress: 0, error: null, autoRetried: true };
      });
      return changed ? { ...s, tiles } : s;
    }
    case "unreadable": {
      const i = indexOf(s, a.key);
      if (i < 0 || s.tiles[i].status === "ready") return s;
      return { ...s, tiles: s.tiles.filter((_, j) => j !== i), notice: UNREADABLE_NOTICE };
    }
    case "cancel": {
      const i = indexOf(s, a.key);
      if (i < 0 || ["ready", "finishing"].includes(s.tiles[i].status)) return s;
      return { ...s, tiles: s.tiles.filter((_, j) => j !== i) };
    }
    case "lead": {
      const i = indexOf(s, a.key);
      if (i < 0 || s.tiles[i].status !== "ready") return s;
      return moveReady(s, i, 0);
    }
    case "move": {
      const i = indexOf(s, a.key);
      if (i < 0 || s.tiles[i].status !== "ready") return s;
      const to = i + a.by;
      if (to < 0 || to >= readyCount(s.tiles)) return s;
      return moveReady(s, i, to);
    }
    case "drag": {
      const i = indexOf(s, a.key);
      if (i < 0 || s.tiles[i].status !== "ready") return s;
      return moveReady(s, i, a.to);
    }
    case "order": {
      const ready = s.tiles.filter((t) => t.status === "ready");
      const rank = (t: StripTile) => { const r = a.ids.indexOf(t.photoId ?? ""); return r < 0 ? a.ids.length : r; };
      const sorted = ready.map((t, j) => ({ t, j })).sort((x, y) => rank(x.t) - rank(y.t) || x.j - y.j).map((x) => x.t);
      if (sorted.every((t, j) => t === ready[j])) return s;
      return { ...s, tiles: [...sorted, ...s.tiles.filter((t) => t.status !== "ready")] };
    }
    case "tag": {
      const i = indexOf(s, a.key);
      if (i < 0 || s.tiles[i].status !== "ready") return s;
      const t = s.tiles[i];
      const alt = t.altEdited ? t.alt : a.defaultAlt;
      if (t.slot === a.slot && t.alt === alt) return s;
      return patch(s, a.key, ["ready"], { slot: a.slot, alt });
    }
    case "alt": return patch(s, a.key, ["ready"], { alt: a.alt, altEdited: true });
    case "slots": {
      let changed = false;
      const tiles = s.tiles.map((t) => {
        if (t.slot === null || a.valid.includes(t.slot)) return t;
        changed = true;
        return { ...t, slot: null };
      });
      return changed ? { ...s, tiles } : s;
    }
    case "remove": {
      const i = indexOf(s, a.key);
      if (i < 0 || s.tiles[i].status !== "ready") return s;
      return { ...s, tiles: s.tiles.filter((_, j) => j !== i), removal: { tile: s.tiles[i], index: i } };
    }
    case "undo": {
      if (!s.removal) return s;
      return { ...s, tiles: insertReady(s.tiles, s.removal.tile, s.removal.index), removal: null };
    }
    case "removalDone":
      return s.removal && s.removal.tile.photoId === a.photoId ? { ...s, removal: null } : s;
    case "removeFailed": {
      const tiles = s.tiles.some((t) => t.key === a.removal.tile.key) ? s.tiles : insertReady(s.tiles, a.removal.tile, a.removal.index);
      const removal = s.removal && s.removal.tile.photoId === a.removal.tile.photoId ? null : s.removal;
      return { ...s, tiles, removal, notice: a.error };
    }
    case "notice": return s.notice === a.text ? s : { ...s, notice: a.text };
  }
}

/** Queued keys to start now: at most `limit` uploads at once, and a finishing tile still counts. */
export function nextToStart(s: StripState, limit = 2): string[] {
  const active = s.tiles.filter((t) => t.status === "uploading" || t.status === "finishing").length;
  return s.tiles.filter((t) => t.status === "queued").slice(0, Math.max(0, limit - active)).map((t) => t.key);
}
export function uploadsInFlight(s: StripState): number {
  return s.tiles.filter((t) => t.status === "queued" || t.status === "uploading" || t.status === "finishing").length;
}
export function readyIds(s: StripState): string[] {
  return s.tiles.flatMap((t) => (t.status === "ready" && t.photoId ? [t.photoId] : []));
}

export function defaultAlt(p: { itemName: string | null; title: string }): string {
  const cut = (v: string) => v.trim().slice(0, MAX_ALT).trim();
  return cut(p.itemName ?? "") || cut(p.title) || FALLBACK_ALT;
}

export type AddGate = { title: string; lineCount: number; price: string; maxLines: number; topSpot: { name: string; condition: string } | null };
/** True once the draft could be saved: the checks `parseComposer` makes for title, lines, price and the top spot. */
export function canAddPhotos(f: AddGate): boolean {
  if (f.title.trim() === "") return false;
  if (!Number.isInteger(f.lineCount) || f.lineCount < 2 || f.lineCount > f.maxLines) return false;
  const cleaned = f.price.replace(/[$,\s]/g, "");
  const dollars = Number(cleaned);
  if (cleaned === "" || !Number.isFinite(dollars) || dollars < 0.01 || dollars > 10000) return false;
  return !!f.topSpot && f.topSpot.name.trim() !== "" && isItemCondition(f.topSpot.condition);
}
