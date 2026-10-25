import { describe, expect, it } from "vitest";
import type { PhotoSrc } from "@/photos/urls";
import {
  canAddPhotos, canUndo, defaultAlt, initStrip, limitNotice, nextToStart, NO_ROOM_NOTICE, NEED_FORM_NOTICE, readyIds, stripReducer, uploadsInFlight,
  type AddGate, type StripAction, type StripPhoto, type StripState,
} from "./strip-state";

const src = (id: string): PhotoSrc => ({ src: `https://x.test/${id}-160.webp`, srcSet: `https://x.test/${id}-160.webp 160w`, width: 160, height: 120, alt: id });
const photo = (id: string, o: Partial<StripPhoto> = {}): StripPhoto => ({ photoId: id, src: src(id), slot: null, alt: `Alt ${id}`, ...o });
const files = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ key: `k${from + i}`, preview: `blob:${from + i}`, alt: "Strip break" }));
const run = (s: StripState, ...as: StripAction[]) => as.reduce(stripReducer, s);
const keys = (s: StripState) => s.tiles.map((t) => t.key);
const statuses = (s: StripState) => s.tiles.map((t) => t.status);
const ready3 = () => initStrip([photo("a"), photo("b"), photo("c")], 8);

describe("picking", () => {
  it("9 picks with 0 attached: 8 tiles queued, the 9th refused at once with the reason", () => {
    const s = run(initStrip([], 8), { type: "pick", files: files(9) });
    expect(s.tiles).toHaveLength(8);
    expect(keys(s)).toEqual(["k0", "k1", "k2", "k3", "k4", "k5", "k6", "k7"]);
    expect(s.tiles.every((t) => t.status === "queued" && t.progress === 0 && t.retryable && !t.altEdited)).toBe(true);
    expect(s.notice).toBe("Photos are limited to 8 per break. 1 photo was not added.");
    expect(nextToStart(s)).toEqual(["k0", "k1"]); // the reducer started nothing: no network yet
  });
  it("3 picks with 6 attached: 2 admitted, 1 refused", () => {
    const s = run(initStrip(["a", "b", "c", "d", "e", "f"].map((id) => photo(id)), 8), { type: "pick", files: files(3) });
    expect(keys(s)).toEqual(["a", "b", "c", "d", "e", "f", "k0", "k1"]);
    expect(s.notice).toBe("Photos are limited to 8 per break. 1 photo was not added.");
  });
  it("a full break refuses every pick with the plural sentence", () => {
    const full = initStrip(["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => photo(id)), 8);
    const s = run(full, { type: "pick", files: files(2) });
    expect(keys(s)).toEqual(keys(full));
    expect(statuses(s).every((x) => x === "ready")).toBe(true);
    expect(s.notice).toBe("Photos are limited to 8 per break. 2 photos were not added.");
  });
  it("unready tiles count against the limit too", () => {
    const s = run(initStrip([], 8), { type: "pick", files: files(6) }, { type: "pick", files: files(3, 6) });
    expect(keys(s)).toEqual(["k0", "k1", "k2", "k3", "k4", "k5", "k6", "k7"]);
    expect(s.notice).toBe(limitNotice(1));
  });
  it("a pick that fits clears an earlier notice", () => {
    const s = run(initStrip([], 8), { type: "notice", text: "old" }, { type: "pick", files: files(1) });
    expect(s.notice).toBeNull();
  });
  it("the same file twice is two tiles with two keys, both queued (no silent dedupe)", () => {
    const f = { key: "a", preview: "blob:1", alt: "T" };
    const s = run(initStrip([], 8), { type: "pick", files: [f, { ...f, key: "b" }] });
    expect(keys(s)).toEqual(["a", "b"]);
    expect(statuses(s)).toEqual(["queued", "queued"]);
    expect(nextToStart(s)).toEqual(["a", "b"]);
  });
  it("limitNotice: singular and plural", () => {
    expect(limitNotice(1)).toBe("Photos are limited to 8 per break. 1 photo was not added.");
    expect(limitNotice(2)).toBe("Photos are limited to 8 per break. 2 photos were not added.");
  });
});

describe("uploading", () => {
  it("two uploads at a time, and finishing still counts", () => {
    let s = run(initStrip([], 8), { type: "pick", files: files(3) });
    expect(nextToStart(s)).toEqual(["k0", "k1"]);
    s = run(s, { type: "start", key: "k0" }, { type: "start", key: "k1" });
    expect(nextToStart(s)).toEqual([]);
    s = run(s, { type: "finishing", key: "k0" });
    expect(statuses(s)).toEqual(["finishing", "uploading", "queued"]);
    expect(nextToStart(s)).toEqual([]);
    s = run(s, { type: "done", key: "k0", photoId: "p0", src: src("p0") });
    expect(nextToStart(s)).toEqual(["k2"]);
  });
  it("progress records the fraction", () => {
    const s = run(initStrip([], 8), { type: "pick", files: files(1) }, { type: "start", key: "k0" }, { type: "progress", key: "k0", fraction: 0.4 });
    expect(s.tiles[0]).toMatchObject({ status: "uploading", progress: 0.4 });
  });
  it("a finished upload joins after the last ready tile, and the first ready tile is the lead", () => {
    let s = run(initStrip([photo("x")], 8), { type: "pick", files: files(2) }, { type: "start", key: "k0" }, { type: "start", key: "k1" });
    s = run(s, { type: "done", key: "k1", photoId: "p1", src: src("p1") });
    expect(keys(s)).toEqual(["x", "k1", "k0"]);
    expect(statuses(s)).toEqual(["ready", "ready", "uploading"]);
    expect(readyIds(s)).toEqual(["x", "p1"]);
    expect(s.tiles[1]).toMatchObject({ photoId: "p1", src: src("p1") });
  });
  it("fail then retry: queued again, progress back to 0, the error cleared", () => {
    let s = run(initStrip([], 8), { type: "pick", files: files(1) }, { type: "start", key: "k0" }, { type: "progress", key: "k0", fraction: 0.5 },
      { type: "fail", key: "k0", error: "The upload didn't finish. Check your connection.", retryable: true });
    expect(s.tiles[0]).toMatchObject({ status: "failed", error: "The upload didn't finish. Check your connection.", retryable: true });
    expect(uploadsInFlight(s)).toBe(0);
    s = run(s, { type: "retry", key: "k0" });
    expect(s.tiles[0]).toMatchObject({ status: "queued", progress: 0, error: null });
  });
  it("online retries a failed, retryable tile once; a second failure stays failed", () => {
    const failed = (s: StripState) => run(s, { type: "start", key: "k0" }, { type: "fail", key: "k0", error: "e", retryable: true });
    let s = failed(run(initStrip([], 8), { type: "pick", files: files(1) }));
    s = run(s, { type: "online" });
    expect(s.tiles[0]).toMatchObject({ status: "queued", autoRetried: true });
    s = run(failed(s), { type: "online" });
    expect(s.tiles[0]).toMatchObject({ status: "failed", autoRetried: true });
  });
  it("online never retries a non-retryable failure", () => {
    const s = run(initStrip([], 8), { type: "pick", files: files(1) }, { type: "start", key: "k0" },
      { type: "fail", key: "k0", error: "This photo couldn't be uploaded. Pick it again.", retryable: false }, { type: "online" });
    expect(s.tiles[0]).toMatchObject({ status: "failed", autoRetried: false });
  });
  it("unreadable drops the tile and sets the spec's sentence", () => {
    const s = run(initStrip([], 8), { type: "pick", files: files(2) }, { type: "start", key: "k0" }, { type: "unreadable", key: "k0" });
    expect(keys(s)).toEqual(["k1"]);
    expect(s.notice).toBe("This photo can't be read here. Pick a JPEG or PNG.");
  });
  it("cancel drops an unready tile without a removal record, but never a finishing one", () => {
    const s = run(initStrip([], 8), { type: "pick", files: files(2) }, { type: "start", key: "k0" }, { type: "start", key: "k1" }, { type: "finishing", key: "k1" });
    const c = run(s, { type: "cancel", key: "k0" });
    expect(keys(c)).toEqual(["k1"]);
    expect(c.removal).toBeNull();
    expect(run(s, { type: "cancel", key: "k1" })).toBe(s);
  });
  it("uploadsInFlight counts queued, uploading and finishing, not failed or ready", () => {
    const s = run(initStrip([photo("a")], 8), { type: "pick", files: files(4) },
      { type: "start", key: "k0" }, { type: "start", key: "k1" }, { type: "finishing", key: "k1" },
      { type: "fail", key: "k0", error: "e", retryable: true });
    expect(statuses(s)).toEqual(["ready", "failed", "finishing", "queued", "queued"]);
    expect(uploadsInFlight(s)).toBe(3);
  });
});

describe("ordering", () => {
  it("lead, move and drag act on ready tiles only and keep unready ones last", () => {
    const base = run(ready3(), { type: "pick", files: files(1) });
    expect(keys(run(base, { type: "lead", key: "c" }))).toEqual(["c", "a", "b", "k0"]);
    expect(keys(run(base, { type: "move", key: "a", by: 1 }))).toEqual(["b", "a", "c", "k0"]);
    expect(keys(run(base, { type: "drag", key: "a", to: 2 }))).toEqual(["b", "c", "a", "k0"]);
    expect(keys(run(base, { type: "drag", key: "a", to: 9 }))).toEqual(["b", "c", "a", "k0"]); // clamped to the last ready index
    expect(run(base, { type: "lead", key: "k0" })).toBe(base); // an unready tile cannot lead
    expect(run(base, { type: "drag", key: "k0", to: 0 })).toBe(base);
    expect(readyIds(run(base, { type: "lead", key: "c" }))).toEqual(["c", "a", "b"]);
  });
  it("move by -1 on the lead and by +1 on the last ready tile change nothing", () => {
    const base = run(ready3(), { type: "pick", files: files(1) });
    expect(run(base, { type: "move", key: "a", by: -1 })).toBe(base);
    expect(run(base, { type: "move", key: "c", by: 1 })).toBe(base); // never past the unready tile
  });
  it("order re-syncs the ready tiles to the server's order", () => {
    const base = run(ready3(), { type: "pick", files: files(1) });
    expect(keys(run(base, { type: "order", ids: ["c", "a", "b"] }))).toEqual(["c", "a", "b", "k0"]);
  });
});

describe("removing", () => {
  it("remove takes a ready tile out and records its index; undo restores it there", () => {
    const base = ready3();
    const s = run(base, { type: "remove", key: "b" });
    expect(keys(s)).toEqual(["a", "c"]);
    expect(s.removal).toEqual({ tile: base.tiles[1], index: 1 });
    const u = run(s, { type: "undo" });
    expect(keys(u)).toEqual(["a", "b", "c"]);
    expect(u.removal).toBeNull();
  });
  it("removalDone clears only the record it names", () => {
    const base = ready3();
    const s = run(base, { type: "remove", key: "b" });
    expect(run(s, { type: "removalDone", photoId: "b" }).removal).toBeNull();
    expect(keys(run(s, { type: "removalDone", photoId: "b" }))).toEqual(["a", "c"]);
    const t = run(s, { type: "remove", key: "a" }); // a second removal replaces the record
    expect(t.removal).toEqual({ tile: base.tiles[0], index: 0 });
    expect(run(t, { type: "removalDone", photoId: "b" }).removal).toEqual(t.removal);
  });
  it("once the removal is handed to the server, Undo is gone: undo changes nothing (I2)", () => {
    const base = ready3();
    const s = run(base, { type: "remove", key: "b" }, { type: "committing", photoId: "b" });
    expect(s.removal).toEqual({ tile: base.tiles[1], index: 1, committing: true });
    expect(canUndo(s)).toBe(false);
    expect(run(s, { type: "undo" })).toBe(s); // the photo does not come back while the server deletes it
    expect(run(s, { type: "removalDone", photoId: "b" }).removal).toBeNull();
  });
  it("committing names its removal: another photo's commit leaves the current record undoable", () => {
    const s = run(ready3(), { type: "remove", key: "b" });
    expect(canUndo(s)).toBe(true);
    const t = run(s, { type: "committing", photoId: "a" });
    expect(t).toBe(s);
    expect(canUndo(t)).toBe(true);
  });
  it("a failed commit still puts the tile back after committing", () => {
    const s = run(ready3(), { type: "remove", key: "b" }, { type: "committing", photoId: "b" });
    const f = run(s, { type: "removeFailed", removal: s.removal!, error: "Couldn't remove the photo. Try again." });
    expect(keys(f)).toEqual(["a", "b", "c"]);
    expect(f.removal).toBeNull();
  });
  it("removeFailed puts the tile back at its index and shows the error", () => {
    const base = ready3();
    const s = run(base, { type: "remove", key: "b" });
    const f = run(s, { type: "removeFailed", removal: s.removal!, error: "Couldn't remove the photo. Try again." });
    expect(keys(f)).toEqual(["a", "b", "c"]);
    expect(f.removal).toBeNull();
    expect(f.notice).toBe("Couldn't remove the photo. Try again.");
  });
  it("a pending removal holds its place: with 8 photos, remove one then pick one is refused until it commits", () => {
    const full = initStrip(["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => photo(id)), 8);
    const s = run(full, { type: "remove", key: "c" }, { type: "pick", files: files(1) });
    expect(s.tiles).toHaveLength(7);
    expect(s.notice).toBe(limitNotice(1));
    const after = run(s, { type: "removalDone", photoId: "c" }, { type: "pick", files: files(1) });
    expect(after.tiles).toHaveLength(8);
    expect(after.notice).toBeNull();
  });
  it("with 6 photos and one removal waiting, 3 picks admit 2 (the held place counts)", () => {
    const s = run(initStrip(["a", "b", "c", "d", "e", "f"].map((id) => photo(id)), 8), { type: "remove", key: "a" }, { type: "pick", files: files(3) });
    expect(s.tiles).toHaveLength(7);
    expect(s.notice).toBe(limitNotice(1));
  });
  it("undo never exceeds the limit: a full strip refuses it with a notice and keeps the record", () => {
    const removed = run(ready3(), { type: "remove", key: "b" });
    const crowded = { ...removed, max: 2 };
    const u = run(crowded, { type: "undo" });
    expect(u.tiles).toHaveLength(2);
    expect(u.removal).toBe(removed.removal);
    expect(u.notice).toBe(NO_ROOM_NOTICE);
  });
  it("remove on an unready tile does nothing (Cancel is its action)", () => {
    const s = run(initStrip([], 8), { type: "pick", files: files(1) });
    expect(run(s, { type: "remove", key: "k0" })).toBe(s);
  });
});

describe("tags and alt text", () => {
  const uploaded = () => run(initStrip([], 8), { type: "pick", files: files(1) }, { type: "start", key: "k0" }, { type: "done", key: "k0", photoId: "p0", src: src("p0") });
  it("tag rewrites an alt the host never edited", () => {
    const t = run(uploaded(), { type: "tag", key: "k0", slot: "s1", defaultAlt: "Taylor Chronos 24g" });
    expect(t.tiles[0]).toMatchObject({ slot: "s1", alt: "Taylor Chronos 24g", altEdited: false });
  });
  it("tag keeps an edited alt", () => {
    const e = run(uploaded(), { type: "alt", key: "k0", alt: "My own words" }, { type: "tag", key: "k0", slot: "s1", defaultAlt: "Taylor Chronos 24g" });
    expect(e.tiles[0]).toMatchObject({ slot: "s1", alt: "My own words", altEdited: true });
  });
  it("a photo loaded from the server keeps its alt on retag", () => {
    const t = run(initStrip([photo("a", { alt: "Saved words" })], 8), { type: "tag", key: "a", slot: "s1", defaultAlt: "Taylor Chronos 24g" });
    expect(t.tiles[0]).toMatchObject({ slot: "s1", alt: "Saved words", altEdited: true });
  });
  it("slots clears the tag of a tile whose prize field was removed", () => {
    const s = run(initStrip([photo("a", { slot: "s1" }), photo("b", { slot: "s2" }), photo("c")], 8), { type: "slots", valid: ["s1"] });
    expect(s.tiles.map((t) => t.slot)).toEqual(["s1", null, null]);
  });
  it("defaultAlt is the tagged name, else the title, trimmed, cut to 120 characters and never empty", () => {
    expect(defaultAlt({ itemName: "Taylor Chronos 24g", title: "T" })).toBe("Taylor Chronos 24g");
    expect(defaultAlt({ itemName: null, title: "  Chronos night " })).toBe("Chronos night");
    expect(defaultAlt({ itemName: "   ", title: "Chronos night" })).toBe("Chronos night");
    expect(defaultAlt({ itemName: null, title: "x".repeat(200) })).toBe("x".repeat(120));
    expect(defaultAlt({ itemName: null, title: "   " })).toBe("Photo of the items");
  });
});

describe("canAddPhotos (panel ruling 21)", () => {
  const ok: AddGate = { title: "Strip break", lineCount: 10, price: "5", maxLines: 100, topSpot: { name: "Chronos 22g", condition: "new_in_box" } };
  it("true for a form that could be saved as a draft", () => {
    expect(canAddPhotos(ok)).toBe(true);
    expect(canAddPhotos({ ...ok, price: "$5" })).toBe(true);
    expect(canAddPhotos({ ...ok, price: "1,000" })).toBe(true);
  });
  it("needs a title", () => {
    expect(canAddPhotos({ ...ok, title: "   " })).toBe(false);
  });
  it("needs 2 to maxLines lines", () => {
    expect(canAddPhotos({ ...ok, lineCount: 1 })).toBe(false);
    expect(canAddPhotos({ ...ok, lineCount: 101 })).toBe(false);
    expect(canAddPhotos({ ...ok, lineCount: 100 })).toBe(true);
  });
  it("needs a price the composer's parser accepts", () => {
    for (const price of ["", "0", "abc", "0.001", "10001"]) expect(canAddPhotos({ ...ok, price })).toBe(false);
  });
  it("needs a named top spot with a condition", () => {
    expect(canAddPhotos({ ...ok, topSpot: null })).toBe(false);
    expect(canAddPhotos({ ...ok, topSpot: { name: "  ", condition: "used" } })).toBe(false);
    expect(canAddPhotos({ ...ok, topSpot: { name: "Chronos 22g", condition: "" } })).toBe(false);
    expect(canAddPhotos({ ...ok, topSpot: { name: "Chronos 22g", condition: "mint" } })).toBe(false);
  });
  it("the reason names all three", () => {
    expect(NEED_FORM_NOTICE).toBe("Add a title, a price and the top spot first.");
  });
});
