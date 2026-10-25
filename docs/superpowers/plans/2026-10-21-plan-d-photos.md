# Plan D: Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hosts add up to 8 photos of the items in a break, each optionally tagged with a prize and every prize
carrying a condition; buyers see the lead photo on the feed card and the link preview, a plate and a Prizes block on
the break page, and a viewer for all of them; after the first claim every removal, new lead or prize move is recorded
and announced to buyers, and holders keep seeing removed photos.

**Architecture:** Supabase Storage with four buckets (`incoming`, `photos-draft`, `photos`, `photo-archive`) and no
client policies; uploads go browser → signed URL → `incoming` under a single-use ticket, then a Node route handler
re-encodes with sharp into three WebP variants. A `break_photos` table (positions 0..n−1, the lead at 0) is changed
only by domain commands that lock the break row, guarded by a status trigger; prize tags point at a new stable
`prizes.slot_key`. Pages render server-side plates; the viewer is a lazily loaded native `<dialog>`.

**Tech Stack:** Next.js 16.4 (App Router, Turbopack, `next/og`), React 19.3, TypeScript 6.0, Tailwind CSS 4,
Drizzle ORM 0.45 + drizzle-kit 0.31 with hand SQL, postgres-js, Supabase (Postgres, Auth, Storage via
`@supabase/supabase-js` 2.118), sharp (new, direct, pinned), zod 4, vitest 5, Playwright + `@axe-core/playwright`.
Node 24.22, pnpm 12.14.

**Spec:** `docs/superpowers/specs/2026-10-21-photos-design.md` (the authority for every value in this plan; its §13
lists what it amends), with `docs/superpowers/specs/2026-10-14-mosaic-ui-design.md` (Mosaic) for everything on screen
the photos spec does not cover.

## Global Constraints

Plan C's Global Constraints (`docs/superpowers/plans/2026-10-14-plan-c-mosaic.md`, the section of that name, with the
Plan B and Plan A lists it carries) apply verbatim. Added for this plan:

- **Every value comes from the photos spec.** Sizes (plates 40, 48, 64 px; the break page plate 64 px in a 72 px
  mat; viewer buttons 44 px), limits (8 photos, alt 1–120 characters, 5 MB incoming, 12 megapixels decoded, variants
  160/640/1600 px, 2048 px client shrink at JPEG quality 0.85), durations (ticket 5 minutes, signed reads 10 minutes,
  cache one hour, preview five minutes, retention 180 days, cleanup 24 hours) and copy strings are copied from it. If a
  step and the spec disagree, the spec wins and the implementer reports the mismatch.
- **The plate** (spec §8.0): `--board-wall-2` 3 px mat, `--board-steel` 1 px keyline on board surfaces; no mat and a
  `--wire-strong` keyline on paper surfaces; never 44.75 px or another board pitch; never the kit frame, the lamp or a
  flight colour; never in the caller banner or the reveal; the image never tinted.
- **Privacy:** a stranger, the feed, the landing page, the host profile and the link preview never receive a draft
  photo, a removed photo, a hidden photo, a signed URL, a storage path of `photos-draft` or `photo-archive`, or anything
  from `photo_uploads` or `photo_notices_seen`. `ogModel` stays free of holder, handle and flight data.
- **Storage:** no `storage.objects` policy for the `anon` or `authenticated` roles on any bucket; every write uses the
  service role or a signed upload URL. Published files are server re-encodes only. The project has no
  content-security policy today; this plan adds none (spec §5.5's CSP line has nothing to amend).
- **One migration, forward-only:** `0005_photos` via `pnpm db:generate --name photos` plus hand SQL after a
  `--> statement-breakpoint`, applied to `postgres`, `breaks_test` and `breaks_e2e`.
- **Copy:** every new string passes `src/lib/copy-audit.test.ts`; nothing claims the platform verified a photo; no
  heat words, no "You won"; "the host's", never "his".
- **Gates per task:** `pnpm exec tsc --noEmit`, `pnpm lint` (clean, no warnings), `pnpm test` (sandbox off),
  `pnpm test:concurrency` and `pnpm test:ci` where the database or Storage changes, full e2e on `breaks_e2e` (sandbox
  off; `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill` first). Every command runs with
  `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH`. No flake tolerated.

## Review Focus

1. **Odd images.** A 10:1 panorama, a 100 × 100 px photo (smaller than the 160 variant), a transparent PNG and a
   portrait phone photo with an orientation tag: the plate crops square without stretching, no variant is upscaled
   past its source, transparency shows the mat colour, and the portrait photo stands upright. Tests in Task 4
   (`process.test.ts`) and Task 8 (`plate.test.ts`).
2. **The last photo goes.** The host removes the only photo of an open break after a claim: the plate disappears, the
   feed card falls back to the kit thumbnail, the notice reads that place's removal sentence ("Top-spot photo
   removed", or "Photo removed" when untagged; ruling 1), and holders still see it marked Removed. Tests in Task 5
   (`notice.test.ts`) and Task 12 (e2e).
3. **An abandoned upload.** The host picks a photo, the upload starts, and they leave or the ticket's 5 minutes run
   out: no row, no published file, the ticket counts against nothing after it expires, and the cleanup removes the
   incoming file. Tests in Task 5 (`tickets.test.ts`) and Task 11 (`photo-cleanup.test.ts`).
4. **The same photo twice, and 9 picks.** A host multi-selects 9 photos with 0 already attached: 8 upload and the 9th
   says why at once, before any network call; picking the same file twice uploads it twice (no silent dedupe). Tests
   in Task 7 (`strip-state.test.ts`).
5. **The viewer at the edges.** 320 px wide, a landscape phone, one photo (no Previous or Next), and a keyboard user:
   the photo fits without sideways scroll, the buttons hide when there is nowhere to go, and Escape returns focus to
   the plate. Tests in Task 8 (e2e in `e2e/photos.spec.ts`).

## Cross-task contracts (every writer and implementer uses these names)

```ts
// src/storage/buckets.ts (Task 1)
export const BUCKETS = { incoming: "incoming", draft: "photos-draft", public: "photos", archive: "photo-archive" } as const;
export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];
export const VARIANT_WIDTHS = [160, 640, 1600] as const;
export type VariantWidth = (typeof VARIANT_WIDTHS)[number];
/** A photo's storage prefix is `${breakId}/${random}` (22 url-safe base64 characters, 128 bits). */
export const PREFIX_PATTERN: RegExp; // /^[0-9a-f-]{36}\/[A-Za-z0-9_-]{22}$/
export function variantPath(prefix: string, w: VariantWidth): string; // `${prefix}-${w}.webp`
export function publicVariantUrl(prefix: string, w: VariantWidth): string; // from SUPABASE_URL, bucket `photos` only

// src/storage/photo-storage.ts (Task 1): the only module that talks to Supabase Storage.
export interface PhotoStorage {
  createSignedUpload(name: string): Promise<{ url: string; token: string }>; // into `incoming`, 5 minutes, no upsert
  download(bucket: BucketName, path: string, maxBytes: number): Promise<Buffer>; // throws past maxBytes
  put(bucket: BucketName, path: string, body: Buffer, contentType: "image/webp"): Promise<void>; // cacheControl 3600
  copy(from: { bucket: BucketName; path: string }, to: { bucket: BucketName; path: string }): Promise<void>; // idempotent
  remove(bucket: BucketName, paths: string[]): Promise<void>; // missing paths are not an error
  signedReadUrl(bucket: BucketName, path: string, seconds: number): Promise<string>;
  list(bucket: BucketName, prefix: string): Promise<{ name: string; createdAt: Date }[]>;
}
export function photoStorage(): PhotoStorage; // its own service-role client with a 5 s timed fetch (Task 1); createPhotoStorage({ url, serviceRoleKey, timeoutMs }) for tests and scripts
// tests/helpers/memory-storage.ts (Task 1): createMemoryStorage(): PhotoStorage & { files: Map<string, Buffer> }

// src/photos/process.ts (Task 4): pure Node, no database, no storage.
export const MAX_INCOMING_BYTES = 5 * 1024 * 1024;
export class UnsupportedImage extends Error {}
export type Processed = { width: number; height: number; variants: { width: VariantWidth; body: Buffer }[] };
export async function processPhoto(input: Buffer): Promise<Processed>; // throws UnsupportedImage

// src/domain/photos/types.ts (Task 5)
export type ItemCondition = "new_in_box" | "new_opened" | "used"; // also used by Task 3
export const CONDITION_LABEL: Record<ItemCondition, string>; // "New in box", "New, opened", "Used"
export const MAX_PHOTOS = 8;
export type PhotoLocation = "photos-draft" | "photos" | "photo-archive";
export type PhotoChange =
  | { kind: "added" }
  | { kind: "removed"; slot: string | null; wasLead: boolean }
  | { kind: "lead"; } // a different photo became position 0, not by removal
  | { kind: "reordered" } // lead unchanged
  | { kind: "retagged"; from: string | null; to: string | null };
/** The spec §6 sentence for one committed action, or null when it does not count. Pure. */
export function noticeFor(changes: readonly PhotoChange[], placeOf: (slot: string | null) => string): string | null;

// src/domain/photos/commands.ts (Task 5): each locks the break row first (lockBreak/assertHostOf).
export async function issueUploadTicket(tx: Tx, caller: Caller, p: { breakId: string; now: Date }): Promise<{ ticketId: string; incomingName: string }>;
export async function recordProcessedPhoto(tx: Tx, caller: Caller, p: { ticketId: string; prefix: string; location: "photos-draft" | "photos"; width: number; height: number; slot: string | null; alt: string; now: Date }): Promise<{ photoId: string; location: PhotoLocation }>;
export async function removePhoto(tx: Tx, caller: Caller, p: { photoId: string; now: Date }): Promise<{ prefix: string; from: PhotoLocation; archive: boolean }>;
export async function reorderPhotos(tx: Tx, caller: Caller, p: { breakId: string; order: string[]; now: Date }): Promise<void>; // the lead is order[0]
export async function retagPhoto(tx: Tx, caller: Caller, p: { photoId: string; slot: string | null; now: Date }): Promise<void>;
export async function describePhoto(tx: Tx, caller: Caller, p: { photoId: string; alt: string }): Promise<void>;
export async function hidePhoto(tx: Tx, caller: Caller, p: { photoId: string; reason: string; now: Date }): Promise<{ prefix: string | null; from: PhotoLocation }>; // admin or SYSTEM
export async function markPhotoNoticeSeen(tx: Tx, caller: Caller, p: { breakId: string; now: Date }): Promise<void>;

// src/domain/photos/queries.ts (Task 5)
export type PhotoView = { id: string; position: number; slot: string | null; alt: string; width: number; height: number; location: PhotoLocation; prefix: string };
export type RemovedPhotoView = { id: string; slot: string | null; alt: string; width: number; height: number; removedAt: Date; location: "photo-archive"; prefix: string | null }; // prefix null once the archive dropped it
export type BreakPhotos = { live: PhotoView[]; removed: RemovedPhotoView[]; notice: { text: string; at: Date } | null; unseen: boolean };
export async function breakPhotos(tx: Tx, breakId: string, viewer: { id: string; isHost: boolean; isHolder: boolean; isAdmin: boolean } | null): Promise<BreakPhotos>;
export async function leadPhotos(tx: Tx, breakIds: readonly string[]): Promise<Map<string, PhotoView>>; // public locations only: feed, /me, /host, profile, og
// src/photos/urls.ts (Task 6): turns a PhotoView/RemovedPhotoView into srcset URLs (public URL or a 10-minute signed URL).
export type PhotoSrc = { src: string; srcSet: string; width: number; height: number; alt: string };
export async function photoSrc(storage: PhotoStorage, v: { location: PhotoLocation; prefix: string; width: number; height: number; alt: string }, size: VariantWidth): Promise<PhotoSrc>; // public location: plain URLs; others: 10-minute signed URLs

// src/domain/breaks/commands.ts (Task 3): changed inputs and two new commands
//   CreateDraftInput.items[i] and .secondPlace[i] gain { slotKey: string; condition: ItemCondition }.
//   createDraft gains an optional client id: createDraft(tx, caller, input, { breakId?: string }) — idempotent for the same host.
export async function deleteDraft(tx: Tx, caller: Caller, breakId: string): Promise<{ photos: { location: PhotoLocation; prefix: string }[] }>;
//   openBreak flips every live photo's location from photos-draft to photos (the copy ran before, Task 6).

// Routes and actions (Task 6)
//   POST /api/photos/finalise  body { ticketId: string; slot: string | null; alt: string }
//     → 200 { photoId: string } | 4xx { error: string } (copy from the spec), runtime nodejs, maxDuration 30
//   src/app/photos/actions.ts: requestPhotoUpload(breakId) → ActionResult<{ ticketId; uploadUrl; token }>,
//     removePhotoAction(photoId), reorderPhotosAction(breakId, order), retagPhotoAction(photoId, slot),
//     describePhotoAction(photoId, alt), markPhotoNoticeSeenAction(breakId), deleteDraftAction(breakId)
//   openBreakAction (src/app/b/[id]/host-actions.ts) copies draft photos to `photos` before its transaction.

// UI (Tasks 7–9)
//   src/components/photos/plate.tsx      Plate({ photo: PhotoSrc; size: 40 | 48 | 64 | 96; surface: "board" | "paper"; decorative?: boolean })
//                                        `size` is the image box; the outer box is size+8 on board, size+2 on paper.
//                                        Root carries data-testid="plate", data-size, data-surface.
//   src/components/photos/photo-strip.tsx PhotoStrip (client): the composer strip and the "Edit photos" sheet
//   src/components/photos/shrink.ts       shrinkForUpload(file: File): Promise<Blob> (2048 px, JPEG 0.85) | throws CannotRead
//   src/components/photos/photo-viewer.tsx PhotoViewer (client, lazy): the native <dialog>
//   src/components/photos/prizes-block.tsx PrizesBlock (server): spec §8.2 "Prizes", also on the result page
```

## Recorded rulings (from the spec's open points the plan has to settle)

1. **The lead after the last photo is removed**: no plate, no feed photo; the notice is the removal sentence for that
   photo's place ("Top-spot photo removed", "2nd-place photo removed", "Photo removed" when untagged), not "Lead photo
   replaced". "Lead photo replaced" is for a removal of the lead that leaves another photo at position 0, and for a
   reorder that changes position 0.
2. **Several counting changes in one committed action** (a drag that moves two photos and changes the lead counts as
   one "lead" change) read as their own sentence; two separate actions keep the latest sentence and its time. "Photos
   changed" is for one action with two or more counting changes of different kinds.
3. **Place words in notices** are the composer's: "Top spot", "2nd place"; "or" alternatives use their item name
   ("Phantom 24g photo removed") since two of them share rank 1.
4. **No upscaling**: a source smaller than a variant width produces that variant at the source size.
5. **Positions** are rewritten in two statements (negate, then set) so the live unique index never sees a duplicate.

## Assembly rulings (the writers' contract changes, reconciled; they supersede the contracts block where they differ)

6. **`ItemCondition`** and `ITEM_CONDITIONS`, `isItemCondition`, `CONDITION_LABEL` live in
   `src/domain/breaks/condition.ts` (Task 3; no imports, so client code can use it). `rules.ts` and
   `src/domain/photos/types.ts` re-export them; Task 5 does not define them.
7. **`recordProcessedPhoto`** takes `location: "photos-draft" | "photos"` (what the route wrote). The database refuses
   an insert whose location does not match the break's status (Task 2). If the break opened while a photo was being
   processed, Task 5 refuses with `PhotosNotReady`; the finalise route (Task 6) then copies the variants to `photos`,
   retries the record once, and deletes the draft copies. A second refusal deletes every copy and answers the error.
8. **Errors** `PhotosNotReady`, `UploadNotFound`, `UploadExpired`, `UploadUsed` live in `src/domain/errors.ts`
   (Task 6 adds them; Task 5 throws them). Task 5's own copy table stands for the rest.
9. **`POST /api/photos/finalise`** answers `200 { photoId: string; src: PhotoSrc }` (the 160 variant), so the tile swaps
   in place.
10. **`hidePhoto`** returns `{ prefix: string | null; from: PhotoLocation }`; `break_photos.path` is nullable (null:
    every copy is gone, only on removed or hidden rows). Moderation on a frozen break runs under
    `allowPhotoModeration(tx)` (`src/db/photo-moderation.ts`, Task 2); `hidePhoto` (Task 5) and the cleanup and hide
    script (Task 11) call it.
11. **Storage**: `PhotoStorage` (Task 1) exports `TooLarge` and `StorageNotFound`; `put` overwrites; `copy` to an
    existing destination succeeds; `list` is recursive with full paths. `createMemoryStorage(clock?)` keys files
    `${bucket}/${path}`. `src/photos/variants.ts` (Task 6: `newPhotoPrefix`, `putVariants`, `copyVariants`,
    `removeVariants`) is the only code that writes variants; Tasks 10 and 11 reuse it. Cleanup (Task 11) matches
    orphans by prefix across buckets, never by bucket alone.
12. **Drafts**: `deleteDraft` sets `breaks.deleted_at` (a tombstone: events reference the row) and Task 2 adds that
    column with its guard; `lockBreak` treats a deleted break as not found; every host list, feed, profile and
    `draftForEdit` query excludes deleted breaks (Task 3 adds the filters and a test per query). `deleteDraftAction`
    lives in `src/app/host/actions.ts` (Task 3); Task 6 adds the storage removal after its commit. A repeat
    `createDraft` with the same id and host saves the new input (Task 3, R3.2). `ensureDraftAction(FormData)` (Task 7,
    `src/app/host/new/actions.ts`) creates the draft from the first photo through Task 3's `createDraft({ breakId })`.
    The composer's fields are `newBreakId`, `prize1Slot`, `prize1Condition`, `prize2Slot`, `prize2Condition`.
13. **Opening** from the composer (`saveBreak`'s Open intent) and from the break page (`openBreakAction`) both run
    Task 6's draft-to-public copy before `openBreak`.
14. **Replace** (withdrawn by ruling 34) in the strip (Task 7) runs as add, then remove the old lead, then move the new photo to the front, so
    the notice reads "Lead photo replaced" (Task 5, ruling 2).
15. **Link preview and WebP** (Task 10): if Satori cannot draw WebP (Task 10's first step checks), the preview route
    transcodes the fetched 640 variant to PNG with sharp; Task 6's "sharp bundled only with finalise" check then names
    the preview route too. No new stored variant, no bucket type change.
16. **Budget** (Task 12): the allowance is the 4,036 B left of Mosaic §11's 12,288 B, over today's Turbopack measurement
    of /b/[id] taken on main before Task 1.
17. **Response target** for a hidden-photo report (Task 11's runbook): 24 hours, immediate for illegal content or
    personal data. The owner confirms or changes it at the plan review.
18. **Finish**: after the merge, before removing the worktree, run `supabase stop` then `start` from the main checkout,
    so the Storage containers mount the main checkout's config.
19. **Names a task must provide for its neighbours** (each owning task adds them, with a test where it is behaviour):
    - Task 3: the composer requires a condition per prize (Task 12's e2e fills it).
    - Task 7: `defaultAlt({ itemName, title })` exported from `strip-state.ts`; tiles carry `data-testid="photo-tile"`;
      menu items named as spec §9 ("Make lead", "Tag", "Describe", "Move earlier", "Move later", "Remove").
    - Task 8: `PrizesBlock` takes resolved view data (no `frozen`, ruling 35) (it reads no database);
      the viewer's `<dialog>` carries `data-photo-viewer-root` and no other module contains that string (Task 12's
      budget check scans first-load chunks for it); `LocalTime` gains `kind: "date"` and `src/lib/time.ts` gains
      `formatShortDate(d, tz)` for "Removed Oct 21"; `pagePhotos` and `src/photos/viewer.ts`
      `photoViewer(caller, { hostId, holderIds })` are shared with Task 9's result page.
    - Task 9: `PaySheet` gains `breakTitle` and `photo`, `BreakInteractiveProps` gains `lead`, `MyBreakCardProps`
      gains `photo` and `photoNotice`, `toCardProps` an optional fifth argument; `src/photos/lead-srcs.ts` throws on
      any non-public lead.
    - Task 11: the `photo.purged` audit event; `TxRunner`/`inTransaction` in `src/db/client.ts`; `cronAuthorized`,
      which `/api/tick` also switches to.
    - Task 12: `e2e/global-setup.ts` truncates `break_photos`, `photo_uploads` and `photo_notices_seen`, empties the four
      buckets and probes Storage; `COPY_MODULE` gains `domain/photos/types`, `domain/photos/notice`, `components/photos/(shrink|strip-state)`,
      `app/photos/actions` and `api/photos/finalise/route`.
20. **Precedence**: some task bodies cite a writer's "Contract changes" item by number, and Tasks 3 and 5 keep their own
    "Contract changes" subsections as context. Where any of them differs from these rulings, the rulings win.

## Panel rulings (the plan review's findings, settled; they win over everything above)

21. **When photos can be added**: "Add photos" is enabled once the draft can be saved: a title, a line count, a price, and
    a named top spot with its condition. The disabled reason reads "Add a title, a price and the top spot first."
    (spec §9 amended). `ensureDraftAction` parses with the normal `parseComposer`.
22. **The composer's id** is `initial.newBreakId ?? initial.breakId` (the server's, never a client `randomUUID`), and the
    address change after the first photo is Task 3's `moveToEditAddress(id)`.
23. **Errors**: Task 5 adds `PhotosNotReady`, `UploadNotFound`, `UploadExpired`, `UploadUsed` to `src/domain/errors.ts`
    with this copy: "Photos are still being prepared. Try again.", "This upload could not be found. Try again.", "This
    upload took too long. Try again.", "This upload was already used. Try again." Task 5 throws `PhotosNotReady` when
    the location does not match the break's status (ruling 7); Task 6 only consumes them.
24. **Removing after a claim**: the archive copy is made before the removal commits. If it fails, nothing is removed and
    the host sees "Couldn't remove the photo. Try again." A removal never commits with its files outside the archive.
25. **Cleanup never deletes the last copy**: before deleting any object it re-reads, in a fresh transaction, every
    `break_photos` row naming that prefix. It never deletes from a bucket that is the only one holding a prefix named by
    a row with a non-null path, and when a row's own bucket lacks a variant that another bucket holds, it copies it
    there first. `PhotoStorage.copy` onto an existing destination re-puts the object, so its age is fresh. Cleanup write
    transactions lock each break (`lockBreak`, ordered by break id) before touching its rows.
26. **Retention of a cancelled break's photos**: `break_photos_gone_chk` (Task 2) becomes `path is not null or bucket =
    'photo-archive'`. Rule 4 sets `bucket = 'photo-archive', path = null` on the break's rows under
    `allowPhotoModeration(tx)` and writes `photo.expired` (audit-only). Every live query (`leadPhotos`, `breakPhotos`,
    `photoSrc` callers) requires `path is not null and bucket <> 'photo-archive'`.
27. **The hide script** never removes from `photo-archive` (a hidden photo that was already removed keeps its only copy
    there) and skips the copy when `path` is null.
28. **No Storage call under a break lock**: `requestPhotoUpload` issues and commits the ticket, then signs the upload URL,
    deleting the ticket if signing fails. Storage calls everywhere carry `AbortSignal.timeout(5000)` where the client
    supports it.
29. **sharp**: every pipeline gets `.timeout({ seconds: 8 })`, mapped to `UnsupportedImage`. `failOn: "error"` is kept
    on purpose (phone JPEGs often carry harmless warnings).
30. **Finalise body** is read from the stream with a 2 KB cap, then parsed; a missing `Content-Length` is no exception.
31. **Link preview**: a failure in `leadPhotos` falls back to no photo, never a 404. Task 10's WebP step applies ruling 15
    directly (no BLOCKED stop); the sharp transcode there also uses `limitInputPixels` and the timeout, and Task 6's
    bundling check names the preview route.
32. **Polyglots** (a valid JPEG carrying other bytes) are accepted and re-encoded: the output holds pixels only, and the
    test asserts no foreign bytes survive. Spec §11 "a polyglot … refused" is amended to this.
33. **Minis** (spec decision 13) are deferred to the minis plan: no minis exist yet.
34. **Replace**: the strip has no Replace item (spec §12 left it to the builder). A host replaces by removing the old lead
    and making another photo lead; the latest action's sentence, "Lead photo replaced", stands (ruling 2). Ruling 14 is
    withdrawn. Task 12's replace test runs Remove then Make lead.
35. **`PrizesBlock`** has no `frozen` prop. The result page mounts the same `ViewerRoot` as the break page, so its plates
    open the viewer; audience filtering is tested in `page-photos.test.ts`, not on `PrizesBlock`.
36. **`Plate`** (Task 8) has sizes 40, 48, 64, 96 and the root attributes `data-testid="plate"`, `data-size`,
    `data-surface`, each pinned by `plate.test.ts`. `ViewerButton` takes a `testId` prop. The viewer `<dialog>` carries
    `data-photo-viewer-root`.
37. **`defaultAlt({ itemName, title })`** (object form) everywhere. The copy audit imports `noticeFor` from
    `src/domain/photos/notice.ts`, and `COPY_MODULE` gains `domain\/photos\/notice`.
38. **e2e Storage access** goes through a service-role client built from `.env.local` with dotenv, in `e2e/db.ts`
    (`photoStorage()` imports `server-only` and cannot load in Playwright). Photo fixtures are generated (`jpeg(n)`,
    defined in Task 7a's `e2e/helpers.ts` together with `composeBreakWithPhotos`); no image files are committed.
    `e2e/photos.spec.ts` is created by Task 8b and appended to by Task 12b. Handles in layout tests are 20 characters.
39. **`deleteDraftAction`** lives only in `src/app/host/actions.ts` (Task 3b); Task 6 adds the storage removal to it,
    skipping null paths; its test asserts `deleted_at` is set and that it redirects. `vercel.json` edits keep the
    existing keys (Task 11 adds a cron beside Task 6's `functions`).
40. **Splits**: Task 3 → 3a (domain) and 3b (composer and Delete draft UI); Task 7 → 7a (pure modules and e2e helpers),
    7b (strip and composer wiring), 7c (Edit photos sheet); Task 8 → 8a (plate, Prizes block, page wiring, layout) and
    8b (viewer); Task 12 → 12a (budget) and 12b (copy audit, photos e2e, README).
41. **Every test body has its assertions** (no empty `it`), every command carries the `export PATH=…` prefix, and a test
    that already passes before the change is labelled a regression pin.

## Before any task

Read the spec in full, then Mosaic §6, §8 and §11. Confirm the local preflight (Docker, every `supabase_*` container
including Kong and Storage, auth health, Mailpit) per `README.md`. Work in the plan's worktree.

## Task map (writers expand each task below into full TDD steps; the stubs fix scope, files and interfaces)

| Task | What | Model |
|---|---|---|
| 1 | Storage foundation: config, buckets, policies, `PhotoStorage`, memory fake, preflight | Opus |
| 2 | Migration 0005: tables, columns, triggers, backfill; claims set `first_claimed_at` | Opus |
| 3a | Prize slots, condition, idempotent drafts, `deleteDraft` (domain) | Opus |
| 3b | Composer slots and condition, Delete draft UI | Sonnet |
| 4 | `processPhoto`: sharp hardening and variants | Opus |
| 5 | Photo domain: tickets, commands, notice, queries, concurrency | Opus |
| 6 | Pipeline wiring: actions, finalise route, open copy, URLs, archive moves | Opus |
| 7a | Pure photo modules and e2e helpers | Sonnet |
| 7b | Photo strip and composer wiring | Sonnet |
| 7c | Edit photos sheet | Sonnet |
| 8a | Plate, Prizes block, page photos, layout | Sonnet |
| 8b | Photo viewer | Sonnet |
| 9 | Other surfaces: feed and profile cards, /me, /host, pay sheet, result | Sonnet |
| 10 | Link preview photo | Opus |
| 11 | Cleanup cron and the hide script with its runbook | Opus |
| 12a | Budget measurement | Sonnet |
| 12b | Copy audit, photos e2e, README | Sonnet |

Every task's reviewer runs on Opus (the project's rule: Opus for every review).

---

### Task 1: Storage foundation: config, buckets, policies, `PhotoStorage`, memory fake, preflight (model: Opus)

Spec §5.5: four buckets (`incoming` private, 5 MB, images only, signed uploads only; `photos-draft` private; `photos`
public by URL, `image/webp` only, not listable; `photo-archive` private, service role only), and **no** `storage.objects`
policy for `anon` or `authenticated` on any of them. Storage is off in `supabase/config.toml` today. This task turns it
on, declares the buckets there, writes the one module that talks to Storage (`PhotoStorage`) and its memory fake, and
proves both behave the same with one shared contract suite: the fake in `pnpm test`, the real one in `pnpm test:ci`
against the local stack, which also checks what `anon` and a signed-in member can and cannot do. Production gets the
same buckets from an idempotent script that also refuses to pass while any client policy exists on `storage`. The
README gains a preflight section with a Storage probe. Nothing in the app uses Storage yet.

Two facts the implementer must not rediscover:
- **Signed upload URLs live 2 hours** in Supabase Storage (`createSignedUploadUrl` takes no expiry; storage-js 2.118
  documents "They are valid for 2 hours"). The spec's 5 minutes is the ticket's `expires_at` (Task 5), checked at
  finalise (Task 6); an upload after that lands in `incoming`, is never finalised, and the daily cleanup deletes it
  (Task 11). See "Contract changes", item 1.
- **The stack must be recreated after a `config.toml` change** (`supabase stop`, then `supabase start`; stop keeps the
  database volume). Containers bind-mount files from the checkout `supabase start` ran in, so a stack started from a
  worktree breaks (Kong exits) once that worktree is removed. Step 9 restarts it from the worktree for this branch's
  tests; once the branch is merged, restart it again from the main checkout (`/Users/doflefou/apps/projects/waalo/dart-breaks`)
  before the worktree is removed. The README records the rule.

**Files:**
- Modify: `supabase/config.toml` (`[storage]` on; four `[storage.buckets.*]` sections)
- Create: `src/storage/buckets.ts`, `src/storage/buckets.test.ts`
- Create: `src/storage/timed-fetch.ts`, `src/storage/photo-storage.ts`, `src/storage/photo-storage.test.ts` (the
  5-second timeout, ruling 28)
- Create: `src/storage/ensure-buckets.ts`
- Create: `tests/helpers/memory-storage.ts`, `tests/helpers/photo-storage-contract.ts`, `tests/helpers/memory-storage.test.ts`
- Create: `tests/ci/storage.test.ts`
- Modify: `vitest.ci.config.mts` (the `server-only` alias the unit config already has)
- Create: `scripts/create-buckets.ts`
- Modify: `README.md` (Preflight section, Storage and buckets, the restart rule, the script in the Scripts table)

**Interfaces:**
- Consumes: `env()` (`src/lib/env.ts`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`); `@supabase/supabase-js` 2.118
  (`createClient` with `global.fetch`, `SupabaseClient`, `storage.from(b).createSignedUploadUrl`,
  `uploadToSignedUrl`, `upload`, `copy(from, to, { destinationBucket })`, `remove`, `createSignedUrl`, `list`,
  `storage.getBucket`, `createBucket`, `updateBucket`); `postgres` (`Sql`).
- Produces:
  - `src/storage/buckets.ts` (no `server-only`; scripts import it):
    ```ts
    export const BUCKETS = { incoming: "incoming", draft: "photos-draft", public: "photos", archive: "photo-archive" } as const;
    export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];
    export const VARIANT_WIDTHS = [160, 640, 1600] as const;
    export type VariantWidth = (typeof VARIANT_WIDTHS)[number];
    export const PREFIX_PATTERN = /^[0-9a-f-]{36}\/[A-Za-z0-9_-]{22}$/;
    export function variantPath(prefix: string, w: VariantWidth): string;      // `${prefix}-${w}.webp`; throws on a prefix that fails PREFIX_PATTERN
    export function publicVariantUrl(prefix: string, w: VariantWidth): string; // `${env().SUPABASE_URL}/storage/v1/object/public/photos/${variantPath(prefix, w)}`
    export type BucketSettings = { public: boolean; fileSizeLimit: number; allowedMimeTypes: readonly string[] };
    export const MIB = 1024 * 1024;
    export const BUCKET_SETTINGS: Record<BucketName, BucketSettings>;
    //   incoming:        { public: false, fileSizeLimit: 5 * MIB, allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] }
    //   "photos-draft":  { public: false, fileSizeLimit: 5 * MIB, allowedMimeTypes: ["image/webp"] }
    //   photos:          { public: true,  fileSizeLimit: 5 * MIB, allowedMimeTypes: ["image/webp"] }
    //   "photo-archive": { public: false, fileSizeLimit: 5 * MIB, allowedMimeTypes: ["image/webp"] }
    ```
    The spec pins only `incoming`'s 5 MB and `photos`' `image/webp`. The other three buckets hold only server re-encoded
    variants, so they take `image/webp` and the same 5 MB ceiling (a 1600 px variant is far below it); recorded here
    so no one widens them.
  - `src/storage/timed-fetch.ts` (no `server-only`; `scripts/create-buckets.ts` imports it):
    ```ts
    /** Every Storage request is aborted after this long (panel ruling 28). */
    export const STORAGE_TIMEOUT_MS = 5000;
    /** `fetch` with `AbortSignal.timeout(ms)` on every request, combined (`AbortSignal.any`) with a caller's own signal. */
    export function timedFetch(ms: number): typeof fetch;
    ```
  - `src/storage/photo-storage.ts` (`import "server-only"`):
    ```ts
    export class TooLarge extends Error {}         // download past maxBytes
    export class StorageNotFound extends Error {}  // download of a missing object
    export { STORAGE_TIMEOUT_MS, timedFetch } from "./timed-fetch"; // re-exported for server callers
    export interface PhotoStorage {
      createSignedUpload(name: string): Promise<{ url: string; token: string }>; // into `incoming`, upsert false; the URL lives 2 h (Storage's fixed value), the ticket enforces 5 minutes
      download(bucket: BucketName, path: string, maxBytes: number): Promise<Buffer>; // TooLarge past maxBytes (checked on Content-Length and while streaming); StorageNotFound when missing
      put(bucket: BucketName, path: string, body: Buffer, contentType: "image/webp"): Promise<void>; // cacheControl "3600", upsert true; a put over an existing object makes its age fresh
      copy(from: { bucket: BucketName; path: string }, to: { bucket: BucketName; path: string }): Promise<void>; // destination already there: re-put with the source's bytes, so its age is fresh (ruling 25); never an error
      remove(bucket: BucketName, paths: string[]): Promise<void>; // missing paths are not an error; batches of 1000
      signedReadUrl(bucket: BucketName, path: string, seconds: number): Promise<string>;
      list(bucket: BucketName, prefix: string): Promise<{ name: string; createdAt: Date }[]>; // every object under `prefix` ("" = the whole bucket), recursively, every page; `name` is the full path in the bucket; folders omitted; `createdAt` is the object's last write (Storage's `updated_at`, else `created_at`), so a re-put counts as new
    }
    /** The real implementation over a service-role client of its own whose `global.fetch` is `timedFetch(timeoutMs)`;
     *  `download`'s direct fetch uses the same `timedFetch`. Tests point it at a stalled server. */
    export function createPhotoStorage(cfg: { url: string; serviceRoleKey: string; timeoutMs: number }): PhotoStorage;
    export function photoStorage(): PhotoStorage; // createPhotoStorage({ url: env().SUPABASE_URL, serviceRoleKey: env().SUPABASE_SERVICE_ROLE_KEY, timeoutMs: STORAGE_TIMEOUT_MS })
    ```
    `photoStorage()` is no longer `supabaseAdmin()`-backed as the cross-task contracts say: `supabaseAdmin()` builds
    its client without a timed fetch, and storage-js 2.118 takes a per-call `signal` only on `download` and `list`, so
    the timeout goes on the client's `global.fetch` (ruling 28, "where the client supports it"). `supabaseAdmin()` is
    unchanged; Auth keeps using it.
  - `src/storage/ensure-buckets.ts` (no `server-only`):
    `ensureBuckets(admin: SupabaseClient): Promise<{ bucket: BucketName; action: "created" | "updated" | "ok" }[]>`
    (creates a missing bucket, updates one whose `public`, `file_size_limit` or `allowed_mime_types` differ from
    `BUCKET_SETTINGS`, in `Object.values(BUCKETS)` order) and
    `clientStoragePolicies(sql: postgres.Sql): Promise<{ table: string; policy: string; roles: string[] }[]>` (every
    `pg_policies` row in schema `storage` whose roles overlap `anon`, `authenticated` or `public`).
  - `tests/helpers/memory-storage.ts`: `createMemoryStorage(clock?: () => Date): PhotoStorage & { files: Map<string, Buffer> }`,
    `files` keyed `` `${bucket}/${path}` ``; `list` reports each file's `createdAt` as `clock()` at its latest `put` or
    `copy` (default `() => new Date()`; a copy onto an existing destination writes the source's bytes and a fresh date,
    as the real one does); `download` throws the same `TooLarge`/`StorageNotFound`; `createSignedUpload(name)`
    returns `{ url: "memory://upload/incoming/" + name, token }` and a test "uploads" by setting
    `files.set("incoming/" + name, body)`; `signedReadUrl` returns `` `memory://sign/${bucket}/${path}?seconds=${seconds}` ``.
    The fake has no timeout path: it does no I/O and resolves at once, so nothing in it can stall, and a fake timer
    would only test itself. The timeout is a property of the transport, tested on the real implementation in
    `src/storage/photo-storage.test.ts` against a local HTTP server that accepts and never answers (no Storage
    needed, so it runs in `pnpm test`). Callers that must survive a failed Storage call test that with a fake whose
    method throws (Tasks 5, 6, 11).
  - `tests/helpers/photo-storage-contract.ts`: `photoStorageContract(label: string, make: () => PhotoStorage): void`.
  - `scripts/create-buckets.ts`: `ENV_FILE=<file> pnpm exec tsx scripts/create-buckets.ts` prints one line per bucket
    (`incoming ok`, `photos created`, …), then `no client policies on storage` and exits 0; with any client policy it
    prints each (`storage.objects <policy> <roles>`) and exits 1.

- [ ] **Step 1: Write the failing bucket tests**

Create `src/storage/buckets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { BUCKETS, BUCKET_SETTINGS, MIB, PREFIX_PATTERN, VARIANT_WIDTHS, publicVariantUrl, variantPath } from "./buckets";

const P = "0b6c2f6e-5d1a-4c4e-9a59-3f0f3c1d2e4f/AbCdEfGhIjKlMnOpQrSt_-";

/** `[section]` → its body, by splitting on section headers (no TOML dependency for one test). */
function tomlSections(text: string): Record<string, string> {
  return Object.fromEntries(text.split(/^(?=\[)/m).filter((s) => s.startsWith("[")).map((s) => [s.slice(1, s.indexOf("]")), s]));
}

describe("photo storage names (photos spec §5.3, §5.5)", () => {
  it("names the four buckets and the three variant widths", () => {
    expect(BUCKETS).toEqual({ incoming: "incoming", draft: "photos-draft", public: "photos", archive: "photo-archive" });
    expect(VARIANT_WIDTHS).toEqual([160, 640, 1600]);
  });

  it("takes a break id and 22 url-safe characters as a prefix, nothing else", () => {
    expect(PREFIX_PATTERN.test(P)).toBe(true);
    for (const bad of ["../etc/passwd", `${P}x`, P.replace("/", "//"), P.slice(0, -1), `${P.split("/")[0]}/AbCdEfGhIjKlMnOpQrSt.-`, ""]) {
      expect(PREFIX_PATTERN.test(bad)).toBe(false);
    }
  });

  it("builds variant paths and public URLs from a valid prefix only", () => {
    expect(variantPath(P, 640)).toBe(`${P}-640.webp`);
    expect(publicVariantUrl(P, 1600)).toBe(`${process.env.SUPABASE_URL}/storage/v1/object/public/photos/${P}-1600.webp`);
    expect(() => variantPath("../x", 160)).toThrow();
    expect(() => publicVariantUrl("../x", 160)).toThrow();
  });

  it("keeps supabase/config.toml's buckets equal to BUCKET_SETTINGS, with Storage on", () => {
    const s = tomlSections(readFileSync("supabase/config.toml", "utf8"));
    expect(s["storage"]).toMatch(/^enabled = true$/m);
    expect(s["storage.image_transformation"]).toBeUndefined(); // billed per transformation; plain <img> + srcset (spec §5.5)
    for (const name of Object.values(BUCKETS)) {
      const body = s[`storage.buckets.${name}`];
      expect(body, name).toBeDefined();
      const settings = BUCKET_SETTINGS[name];
      expect(body).toMatch(new RegExp(`^public = ${settings.public}$`, "m"));
      expect(Number(/^file_size_limit = "(\d+)MiB"$/m.exec(body)?.[1]) * MIB).toBe(settings.fileSizeLimit);
      const mimes = /^allowed_mime_types = \[([^\]]*)\]$/m.exec(body)?.[1] ?? "";
      expect([...mimes.matchAll(/"([^"]+)"/g)].map((m) => m[1])).toEqual(settings.allowedMimeTypes);
      expect(body).not.toMatch(/objects_path/); // nothing is seeded into a photo bucket
    }
    expect(BUCKET_SETTINGS.incoming.fileSizeLimit).toBe(5 * 1024 * 1024);
    expect(BUCKET_SETTINGS.photos).toEqual({ public: true, fileSizeLimit: 5 * MIB, allowedMimeTypes: ["image/webp"] });
    expect(Object.values(BUCKET_SETTINGS).filter((b) => b.public)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; pnpm test src/storage/buckets.test.ts`
Expected: FAIL, `Failed to resolve import "./buckets"`.

- [ ] **Step 3: Write `src/storage/buckets.ts`**

The exports of the Interfaces block. `variantPath` throws `new Error("not a photo prefix")` when `PREFIX_PATTERN`
fails; `publicVariantUrl` goes through `variantPath`, so it throws the same. Each export gets a one-line doc comment
naming spec §5.3 or §5.5.

- [ ] **Step 4: Turn Storage on and declare the buckets in `supabase/config.toml`**

In the `[storage]` section replace `enabled = false` with `enabled = true` (leave `file_size_limit = "50MiB"`, the
stack-wide ceiling; each bucket sets its own). Replace the commented `# Uncomment to configure local storage buckets`
block (the five lines from that comment to `# objects_path = "./images"`) with:

```toml
# Photos (photos spec §5.5). src/storage/buckets.ts BUCKET_SETTINGS is the source; buckets.test.ts keeps these equal,
# and scripts/create-buckets.ts creates the same buckets in production. No objects_path: nothing is seeded. No
# storage.objects policy exists for anon or authenticated: every write is the service role or a signed upload URL.
[storage.buckets.incoming]
public = false
file_size_limit = "5MiB"
allowed_mime_types = ["image/jpeg", "image/png", "image/webp"]

[storage.buckets.photos-draft]
public = false
file_size_limit = "5MiB"
allowed_mime_types = ["image/webp"]

[storage.buckets.photos]
public = true
file_size_limit = "5MiB"
allowed_mime_types = ["image/webp"]

[storage.buckets.photo-archive]
public = false
file_size_limit = "5MiB"
allowed_mime_types = ["image/webp"]
```

Leave `[storage.s3_protocol]`, `[storage.analytics]` and `[storage.vector]` as they are, and the image transformation
block commented.

- [ ] **Step 5: Run the bucket tests to see them pass**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; pnpm test src/storage/buckets.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the shared contract suite and the timeout tests, and run them (failing)**

Create `tests/helpers/photo-storage-contract.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { BUCKETS, type BucketName } from "@/storage/buckets";
import { StorageNotFound, TooLarge, type PhotoStorage } from "@/storage/photo-storage";

/** One behaviour, two implementations: the memory fake (pnpm test) and Supabase Storage (pnpm test:ci, local stack). */
export function photoStorageContract(label: string, make: () => PhotoStorage): void {
  describe(`PhotoStorage contract: ${label}`, () => {
    let s: PhotoStorage;
    const folder = randomUUID(); // every path this suite writes sits under one fresh folder
    const at = (name: string) => `${folder}/${name}`;
    beforeAll(() => { s = make(); });
    afterAll(async () => {
      for (const b of Object.values(BUCKETS)) await s.remove(b, (await s.list(b, folder)).map((o) => o.name));
    });

    it("puts and downloads the same bytes, and a second put replaces them", async () => {
      const one = randomBytes(300), two = randomBytes(200);
      await s.put(BUCKETS.draft, at("a-160.webp"), one, "image/webp");
      expect(Buffer.compare(await s.download(BUCKETS.draft, at("a-160.webp"), 1000), one)).toBe(0);
      await s.put(BUCKETS.draft, at("a-160.webp"), two, "image/webp");
      expect(Buffer.compare(await s.download(BUCKETS.draft, at("a-160.webp"), 1000), two)).toBe(0);
    });

    it("refuses a download past maxBytes and names a missing object", async () => {
      await s.put(BUCKETS.public, at("big-160.webp"), randomBytes(2048), "image/webp");
      await expect(s.download(BUCKETS.public, at("big-160.webp"), 2047)).rejects.toBeInstanceOf(TooLarge);
      expect((await s.download(BUCKETS.public, at("big-160.webp"), 2048)).length).toBe(2048);
      await expect(s.download(BUCKETS.public, at("none-160.webp"), 2048)).rejects.toBeInstanceOf(StorageNotFound);
    });

    it("copies across buckets and keeps the source", async () => {
      const body = randomBytes(100);
      await s.put(BUCKETS.draft, at("c-640.webp"), body, "image/webp");
      await s.copy({ bucket: BUCKETS.draft, path: at("c-640.webp") }, { bucket: BUCKETS.public, path: at("c-640.webp") });
      expect(Buffer.compare(await s.download(BUCKETS.public, at("c-640.webp"), 1000), body)).toBe(0);
      expect(Buffer.compare(await s.download(BUCKETS.draft, at("c-640.webp"), 1000), body)).toBe(0);
    });

    it("re-puts an existing destination on copy: the source's bytes, a fresh age, no error (ruling 25)", async () => {
      const ageOf = async (b: BucketName, path: string) => (await s.list(b, folder)).find((o) => o.name === path)!.createdAt.getTime();
      const body = randomBytes(120), stale = randomBytes(80);
      await s.put(BUCKETS.archive, at("e-640.webp"), stale, "image/webp");
      await s.put(BUCKETS.public, at("e-640.webp"), body, "image/webp");
      const before = await ageOf(BUCKETS.archive, at("e-640.webp"));
      await new Promise((r) => setTimeout(r, 1100)); // past any second-granular timestamp
      await s.copy({ bucket: BUCKETS.public, path: at("e-640.webp") }, { bucket: BUCKETS.archive, path: at("e-640.webp") });
      expect(Buffer.compare(await s.download(BUCKETS.archive, at("e-640.webp"), 1000), body)).toBe(0);
      expect(await ageOf(BUCKETS.archive, at("e-640.webp"))).toBeGreaterThan(before);
      await s.copy({ bucket: BUCKETS.public, path: at("e-640.webp") }, { bucket: BUCKETS.archive, path: at("e-640.webp") }); // and again: still no error
      expect(Buffer.compare(await s.download(BUCKETS.public, at("e-640.webp"), 1000), body)).toBe(0);
    });

    it("removes present and missing paths alike", async () => {
      await s.put(BUCKETS.archive, at("r-160.webp"), randomBytes(10), "image/webp");
      await s.remove(BUCKETS.archive, [at("r-160.webp"), at("never-160.webp")]);
      await expect(s.download(BUCKETS.archive, at("r-160.webp"), 100)).rejects.toBeInstanceOf(StorageNotFound);
    });

    it("lists every object under a folder, nested ones too, by full path, and nothing outside it", async () => {
      const other = randomUUID();
      await s.put(BUCKETS.archive, at("l1-160.webp"), randomBytes(10), "image/webp");
      await s.put(BUCKETS.archive, at("deep/l2-160.webp"), randomBytes(10), "image/webp");
      await s.put(BUCKETS.archive, `${other}/l3-160.webp`, randomBytes(10), "image/webp");
      try {
        const rows = await s.list(BUCKETS.archive, folder);
        expect(rows.map((r) => r.name).sort()).toEqual([at("deep/l2-160.webp"), at("l1-160.webp")]);
        expect(rows.every((r) => r.createdAt instanceof Date && !Number.isNaN(r.createdAt.getTime()))).toBe(true);
        expect((await s.list(BUCKETS.archive, "")).map((r) => r.name)).toEqual(expect.arrayContaining([at("l1-160.webp"), `${other}/l3-160.webp`]));
      } finally {
        await s.remove(BUCKETS.archive, [`${other}/l3-160.webp`]);
      }
    });

    it("signs a read URL and an upload into incoming for the given path", async () => {
      await s.put(BUCKETS.draft, at("s-160.webp"), randomBytes(10), "image/webp");
      expect(await s.signedReadUrl(BUCKETS.draft, at("s-160.webp"), 600)).toContain(at("s-160.webp"));
      const up = await s.createSignedUpload(at("in.jpg"));
      expect(up.url).toContain(at("in.jpg"));
      expect(up.token.length).toBeGreaterThan(0);
    });
  });
}
```

Create `tests/helpers/memory-storage.test.ts`:

```ts
import { it, expect } from "vitest";
import { BUCKETS } from "@/storage/buckets";
import { createMemoryStorage } from "./memory-storage";
import { photoStorageContract } from "./photo-storage-contract";

photoStorageContract("memory fake", () => createMemoryStorage());

it("keys files by bucket and path, and dates them by the clock it was given", async () => {
  let t = new Date("2026-10-01T00:00:00Z");
  const s = createMemoryStorage(() => t);
  await s.put(BUCKETS.public, "b/x-160.webp", Buffer.from("x"), "image/webp");
  expect([...s.files.keys()]).toEqual(["photos/b/x-160.webp"]);
  expect(await s.list(BUCKETS.public, "b")).toEqual([{ name: "b/x-160.webp", createdAt: t }]);
  // A copy onto an existing destination re-dates it to the clock's now (ruling 25).
  await s.put(BUCKETS.archive, "b/x-160.webp", Buffer.from("old"), "image/webp");
  t = new Date("2026-10-02T00:00:00Z");
  await s.copy({ bucket: BUCKETS.public, path: "b/x-160.webp" }, { bucket: BUCKETS.archive, path: "b/x-160.webp" });
  expect(await s.list(BUCKETS.archive, "b")).toEqual([{ name: "b/x-160.webp", createdAt: new Date("2026-10-02T00:00:00Z") }]);
  expect(s.files.get("photo-archive/b/x-160.webp")?.toString()).toBe("x");
});
```

Create `src/storage/photo-storage.test.ts` (ruling 28: the real implementation, pointed at a local server that accepts
connections and never answers, gives up after its timeout on every method; no Storage needed):

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { BUCKETS } from "./buckets";
import { STORAGE_TIMEOUT_MS, createPhotoStorage, timedFetch, type PhotoStorage } from "./photo-storage";

describe("Storage calls time out (panel ruling 28)", () => {
  let server: Server, url = "";
  beforeAll(async () => {
    server = createServer((req) => { req.resume(); }); // reads the request, never answers
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });

  it("waits 5 seconds by default", () => {
    expect(STORAGE_TIMEOUT_MS).toBe(5000);
  });

  it("aborts a stalled request with a TimeoutError, and still honours the caller's own signal", async () => {
    const t0 = Date.now();
    await expect(timedFetch(100)(url)).rejects.toMatchObject({ name: "TimeoutError" });
    expect(Date.now() - t0).toBeLessThan(2000);
    const own = new AbortController();
    const pending = timedFetch(60_000)(url, { signal: own.signal });
    own.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("gives up on every PhotoStorage method when Storage stalls", async () => {
    const s: PhotoStorage = createPhotoStorage({ url, serviceRoleKey: "stalled", timeoutMs: 100 });
    const p = "0b6c2f6e-5d1a-4c4e-9a59-3f0f3c1d2e4f/AbCdEfGhIjKlMnOpQrSt_--160.webp";
    const calls: [string, () => Promise<unknown>][] = [
      ["createSignedUpload", () => s.createSignedUpload("x/in.jpg")],
      ["download", () => s.download(BUCKETS.draft, p, 1000)],
      ["put", () => s.put(BUCKETS.draft, p, Buffer.from("x"), "image/webp")],
      ["copy", () => s.copy({ bucket: BUCKETS.draft, path: p }, { bucket: BUCKETS.public, path: p })],
      ["remove", () => s.remove(BUCKETS.draft, [p])],
      ["signedReadUrl", () => s.signedReadUrl(BUCKETS.draft, p, 600)],
      ["list", () => s.list(BUCKETS.draft, "x")],
    ];
    for (const [name, call] of calls) {
      const t0 = Date.now();
      await expect(call(), name).rejects.toThrow();
      expect(Date.now() - t0, name).toBeLessThan(2000);
    }
  });
});
```

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; pnpm test tests/helpers/memory-storage.test.ts src/storage/photo-storage.test.ts`
Expected: FAIL, `Failed to resolve import "./memory-storage"` and `Failed to resolve import "./photo-storage"`.

- [ ] **Step 7: Write `src/storage/timed-fetch.ts`, `src/storage/photo-storage.ts` and `tests/helpers/memory-storage.ts`**

`timed-fetch.ts` and `photo-storage.ts`: `STORAGE_TIMEOUT_MS` and `timedFetch` in the first; the error classes, the
re-export, the interface, `createPhotoStorage` and `photoStorage()` in the second, exactly as the Interfaces block
says. Choices the signatures leave open:
- The timeout (ruling 28): `timedFetch(ms)` returns `(input, init) => fetch(input, { ...init, signal: init?.signal ?
  AbortSignal.any([init.signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms) })`. `createPhotoStorage` builds
  `createClient(cfg.url, cfg.serviceRoleKey, { auth: { persistSession: false }, global: { fetch: timedFetch(cfg.timeoutMs) } })`,
  so every storage-js request (upload, copy, remove, sign, list, `createSignedUploadUrl`) carries
  `AbortSignal.timeout`; storage-js 2.118 accepts a per-call `signal` only on `download` and `list`, so the client-wide
  fetch is the one place that covers them all. `download`'s own fetch calls the same `timedFetch(cfg.timeoutMs)`; the
  signal also aborts the body stream, and 5 MB from Storage fits well inside 5 seconds. A timeout surfaces as the
  rethrown `Error` below, with the `TimeoutError` as its `cause`.
- `download` does not use supabase-js (it buffers the whole body): `fetch(`${env().SUPABASE_URL}/storage/v1/object/authenticated/${bucket}/${path}`)`
  with `apikey` and `Authorization: Bearer` set to the service role key; a 400 or 404 whose body mentions "not found"
  throws `StorageNotFound`; a `Content-Length` above `maxBytes` throws `TooLarge` before reading; otherwise read the
  stream, cancel it and throw `TooLarge` as soon as the running total passes `maxBytes`.
- `copy`: `storage.from(from.bucket).copy(from.path, to.path, { destinationBucket: to.bucket })`. An error whose
  `statusCode` is `"409"` or message matches `/already exists/i` means the destination is there: re-put it (ruling 25),
  `download(from.bucket, from.path, BUCKET_SETTINGS[to.bucket].fileSizeLimit)` then `put(to.bucket, to.path, body,
  "image/webp")` (upsert), which bumps the object's `updated_at`, so `list` reports it as new. If the contract test
  shows the local Storage keeps the old timestamps on an upsert, `remove` the destination and `put` it again instead,
  and report the change (a public variant is then missing for the length of one upload).
- `list`: `storage.from(bucket).list(dir, { limit: 1000, offset })` page by page; an entry with `id === null` is a
  folder and is walked; files become `{ name: `${dir}/${entry.name}` (or `entry.name` at the root), createdAt: new Date(entry.updated_at ?? entry.created_at) }`
  (the last write: a re-put is new for the cleanup's age rules).
- Every other Supabase `error` is rethrown as an `Error` whose message names the bucket and path.

`memory-storage.ts`: a `Map<string, Buffer>` plus a private `Map<string, Date>` for dates; same errors; `remove`
ignores missing keys; `copy` writes the source's bytes to the destination and sets its date to `clock()` whether or
not the destination existed (ruling 25); `put` sets the date to `clock()` on every write.

- [ ] **Step 8: Run the fake's tests to see them pass**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; pnpm test tests/helpers/memory-storage.test.ts src/storage`
Expected: PASS (7 contract tests, the clock test, 4 bucket tests, 3 timeout tests).

- [ ] **Step 9: Restart the local stack with Storage on, and check every container**

Run (sandbox off, from this task's checkout): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; ./node_modules/.bin/supabase stop && ./node_modules/.bin/supabase start`
Expected: `supabase start` prints the API URL and a Storage URL, and its output has no "Stopped services" line naming
kong or storage. Then run (sandbox off):
`export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; docker ps -a --filter name=supabase_ --format '{{.Names}} {{.Status}}' | sort`
Expected: every `supabase_*_plan-1-tracer-bullet` container `Up` (healthy where it reports health), now including
`supabase_storage_plan-1-tracer-bullet`, with db, auth, kong, rest, inbucket and edge_runtime; none `Exited`. The
database volume survives the restart, so the three databases need no re-migration. If Kong exits, or a container fails
to mount a path under a removed worktree, run the same stop and start from the main checkout (memory note: containers
created from a removed worktree). Report BLOCKED: storage if Storage does not come up.

- [ ] **Step 10: Write the failing Storage CI test, then `ensure-buckets.ts` and the script**

Add to `vitest.ci.config.mts`, inside `resolve.alias`, the same entry `vitest.config.mts` has:
`"server-only": fileURLToPath(new URL("./tests/helpers/server-only-stub.ts", import.meta.url))`.

Create `tests/ci/storage.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BUCKETS, BUCKET_SETTINGS, MIB, publicVariantUrl, variantPath } from "@/storage/buckets";
import { photoStorage } from "@/storage/photo-storage";
import { clientStoragePolicies, ensureBuckets } from "@/storage/ensure-buckets";
import { photoStorageContract } from "../helpers/photo-storage-contract";

// GitHub CI runs test:ci on a bare postgres:16 service with no Storage. Everywhere else it runs against the local
// stack and fails loudly when Storage is down: run the README preflight first.
const STACK = process.env.GITHUB_ACTIONS !== "true";
const API = process.env.SUPABASE_URL!;
const SERVER = process.env.DB_SERVER_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322";
const client = (key: string) => createClient(API, key, { auth: { persistSession: false } });

describe.runIf(STACK)("Storage on the local stack (photos spec §5.5)", () => {
  photoStorageContract("Supabase", () => photoStorage());

  let admin: SupabaseClient, anon: SupabaseClient, member: SupabaseClient, memberId = "";
  const folder = randomUUID();
  const prefix = `${folder}/${randomBytes(16).toString("base64url")}`;
  const file = variantPath(prefix, 160);
  const body = randomBytes(256);
  const privateBuckets = [BUCKETS.draft, BUCKETS.archive] as const;

  beforeAll(async () => {
    admin = client(process.env.SUPABASE_SERVICE_ROLE_KEY!);
    anon = client(process.env.SUPABASE_ANON_KEY!);
    member = client(process.env.SUPABASE_ANON_KEY!);
    const email = `storage-${randomUUID()}@example.test`, password = randomBytes(18).toString("base64url");
    const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (made.error) throw made.error;
    memberId = made.data.user.id;
    const signedIn = await member.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
    for (const b of [BUCKETS.draft, BUCKETS.public, BUCKETS.archive]) {
      const { error } = await admin.storage.from(b).upload(file, body, { contentType: "image/webp", cacheControl: "3600" });
      if (error) throw error;
    }
  });
  afterAll(async () => {
    for (const b of Object.values(BUCKETS)) {
      const { data } = await admin.storage.from(b).list(folder);
      await admin.storage.from(b).remove((data ?? []).map((o) => `${folder}/${o.name}`));
    }
    if (memberId) await admin.auth.admin.deleteUser(memberId);
  });

  it("has the four buckets as BUCKET_SETTINGS says, and a second setup run changes nothing", async () => {
    await ensureBuckets(admin);
    expect(await ensureBuckets(admin)).toEqual(Object.values(BUCKETS).map((bucket) => ({ bucket, action: "ok" })));
    for (const name of Object.values(BUCKETS)) {
      const { data, error } = await admin.storage.getBucket(name);
      expect(error).toBeNull();
      expect({ public: data!.public, fileSizeLimit: data!.file_size_limit, allowedMimeTypes: data!.allowed_mime_types })
        .toEqual({ ...BUCKET_SETTINGS[name], allowedMimeTypes: [...BUCKET_SETTINGS[name].allowedMimeTypes] });
    }
  });

  it("has no storage policy that lets anon or authenticated read, list or write", async () => {
    const sql = postgres(`${SERVER}/postgres`, { max: 1, prepare: false });
    try {
      expect(await clientStoragePolicies(sql)).toEqual([]);
    } finally {
      await sql.end();
    }
  });

  it("serves a public variant by URL to anyone, as image/webp with a one-hour cache", async () => {
    const res = await fetch(publicVariantUrl(prefix, 160));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toMatch(/max-age=3600/);
    expect(Buffer.compare(Buffer.from(await res.arrayBuffer()), body)).toBe(0);
  });

  it("lists nothing in photos to anon or a signed-in member", async () => {
    expect((await admin.storage.from(BUCKETS.public).list(folder)).data).toHaveLength(1);
    for (const who of [anon, member]) expect((await who.storage.from(BUCKETS.public).list(folder)).data ?? []).toEqual([]);
  });

  it("never serves photos-draft or photo-archive without a signature", async () => {
    for (const b of privateBuckets) {
      expect((await fetch(`${API}/storage/v1/object/public/${b}/${file}`)).status).not.toBe(200);
      for (const who of [anon, member]) {
        expect((await who.storage.from(b).download(file)).data).toBeNull();
        expect((await who.storage.from(b).createSignedUrl(file, 600)).data).toBeNull();
        expect((await who.storage.from(b).list(folder)).data ?? []).toEqual([]);
      }
    }
  });

  it("refuses uploads from anon and a signed-in member to every bucket, and signed upload URLs too", async () => {
    for (const b of Object.values(BUCKETS)) {
      for (const who of [anon, member]) {
        const contentType = b === BUCKETS.incoming ? "image/jpeg" : "image/webp";
        expect((await who.storage.from(b).upload(`${prefix}-probe.webp`, randomBytes(32), { contentType })).error).not.toBeNull();
        expect((await who.storage.from(b).createSignedUploadUrl(`${folder}/probe.jpg`)).data).toBeNull();
      }
      const { data } = await admin.storage.from(b).list(folder);
      expect((data ?? []).map((o) => o.name)).not.toContain(`${prefix.split("/")[1]}-probe.webp`);
    }
  });

  it("takes a signed upload into incoming once, up to 5 MB, images only", async () => {
    const sign = async (name: string) => (await admin.storage.from(BUCKETS.incoming).createSignedUploadUrl(name)).data!;
    const ok = await sign(`${folder}/ok.jpg`);
    expect((await anon.storage.from(BUCKETS.incoming).uploadToSignedUrl(`${folder}/ok.jpg`, ok.token, randomBytes(1024), { contentType: "image/jpeg" })).error).toBeNull();
    expect((await anon.storage.from(BUCKETS.incoming).uploadToSignedUrl(`${folder}/ok.jpg`, ok.token, randomBytes(1024), { contentType: "image/jpeg" })).error).not.toBeNull(); // no overwrite
    const big = await sign(`${folder}/big.jpg`);
    expect((await anon.storage.from(BUCKETS.incoming).uploadToSignedUrl(`${folder}/big.jpg`, big.token, Buffer.alloc(5 * MIB + 1), { contentType: "image/jpeg" })).error).not.toBeNull();
    const html = await sign(`${folder}/page.jpg`);
    expect((await anon.storage.from(BUCKETS.incoming).uploadToSignedUrl(`${folder}/page.jpg`, html.token, Buffer.from("<html></html>"), { contentType: "text/html" })).error).not.toBeNull();
    // The public bucket takes nothing but WebP, even from the service role.
    expect((await admin.storage.from(BUCKETS.public).upload(`${prefix}-probe.webp`, randomBytes(32), { contentType: "image/png" })).error).not.toBeNull();
  });
});
```

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; pnpm test:ci tests/ci/storage.test.ts`
Expected: FAIL, `Failed to resolve import "@/storage/ensure-buckets"`.

Create `src/storage/ensure-buckets.ts` with `ensureBuckets` and `clientStoragePolicies` as the Interfaces block says.
`ensureBuckets` compares `allowed_mime_types` as sorted lists and calls `createBucket(name, { public, fileSizeLimit, allowedMimeTypes })`
or `updateBucket` with the same object. `clientStoragePolicies` runs:

```sql
select tablename as "table", policyname as policy, roles::text[] as roles
from pg_policies
where schemaname = 'storage' and roles && array['anon', 'authenticated', 'public']::name[]
order by tablename, policyname
```

Create `scripts/create-buckets.ts` in the style of `scripts/verify-draws.ts` (dotenv from `ENV_FILE`, default
`.env.local`; no top-level await; `main().then(process.exit)`): a service-role client from `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` (built with `createClient`, not `supabaseAdmin()`, which is `server-only`, and with
`global: { fetch: timedFetch(STORAGE_TIMEOUT_MS) }` from `src/storage/timed-fetch.ts`, ruling 28), `ensureBuckets`,
then `clientStoragePolicies` over `postgres(process.env.DATABASE_URL!, { max: 1, prepare: false })` (the database that
holds the `storage` schema: `postgres` locally, the project's database in production), printing and exiting as the
Interfaces block says. Header comment: what it does, that it is idempotent, that it runs once per environment
(locally after the first `supabase start` with Storage on, in production once before the photos release and again
after any change to `BUCKET_SETTINGS`), and that an explicit `DATABASE_URL` wins over the file.

- [ ] **Step 11: Create the buckets locally and probe Storage**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; ENV_FILE=.env.local pnpm exec tsx scripts/create-buckets.ts && ENV_FILE=.env.local pnpm exec tsx scripts/create-buckets.ts`
Expected: the first run prints four lines, each `ok` (the stack made them from `config.toml`) or `created`; the second
prints `incoming ok`, `photos-draft ok`, `photos ok`, `photo-archive ok`, then `no client policies on storage`, exit 0.

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; set -a; . ./.env.local; set +a; curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" http://127.0.0.1:54321/storage/v1/bucket | grep -o '"name":"[a-z-]*"' | sort`
Expected:

```
"name":"incoming"
"name":"photo-archive"
"name":"photos"
"name":"photos-draft"
```

- [ ] **Step 12: Run the Storage CI test to see it pass**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; pnpm test:ci`
Expected: PASS: `rls.test.ts` (2) and `storage.test.ts` (7 contract tests and 7 Storage tests). If Storage answers a
refused read or upload with a status the test does not expect but still refuses, keep the assertion on refusal
(`data` null, `error` set, status not 200), never loosen it to "any answer".

- [ ] **Step 13: README: preflight, Storage and buckets**

In `README.md`:
- "Local setup": change `pnpm supabase start            # local Postgres, Auth and Mailpit` to
  `pnpm supabase start            # local Postgres, Auth, Storage and Mailpit`, and after the env-file paragraph add:
  "Create the photo buckets once: `ENV_FILE=.env.local pnpm exec tsx scripts/create-buckets.ts` (it prints each bucket
  with `ok` or `created`, then `no client policies on storage`)."
- Add a subsection `### Preflight` at the end of "Local setup", before `## Scripts`:
  1. Docker is running (`docker ps` answers). Docker and the Supabase CLI run outside the agent sandbox.
  2. `docker ps -a --filter name=supabase_ --format '{{.Names}} {{.Status}}'`: every container `Up`, including kong
     and storage, none `Exited`.
  3. Auth: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:54321/auth/v1/health` prints `200`.
  4. Mailpit: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:54324/` prints `200`.
  5. Storage: the bucket listing of Step 11 prints the four bucket names.
  6. The app: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/` prints `200` once `pnpm dev` runs.
- Add a subsection `### Storage` after "E2E database": the four buckets and what each holds (one line each, from
  spec §5.5), that `supabase/config.toml` declares them for the local stack and `scripts/create-buckets.ts` for any
  other environment, that no `storage.objects` policy may exist for `anon` or `authenticated` (the script and
  `pnpm test:ci` both fail if one does), and: "After a change to `supabase/config.toml`, run `pnpm supabase stop` then
  `pnpm supabase start` (stop keeps the database). Run them from the main checkout: the containers mount files from the
  checkout that started them, and a stack started from a worktree breaks when that worktree is removed."
- "Deploy": add "Create the photo buckets once per environment, before the photos release:
  `ENV_FILE=.env.production pnpm exec tsx scripts/create-buckets.ts`. It must end with `no client policies on storage`."
- "Scripts" table: a row for `pnpm exec tsx scripts/create-buckets.ts` ("Create or align the four photo buckets and
  check Storage has no client policies").
- "Tests": the `pnpm test:ci` line also says it checks the Storage buckets and policies against the local stack (skipped
  on GitHub CI, which has no Storage).

- [ ] **Step 14: Run every gate**

Run (sandbox off, 10-minute timeout): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; /usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:concurrency && pnpm test:ci && pnpm test:e2e`
Expected: all green, no lint warnings. The e2e journey is unchanged (nothing reads Storage yet).

- [ ] **Step 15: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH
git add supabase/config.toml src/storage tests/helpers/memory-storage.ts tests/helpers/memory-storage.test.ts \
  tests/helpers/photo-storage-contract.ts tests/ci/storage.test.ts vitest.ci.config.mts scripts/create-buckets.ts README.md
git commit -m "feat(storage): photo buckets, PhotoStorage with its memory fake, and a Storage preflight"
```

---

### Task 2: Migration 0005: photo tables, prize slots, condition, guards, backfill; claims set `first_claimed_at` (model: Opus)

Spec §4, §4.1, §7, decisions 12 and 16. This task adds, in migration `0005_photos`: `break_photos`, `photo_uploads`,
`photo_notices_seen`; `breaks.first_claimed_at`, `breaks.photos_updated_at`, `breaks.photos_updated_note`,
`breaks.deleted_at` (asked for by Task 3, "Contract changes" item 7); `prizes.slot_key`; `break_items.condition`; and
drops `break_items.photo_paths`. The hand SQL after the generated statements adds what drizzle-kit cannot express: the
prize-slot foreign key that clears a tag when its prize goes, the status guard (frozen from `drawing` on and once
cancelled, with a per-transaction moderation exception), the 8-photo cap, the deferred check that live positions run
0..n−1, the set-once rules on `breaks`, the `first_claimed_at` backfill and RLS on the new tables. The claim commands
then set `first_claimed_at` with `coalesce` in the claim's transaction.

**The status guard and moderation (decided here from spec §6 and §10).** Spec §4 freezes photo rows from `drawing` on
and §6 says "From `drawing` on, photos are frozen: the result page shows what was promised." Spec §10 needs an admin
hide to work on any break: hiding exists for content that must come down at once, and revoking a host "hides all
their photos", drawn breaks included; a hide that waits for a status that never comes back would leave the content up.
So in a frozen break the guard refuses every insert, delete and update, **except** an update made inside a
transaction that called `allowPhotoModeration(tx)`, which may change only `hidden_at` (from null), `position` (to
close the gap the hide leaves, so the lead stays at position 0), `bucket` (the hide moves the row to `photo-archive`)
and `path` (to null, when retention or `--purge` deletes every copy). It may not touch `prize_slot`, `alt` or
`removed_at`: what was promised stays as promised, and moderation only takes things down. `cancelled` is frozen too,
as `items_mutation_guard` freezes items there: nobody edits a cancelled break's photos, and the cleanup (Task 11)
drops their files under the same exception. Retention of a cancelled break (panel ruling 26, Task 11's rule 4) sets
`bucket = 'photo-archive', path = null` on the break's rows, live ones included, and writes the audit-only event
`photo.expired`; so `break_photos_gone_chk` allows a null path in `photo-archive` only, on any row, and a live row may
sit in `photo-archive` once its files are gone. Every live query filters `path is not null and bucket <>
'photo-archive'` (Tasks 5, 6, 9, 10). Hosts never get the flag; Task 5's `hidePhoto` and Task 11's cleanup and
hide script call it.

**Files:**
- Modify: `src/db/schema.ts` (`breaks`, `breakItems`, `prizes`; new `breakPhotos`, `photoUploads`, `photoNoticesSeen`)
- Create (generated, merged, then appended): `src/db/migrations/0005_photos.sql`; Create (generated): `src/db/migrations/meta/0005_snapshot.json`; Modify (generated): `src/db/migrations/meta/_journal.json`
- Create: `src/db/photo-moderation.ts`
- Modify: `src/db/migrations.test.ts`
- Modify: `src/domain/lines/commands.ts` (`finishClaim`), `src/domain/lines/commands.test.ts`
- Modify: `tests/concurrency/setup.ts`, `e2e/global-setup.ts` (truncate the new tables)
- Modify: `README.md` (the migration line)

**Interfaces:**
- Consumes: fixtures `makeUser`, `makeBreak`, `openBreakWithLines`, `lineRows`; `withTx`; the claim commands
  (`claimLines`, `claimRandom`, `claimNext`, `claimAllOpen`, `releaseLine`).
- Produces:
  - Drizzle: `breaks.firstClaimedAt`, `breaks.photosUpdatedAt`, `breaks.photosUpdatedNote`, `breaks.deletedAt`;
    `breakItems.condition` (`text`, `$type<"new_in_box" | "new_opened" | "used" | null>`; `breakItems.photoPaths` is
    gone); `prizes.slotKey` (`uuid`, not null, `defaultRandom()`); `breakPhotos` (`id`, `breakId`, `position`,
    `prizeSlot`, `path` (nullable), `bucket` (`$type<"photos-draft" | "photos" | "photo-archive">`), `width`,
    `height`, `alt`, `createdBy`, `createdAt`, `hiddenAt`, `removedAt`); `photoUploads` (`id`, `hostId`, `breakId`,
    `incomingName` (unique), `expiresAt`, `consumedAt`, `createdAt`); `photoNoticesSeen` (`userId`, `breakId`,
    `seenAt`; primary key on both ids).
  - `src/db/photo-moderation.ts`: `allowPhotoModeration(tx: Tx): Promise<void>` runs
    `select set_config('breaks.photo_moderation', 'on', true)` (to the end of the transaction).
  - Database rules later tasks rely on (each pinned by a test below):
    - live = `removed_at is null and hidden_at is null`; at most **8** live rows per break (`a break has at most 8 photos`);
      one live row per `(break_id, position)` (`break_photos_live_position_uq`); `position between -8 and 7`
      (`break_photos_position_chk`), so a renumber may park rows at `-(position + 1)` and then set them (ruling 5);
      at commit the live positions of each touched break are exactly `0..n−1`
      (deferred constraint trigger `break_photos_shape`; a test that wants the check before its rollback runs
      `set constraints break_photos_shape immediate`).
    - an insert is live, and goes to `photos-draft` exactly when the break is a draft (`photos` when open or filled).
    - `path` is `{break_id}/{22 url-safe characters}` or null, and null (every copy gone) only when `bucket =
      'photo-archive'` (`break_photos_gone_chk`: `path is not null or bucket = 'photo-archive'`, panel ruling 26), on a
      removed, hidden or live row alike; `path` only ever changes to null. An insert can never be in `photo-archive`
      (the guard sends it to `photos-draft` or `photos`); a row reaches the archive only by an update, and a live row
      only by retention under `allowPhotoModeration` on a cancelled break.
    - `removed_at` and `hidden_at` are set once; `id`, `break_id`, `created_by`, `created_at`, `width`, `height` never change.
    - `(break_id, prize_slot)` references `prizes (break_id, slot_key)` with `on delete set null (prize_slot)`
      (`break_photos_prize_slot_fk`): a tag names a prize of the same break, and deleting that prize clears the tag.
    - `prizes_slot_uq` on `(break_id, slot_key)`; existing prizes get one key each.
    - `break_items_condition_chk`: null or one of the three values.
    - `breaks.first_claimed_at` set once (`first_claimed_at is set once`); `photos_updated_at` and
      `photos_updated_note` go together, the note 1–200 characters (`breaks_photos_note_chk`), and only once
      `first_claimed_at` is set (`breaks_photos_note_claimed_chk`); `deleted_at` is set only on a draft, once, and a
      deleted break never changes status (`a deleted draft stays deleted`).
    - photo rows are frozen while the break is `drawing`, `drawn` or `cancelled` (`photos are frozen once the draw is
      requested`), except the moderation updates above.
  - Event types: `photo.expired` is registered here as audit-only (inserted with `processed_at` set, through Task 5's
    `appendEvent(…, { processedAt })`; no consumer handles it). Task 11 writes it from retention rule 4 with payload
    `{ photoIds, reason: "retention" }`. `events.type` is free text, so this needs no schema change; Task 11 lists it
    beside `photo.purged`.
  - The claim commands set `breaks.first_claimed_at = coalesce(first_claimed_at, now())` in the same transaction as
    any claim that assigns at least one line.

- [ ] **Step 1: Write the failing migration tests**

In `src/db/migrations.test.ts`, replace

```ts
import { readFileSync } from "node:fs";
import { sql, type SQL } from "drizzle-orm";
import { withTx } from "../../tests/helpers/db";
import { makeUser, makeBreak } from "../../tests/helpers/fixtures";
import { breaks, hostProfiles } from "@/db/schema";
```

with

```ts
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { sql, eq, type SQL } from "drizzle-orm";
import { withTx } from "../../tests/helpers/db";
import { makeUser, makeBreak, openBreakWithLines } from "../../tests/helpers/fixtures";
import { breaks, hostProfiles, prizes, events } from "@/db/schema";
import { allowPhotoModeration } from "@/db/photo-moderation";
```

and append at the end of the file:

```ts
describe("migration 0005 photos", () => {
  const text = () => readFileSync(new URL("./migrations/0005_photos.sql", import.meta.url), "utf8");
  const statement = (start: string) => text().split("--> statement-breakpoint").map((s) => s.replace(/^--.*$/gm, "").trim()).find((s) => s.startsWith(start));
  const slug = () => randomBytes(16).toString("base64url"); // 22 url-safe characters, 128 bits
  type B = { id: string; hostId: string };
  const insertPhoto = (b: B, o: { position: number; bucket?: string; slot?: string | null; alt?: string; path?: string | null }) => sql`
    insert into break_photos (break_id, position, prize_slot, path, bucket, width, height, alt, created_by)
    values (${b.id}, ${o.position}, ${o.slot ?? null}, ${o.path === undefined ? `${b.id}/${slug()}` : o.path},
      ${o.bucket ?? "photos-draft"}, 1600, 1200, ${o.alt ?? "Darts"}, ${b.hostId}) returning id`;
  const addPhoto = async (tx: Tx, b: B, o: Parameters<typeof insertPhoto>[1]) => (await tx.execute<{ id: string }>(insertPhoto(b, o)))[0].id;
  const setStatus = (tx: Tx, id: string, status: string) => tx.execute(sql`update breaks set status = ${status} where id = ${id}`);

  it("caps a break at 8 live photos, one per position, and lets removed rows keep their old place", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      for (let p = 0; p < 8; p++) await addPhoto(tx, b, { position: p });
      expect(await refusal(tx, insertPhoto(b, { position: 7 }))).toMatch(/at most 8 photos/);
      await tx.execute(sql`update break_photos set removed_at = now() where break_id = ${b.id} and position = 7`);
      await addPhoto(tx, b, { position: 7 }); // a removed row at 7 does not hold the place
      await tx.execute(sql`update break_photos set removed_at = now() where break_id = ${b.id} and position = 6 and removed_at is null`);
      expect(await refusal(tx, insertPhoto(b, { position: 7 }))).toMatch(/break_photos_live_position_uq/);
      expect(await refusal(tx, insertPhoto(b, { position: 8 }))).toMatch(/break_photos_position_chk/);
    });
  });

  it("refuses an alt outside 1–120 characters, a path outside the break's folder, an unknown bucket, and a null path outside photo-archive", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const open = await openBreakWithLines(tx, { hostId: host.id });
      expect(await refusal(tx, insertPhoto(b, { position: 0, alt: "" }))).toMatch(/break_photos_alt_chk/);
      expect(await refusal(tx, insertPhoto(b, { position: 0, alt: "x".repeat(121) }))).toMatch(/break_photos_alt_chk/);
      expect(await refusal(tx, insertPhoto(b, { position: 0, path: `${randomUUID()}/${slug()}` }))).toMatch(/break_photos_path_chk/);
      expect(await refusal(tx, insertPhoto(b, { position: 0, path: `${b.id}/../${slug()}` }))).toMatch(/break_photos_path_chk/);
      expect(await refusal(tx, insertPhoto(open, { position: 0, bucket: "public" }))).toMatch(/break_photos_bucket_chk/);
      expect(await refusal(tx, insertPhoto(b, { position: 0, path: null }))).toMatch(/break_photos_gone_chk/);
      const id = await addPhoto(tx, b, { position: 0, alt: "x".repeat(120) });
      expect(await refusal(tx, sql`update break_photos set path = null where id = ${id}`)).toMatch(/break_photos_gone_chk/);
      const [row] = await tx.execute<{ alt: string; path: string | null }>(sql`select alt, path from break_photos where id = ${id}`);
      expect(row.alt).toHaveLength(120);
      expect(row.path).toMatch(new RegExp(`^${b.id}/[A-Za-z0-9_-]{22}$`));
    });
  });

  it("lets a path go null only in photo-archive, on any row, so a cancelled break's live rows can expire there (ruling 26)", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const open = await openBreakWithLines(tx, { hostId: host.id });
      const removed = await addPhoto(tx, open, { position: 0, bucket: "photos" });
      const kept = await addPhoto(tx, open, { position: 1, bucket: "photos" });
      // A removed row still in photos cannot drop its path; once in the archive it can.
      await tx.execute(sql`update break_photos set removed_at = now() where id = ${removed}`);
      await tx.execute(sql`update break_photos set position = 0 where id = ${kept}`);
      expect(await refusal(tx, sql`update break_photos set path = null where id = ${removed}`)).toMatch(/break_photos_gone_chk/);
      await tx.execute(sql`update break_photos set bucket = 'photo-archive', path = null where id = ${removed}`);
      // Retention on a cancelled break (Task 11 rule 4): the live row moves to the archive with no path, under moderation.
      await setStatus(tx, open.id, "cancelled");
      expect(await refusal(tx, sql`update break_photos set bucket = 'photo-archive', path = null where id = ${kept}`)).toMatch(/frozen/);
      await allowPhotoModeration(tx);
      expect(await refusal(tx, sql`update break_photos set path = null where id = ${kept}`)).toMatch(/break_photos_gone_chk/);
      await tx.execute(sql`update break_photos set bucket = 'photo-archive', path = null where id = ${kept}`);
      await tx.execute(sql`set constraints break_photos_shape immediate`); // positions untouched: still 0..n-1
      const rows = await tx.execute<{ id: string; bucket: string; path: string | null; live: boolean }>(
        sql`select id, bucket, path, (removed_at is null and hidden_at is null) as live from break_photos where break_id = ${open.id} order by (removed_at is null and hidden_at is null)`);
      expect(rows.map((r) => [r.bucket, r.path, r.live])).toEqual([["photo-archive", null, false], ["photo-archive", null, true]]);
      // An insert never lands in the archive, even with a path.
      const draft = await makeBreak(tx, { hostId: host.id });
      expect(await refusal(tx, insertPhoto(draft, { position: 0, bucket: "photo-archive" }))).toMatch(/photos-draft/);
    });
  });

  it("puts a draft's photos in photos-draft and an open break's in photos", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const draft = await makeBreak(tx, { hostId: host.id });
      const open = await openBreakWithLines(tx, { hostId: host.id });
      expect(await refusal(tx, insertPhoto(draft, { position: 0, bucket: "photos" }))).toMatch(/photos-draft/);
      expect(await refusal(tx, insertPhoto(open, { position: 0, bucket: "photos-draft" }))).toMatch(/photos-draft/);
      await addPhoto(tx, draft, { position: 0, bucket: "photos-draft" });
      await addPhoto(tx, open, { position: 0, bucket: "photos" });
      expect(await refusal(tx, sql`insert into break_photos (break_id, position, path, bucket, width, height, alt, created_by, removed_at)
        values (${open.id}, 1, ${`${open.id}/${slug()}`}, 'photos', 10, 10, 'x', ${host.id}, now())`)).toMatch(/added live/);
    });
  });

  it("keeps identity, size and dates fixed, sets removed_at and hidden_at once, and never brings a dropped path back", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const other = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const id = await addPhoto(tx, b, { position: 0 });
      for (const set of [sql`width = 10`, sql`created_by = ${other.id}`, sql`created_at = now() - interval '1 day'`, sql`break_id = ${(await makeBreak(tx, { hostId: host.id })).id}`]) {
        expect(await refusal(tx, sql`update break_photos set ${set} where id = ${id}`)).toMatch(/are fixed/);
      }
      await tx.execute(sql`update break_photos set removed_at = now() - interval '1 hour' where id = ${id}`);
      expect(await refusal(tx, sql`update break_photos set removed_at = now() where id = ${id}`)).toMatch(/set once/);
      expect(await refusal(tx, sql`update break_photos set removed_at = null where id = ${id}`)).toMatch(/set once/);
      await tx.execute(sql`update break_photos set hidden_at = now(), bucket = 'photo-archive' where id = ${id}`); // a removed photo can still be hidden
      expect(await refusal(tx, sql`update break_photos set hidden_at = null where id = ${id}`)).toMatch(/set once/);
      await tx.execute(sql`update break_photos set path = null where id = ${id}`);
      expect(await refusal(tx, sql`update break_photos set path = ${`${b.id}/${slug()}`} where id = ${id}`)).toMatch(/only ever changes to null/);
    });
  });

  it("closes live positions to 0..n-1 by commit, so a renumber may park rows below zero in between", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const [a, c] = [await addPhoto(tx, b, { position: 0 }), await addPhoto(tx, b, { position: 1 })];
      // Swap the two in two statements (ruling 5): park at -(position + 1), then set.
      await tx.execute(sql`update break_photos set position = -(position + 1) where break_id = ${b.id} and removed_at is null and hidden_at is null`);
      await tx.execute(sql`update break_photos set position = case id when ${a} then 1 when ${c} then 0 end where break_id = ${b.id} and removed_at is null and hidden_at is null`);
      await tx.execute(sql`set constraints break_photos_shape immediate`); // fires the pending checks now: they pass
      expect(await refusal(tx, sql`update break_photos set position = 2 where id = ${a}`)).toMatch(/without gaps/);
      expect(await refusal(tx, sql`update break_photos set removed_at = now() where id = ${c}`)).toMatch(/without gaps/); // the lead leaves a hole unless the rest move up
    });
  });

  it("freezes photos from the draw request on, and once cancelled", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      for (const frozen of ["drawing", "drawn", "cancelled"]) {
        const b = await openBreakWithLines(tx, { hostId: host.id });
        const id = await addPhoto(tx, b, { position: 0, bucket: "photos" });
        await setStatus(tx, b.id, frozen);
        expect(await refusal(tx, insertPhoto(b, { position: 1, bucket: "photos" }))).toMatch(/frozen once the draw is requested/);
        expect(await refusal(tx, sql`update break_photos set alt = 'New' where id = ${id}`)).toMatch(/frozen/);
        expect(await refusal(tx, sql`update break_photos set removed_at = now() where id = ${id}`)).toMatch(/frozen/);
        expect(await refusal(tx, sql`delete from break_photos where id = ${id}`)).toMatch(/frozen/);
        expect(await refusal(tx, sql`update break_photos set hidden_at = now(), bucket = 'photo-archive' where id = ${id}`)).toMatch(/frozen/);
      }
    });
  });

  it("lets moderation hide a photo and close the gap in a frozen break, and nothing else (spec §10)", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id });
      const lead = await addPhoto(tx, b, { position: 0, bucket: "photos" });
      const next = await addPhoto(tx, b, { position: 1, bucket: "photos" });
      await setStatus(tx, b.id, "drawn");
      await allowPhotoModeration(tx);
      await tx.execute(sql`update break_photos set hidden_at = now(), bucket = 'photo-archive' where id = ${lead}`);
      await tx.execute(sql`update break_photos set position = 0 where id = ${next}`);
      await tx.execute(sql`update break_photos set path = null where id = ${lead}`);
      await tx.execute(sql`set constraints break_photos_shape immediate`);
      expect(await refusal(tx, sql`update break_photos set alt = 'Swapped' where id = ${next}`)).toMatch(/frozen/);
      expect(await refusal(tx, sql`update break_photos set prize_slot = null, removed_at = now() where id = ${next}`)).toMatch(/frozen/);
      expect(await refusal(tx, sql`delete from break_photos where id = ${next}`)).toMatch(/frozen/);
      expect(await refusal(tx, insertPhoto(b, { position: 1, bucket: "photos" }))).toMatch(/frozen/);
    });
  });

  it("gives every prize its own slot key, unique per break, and backfills existing prizes one key each", async () => {
    const add = statement('ALTER TABLE "prizes" ADD COLUMN "slot_key"');
    expect(add).toBe(`ALTER TABLE "prizes" ADD COLUMN "slot_key" uuid DEFAULT gen_random_uuid() NOT NULL;`);
    await withTx(async (tx) => {
      await tx.execute(sql`create temp table t0005 (n int) on commit drop`);
      await tx.execute(sql`insert into t0005 select generate_series(1, 32)`);
      await tx.execute(sql.raw(add!.replace('ALTER TABLE "prizes"', "ALTER TABLE t0005")));
      const [r] = await tx.execute<{ keys: number }>(sql`select count(distinct slot_key)::int as keys from t0005`);
      expect(r.keys).toBe(32);
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const [p] = await tx.select().from(prizes).where(eq(prizes.breakId, b.id));
      expect(p.slotKey).toMatch(/^[0-9a-f-]{36}$/);
      const [item] = await tx.execute<{ id: string }>(sql`insert into break_items (break_id, name) values (${b.id}, 'Phantom') returning id`);
      expect(await refusal(tx, sql`insert into prizes (break_id, rank, item_id, slot_key) values (${b.id}, 1, ${item.id}, ${p.slotKey})`)).toMatch(/prizes_slot_uq/);
      const other = await makeBreak(tx, { hostId: host.id });
      const [item2] = await tx.execute<{ id: string }>(sql`insert into break_items (break_id, name) values (${other.id}, 'Phantom') returning id`);
      await tx.execute(sql`insert into prizes (break_id, rank, item_id, slot_key) values (${other.id}, 1, ${item2.id}, ${p.slotKey})`); // another break may reuse it
      const [reused] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from prizes where slot_key = ${p.slotKey}`);
      expect(reused.n).toBe(2);
    });
  });

  it("ties a tag to a prize of the same break, and clears it when that prize goes", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const other = await makeBreak(tx, { hostId: host.id });
      const [mine] = await tx.select().from(prizes).where(eq(prizes.breakId, b.id));
      const [theirs] = await tx.select().from(prizes).where(eq(prizes.breakId, other.id));
      expect(await refusal(tx, insertPhoto(b, { position: 0, slot: randomUUID() }))).toMatch(/break_photos_prize_slot_fk/);
      expect(await refusal(tx, insertPhoto(b, { position: 0, slot: theirs.slotKey }))).toMatch(/break_photos_prize_slot_fk/);
      const id = await addPhoto(tx, b, { position: 0, slot: mine.slotKey });
      await tx.delete(prizes).where(eq(prizes.id, mine.id)); // a draft re-save that drops the prize (spec §4.1)
      const [row] = await tx.execute<{ prize_slot: string | null }>(sql`select prize_slot from break_photos where id = ${id}`);
      expect(row.prize_slot).toBeNull();
    });
  });

  it("drops break_items.photo_paths and keeps condition to the three values or none", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      expect(await refusal(tx, sql`select photo_paths from break_items`)).toMatch(/photo_paths" does not exist/);
      expect(await refusal(tx, sql`insert into break_items (break_id, name, condition) values (${b.id}, 'x', 'mint')`)).toMatch(/break_items_condition_chk/);
      for (const c of ["new_in_box", "new_opened", "used", null]) await tx.execute(sql`insert into break_items (break_id, name, condition) values (${b.id}, 'x', ${c})`);
      const kept = await tx.execute<{ condition: string | null }>(sql`select condition from break_items where break_id = ${b.id} and name = 'x' order by condition nulls last`);
      expect(kept.map((r) => r.condition)).toEqual(["new_in_box", "new_opened", "used", null]);
    });
  });

  it("sets first_claimed_at once, ties the photo notice to it, and keeps a deleted draft deleted", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id });
      expect(await refusal(tx, sql`update breaks set photos_updated_at = now(), photos_updated_note = 'Lead photo replaced' where id = ${b.id}`)).toMatch(/breaks_photos_note_claimed_chk/);
      await tx.execute(sql`update breaks set first_claimed_at = now() where id = ${b.id}`);
      expect(await refusal(tx, sql`update breaks set first_claimed_at = now() + interval '1 minute' where id = ${b.id}`)).toMatch(/first_claimed_at is set once/);
      expect(await refusal(tx, sql`update breaks set first_claimed_at = null where id = ${b.id}`)).toMatch(/first_claimed_at is set once/);
      expect(await refusal(tx, sql`update breaks set photos_updated_at = now() where id = ${b.id}`)).toMatch(/breaks_photos_note_chk/);
      expect(await refusal(tx, sql`update breaks set photos_updated_at = now(), photos_updated_note = '' where id = ${b.id}`)).toMatch(/breaks_photos_note_chk/);
      await tx.execute(sql`update breaks set photos_updated_at = now(), photos_updated_note = 'Lead photo replaced' where id = ${b.id}`);
      expect(await refusal(tx, sql`update breaks set deleted_at = now() where id = ${b.id}`)).toMatch(/only a draft can be deleted/);
      const d = await makeBreak(tx, { hostId: host.id });
      await tx.execute(sql`update breaks set deleted_at = now() where id = ${d.id}`);
      expect(await refusal(tx, sql`update breaks set status = 'open' where id = ${d.id}`)).toMatch(/a deleted draft stays deleted/);
      expect(await refusal(tx, sql`update breaks set deleted_at = null where id = ${d.id}`)).toMatch(/a deleted draft stays deleted/);
    });
  });

  it("keeps photo upload names unique and one notice row per member and break", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const ticket = sql`insert into photo_uploads (host_id, break_id, incoming_name, expires_at) values (${host.id}, ${b.id}, ${`${b.id}/a.jpg`}, now() + interval '5 minutes')`;
      await tx.execute(ticket);
      expect(await refusal(tx, ticket)).toMatch(/photo_uploads_incoming_name_unique/);
      const seen = sql`insert into photo_notices_seen (user_id, break_id, seen_at) values (${host.id}, ${b.id}, now())`;
      await tx.execute(seen);
      expect(await refusal(tx, seen)).toMatch(/photo_notices_seen_user_id_break_id_pk/);
    });
  });

  it("backfills first_claimed_at from the earliest claim on record, and leaves never-claimed breaks empty", async () => {
    const backfill = statement("update breaks b set first_claimed_at");
    expect(backfill).toBeDefined();
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const buyer = await makeUser(tx);
      const t = (iso: string) => new Date(iso);
      const own = (id: string, n: number, at: Date) => tx.execute(sql`update lines set owner_id = ${buyer.id}, claimed_at = ${at}, price_cents = 2000 where break_id = ${id} and number = ${n}`);
      const ev = (id: string, type: string, at: Date) => tx.insert(events).values({ breakId: id, actorId: buyer.id, type, payload: {}, createdAt: at });
      // A: a claim event at 10:00, the line held since a later claim at 11:00.
      const a = await openBreakWithLines(tx, { hostId: host.id });
      await ev(a.id, "line.claimed", t("2026-03-01T10:00:00Z"));
      await own(a.id, 1, t("2026-03-01T11:00:00Z"));
      // B: claimed and released, no owner left: only the events remember.
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await ev(b.id, "line.claimed", t("2026-03-01T09:00:00Z"));
      await ev(b.id, "line.released", t("2026-03-01T09:30:00Z"));
      // C: an owned line and no events (made outside the commands).
      const c = await openBreakWithLines(tx, { hostId: host.id });
      await own(c.id, 2, t("2026-03-01T12:00:00Z"));
      // D: open, never claimed. E: already set, kept.
      const d = await openBreakWithLines(tx, { hostId: host.id });
      const e = await openBreakWithLines(tx, { hostId: host.id });
      await tx.execute(sql`update breaks set first_claimed_at = ${t("2026-02-01T00:00:00Z")} where id = ${e.id}`);
      await own(e.id, 1, t("2026-03-01T08:00:00Z"));
      await tx.execute(sql.raw(backfill!));
      const rows = await tx.select({ id: breaks.id, at: breaks.firstClaimedAt }).from(breaks).where(sql`${breaks.id} in (${a.id}, ${b.id}, ${c.id}, ${d.id}, ${e.id})`);
      const at = Object.fromEntries(rows.map((r) => [r.id, r.at?.toISOString() ?? null]));
      expect([at[a.id], at[b.id], at[c.id], at[d.id], at[e.id]]).toEqual([
        "2026-03-01T10:00:00.000Z", "2026-03-01T09:00:00.000Z", "2026-03-01T12:00:00.000Z", null, "2026-02-01T00:00:00.000Z",
      ]);
    });
  });
});
```

The guard is a BEFORE trigger, so it speaks before any CHECK: the bad-bucket case uses an open break, where the
guard's bucket rule does not apply and `break_photos_bucket_chk` is what refuses.

- [ ] **Step 2: Write the failing claim tests**

Append to `src/domain/lines/commands.test.ts`:

```ts
describe("breaks.first_claimed_at (photos spec decision 12)", () => {
  const firstClaimedAt = async (tx: Tx, id: string) => (await tx.select({ t: breaks.firstClaimedAt }).from(breaks).where(sql`${breaks.id} = ${id}`))[0].t;
  const claims: { name: string; mode: "pick_or_random" | "straight"; run: (tx: Tx, breakId: string, u: { id: string }) => Promise<unknown> }[] = [
    { name: "claimLines", mode: "pick_or_random", run: (tx, breakId, u) => claimLines(tx, c(u), { breakId, numbers: [3], batchId: randomUUID() }) },
    { name: "claimRandom", mode: "pick_or_random", run: (tx, breakId, u) => claimRandom(tx, c(u), { breakId, count: 1, batchId: randomUUID() }) },
    { name: "claimNext", mode: "straight", run: (tx, breakId, u) => claimNext(tx, c(u), { breakId, count: 1, batchId: randomUUID() }) },
    { name: "claimAllOpen", mode: "pick_or_random", run: (tx, breakId, u) => claimAllOpen(tx, c(u), { breakId, batchId: randomUUID() }) },
  ];

  for (const k of claims) {
    it(`is set by ${k.name}, in the claim's transaction, at the claim's time`, async () => {
      await withTx(async (tx) => {
        const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
        const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4, claimMode: k.mode });
        expect(await firstClaimedAt(tx, b.id)).toBeNull();
        await k.run(tx, b.id, buyer);
        const claimed = (await lineRows(tx, b.id)).find((l) => l.ownerId === buyer.id)!;
        expect(await firstClaimedAt(tx, b.id)).toEqual(claimed.claimedAt);
      });
    });
  }

  it("is kept when the only claim is released and another buyer claims later", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const one = await makeUser(tx); const two = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await claimLines(tx, c(one), { breakId: b.id, numbers: [1], batchId: randomUUID() });
      const first = await firstClaimedAt(tx, b.id);
      await releaseLine(tx, c(one), { breakId: b.id, number: 1, reason: "withdrawn" });
      expect((await lineRows(tx, b.id)).every((l) => l.ownerId === null)).toBe(true);
      expect(await firstClaimedAt(tx, b.id)).toEqual(first);
      await claimLines(tx, c(two), { breakId: b.id, numbers: [2], batchId: randomUUID() });
      expect(await firstClaimedAt(tx, b.id)).toEqual(first);
    });
  });

  it("never moves an earlier first claim", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      const earlier = new Date("2026-01-01T00:00:00Z"); // as the 0005 backfill leaves a break claimed before the migration
      await tx.update(breaks).set({ firstClaimedAt: earlier }).where(sql`${breaks.id} = ${b.id}`);
      await claimLines(tx, c(buyer), { breakId: b.id, numbers: [1], batchId: randomUUID() });
      expect(await firstClaimedAt(tx, b.id)).toEqual(earlier);
    });
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; pnpm test src/db/migrations.test.ts src/domain/lines/commands.test.ts`
Expected: FAIL: `migrations.test.ts` cannot resolve `@/db/photo-moderation`; once that exists, `relation
"break_photos" does not exist` and `ENOENT … 0005_photos.sql`; `commands.test.ts` fails type-checking on
`breaks.firstClaimedAt` and at run time with `column "first_claimed_at" does not exist`.

- [ ] **Step 4: Schema, first pass: everything except dropping `photo_paths`**

drizzle-kit asks "created or renamed?" when one table both gains and loses a column, and a prompt here is a stop. So
`break_items` gains `condition` in this pass and loses `photo_paths` in the next, and Step 6 merges the two into one
migration.

In `src/db/schema.ts`:
- `breaks`, after `relistedFromId`:
  ```ts
  /** Set by the claim commands the first time any line is claimed; never cleared (photos spec decision 12). */
  firstClaimedAt: timestamp("first_claimed_at", { withTimezone: true }),
  /** The latest photo change that counts (photos spec §6) and its sentence; set together, only after a first claim. */
  photosUpdatedAt: timestamp("photos_updated_at", { withTimezone: true }),
  photosUpdatedNote: text("photos_updated_note"),
  /** Delete draft (photos spec §9): the row stays because its events reference it; set once, drafts only. */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ```
  and in its checks:
  ```ts
  check("breaks_photos_note_chk", sql`(${t.photosUpdatedAt} is null) = (${t.photosUpdatedNote} is null) and char_length(${t.photosUpdatedNote}) between 1 and 200`),
  check("breaks_photos_note_claimed_chk", sql`${t.photosUpdatedAt} is null or ${t.firstClaimedAt} is not null`),
  ```
- `breakItems`: add `condition: text("condition").$type<"new_in_box" | "new_opened" | "used">(),` after
  `variantSchema`, and a third argument `(t) => [check("break_items_condition_chk", sql`${t.condition} in ('new_in_box','new_opened','used')`)]`
  (a null passes a CHECK; nullable for breaks made before this plan, spec §7). Keep `photoPaths` for now.
- `prizes`: add `/** The stable key photo tags point at (photos spec §4.1); made by the composer, kept across draft saves. */ slotKey: uuid("slot_key").notNull().defaultRandom(),`
  before `createdAt`, and `uniqueIndex("prizes_slot_uq").on(t.breakId, t.slotKey),` in its index list.
- After `prizes`, the three tables:
  ```ts
  /** Item photos (photos spec §4). Changed only by the photo commands, under the break row lock; see migration 0005's guards. */
  export const breakPhotos = pgTable("break_photos", {
    id: id(),
    breakId: uuid("break_id").notNull().references(() => breaks.id),
    position: integer("position").notNull(), // 0 = the lead; live rows run 0..n-1
    prizeSlot: uuid("prize_slot"), // prizes.slot_key of the same break, or null for "the lot" (hand-written FK in 0005)
    path: text("path"), // `${breakId}/${22 url-safe chars}`, the variants' prefix; null once every copy is gone
    bucket: text("bucket").$type<"photos-draft" | "photos" | "photo-archive">().notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    alt: text("alt").notNull(),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    createdAt: createdAt(),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  }, (t) => [
    uniqueIndex("break_photos_live_position_uq").on(t.breakId, t.position).where(sql`${t.removedAt} is null and ${t.hiddenAt} is null`),
    index("break_photos_break_idx").on(t.breakId),
    check("break_photos_bucket_chk", sql`${t.bucket} in ('photos-draft','photos','photo-archive')`),
    check("break_photos_position_chk", sql`${t.position} between -8 and 7`),
    check("break_photos_alt_chk", sql`char_length(${t.alt}) between 1 and 120`),
    check("break_photos_size_chk", sql`${t.width} > 0 and ${t.height} > 0`),
    check("break_photos_path_chk", sql`${t.path} is null or ${t.path} ~ ('^' || ${t.breakId}::text || '/[A-Za-z0-9_-]{22}$')`),
    // Panel ruling 26: a null path (every copy gone) only in photo-archive, on any row; retention of a cancelled break
    // archives its live rows too, so live queries filter `path is not null and bucket <> 'photo-archive'`.
    check("break_photos_gone_chk", sql`${t.path} is not null or ${t.bucket} = 'photo-archive'`),
  ]);

  /** The upload ticket (photos spec §4, §5.2): issued with the signed upload URL, consumed once by finalise. */
  export const photoUploads = pgTable("photo_uploads", {
    id: id(),
    hostId: uuid("host_id").notNull().references(() => users.id),
    breakId: uuid("break_id").notNull().references(() => breaks.id),
    incomingName: text("incoming_name").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: createdAt(),
  }, (t) => [index("photo_uploads_open_idx").on(t.hostId, t.breakId).where(sql`${t.consumedAt} is null`)]);

  /** When a holder last saw the break's photo notice (photos spec §4, §6); written by a client-fired action, never during a render. */
  export const photoNoticesSeen = pgTable("photo_notices_seen", {
    userId: uuid("user_id").notNull().references(() => users.id),
    breakId: uuid("break_id").notNull().references(() => breaks.id),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull(),
  }, (t) => [primaryKey({ columns: [t.userId, t.breakId] })]);
  ```

- [ ] **Step 5: Generate the first pass**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate --name photos`
Expected: no prompt; drizzle-kit writes `src/db/migrations/0005_photos.sql`, `meta/0005_snapshot.json` and a journal
entry `0005_photos`. The SQL holds exactly these 21 statements (whitespace, statement order and the column layout
inside each `CREATE TABLE` aside):
- `CREATE TABLE "break_photos"` with the 13 columns of Step 4 (`"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL`,
  `"path" text` without `NOT NULL`, `"bucket" text NOT NULL`, …) and the six `CONSTRAINT "break_photos_*_chk" CHECK (…)`
  of Step 4;
- `CREATE TABLE "photo_notices_seen"` with `CONSTRAINT "photo_notices_seen_user_id_break_id_pk" PRIMARY KEY("user_id","break_id")`;
- `CREATE TABLE "photo_uploads"` with `CONSTRAINT "photo_uploads_incoming_name_unique" UNIQUE("incoming_name")`;
- and:

```sql
ALTER TABLE "break_items" ADD COLUMN "condition" text;
ALTER TABLE "breaks" ADD COLUMN "first_claimed_at" timestamp with time zone;
ALTER TABLE "breaks" ADD COLUMN "photos_updated_at" timestamp with time zone;
ALTER TABLE "breaks" ADD COLUMN "photos_updated_note" text;
ALTER TABLE "breaks" ADD COLUMN "deleted_at" timestamp with time zone;
ALTER TABLE "prizes" ADD COLUMN "slot_key" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "break_photos" ADD CONSTRAINT "break_photos_break_id_breaks_id_fk" FOREIGN KEY ("break_id") REFERENCES "public"."breaks"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "break_photos" ADD CONSTRAINT "break_photos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "photo_notices_seen" ADD CONSTRAINT "photo_notices_seen_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "photo_notices_seen" ADD CONSTRAINT "photo_notices_seen_break_id_breaks_id_fk" FOREIGN KEY ("break_id") REFERENCES "public"."breaks"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "photo_uploads" ADD CONSTRAINT "photo_uploads_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "photo_uploads" ADD CONSTRAINT "photo_uploads_break_id_breaks_id_fk" FOREIGN KEY ("break_id") REFERENCES "public"."breaks"("id") ON DELETE no action ON UPDATE no action;
CREATE UNIQUE INDEX "break_photos_live_position_uq" ON "break_photos" USING btree ("break_id","position") WHERE "break_photos"."removed_at" is null and "break_photos"."hidden_at" is null;
CREATE INDEX "break_photos_break_idx" ON "break_photos" USING btree ("break_id");
CREATE INDEX "photo_uploads_open_idx" ON "photo_uploads" USING btree ("host_id","break_id") WHERE "photo_uploads"."consumed_at" is null;
CREATE UNIQUE INDEX "prizes_slot_uq" ON "prizes" USING btree ("break_id","slot_key");
ALTER TABLE "break_items" ADD CONSTRAINT "break_items_condition_chk" CHECK ("break_items"."condition" in ('new_in_box','new_opened','used'));
ALTER TABLE "breaks" ADD CONSTRAINT "breaks_photos_note_chk" CHECK (("breaks"."photos_updated_at" is null) = ("breaks"."photos_updated_note" is null) and char_length("breaks"."photos_updated_note") between 1 and 200);
ALTER TABLE "breaks" ADD CONSTRAINT "breaks_photos_note_claimed_chk" CHECK ("breaks"."photos_updated_at" is null or "breaks"."first_claimed_at" is not null);
```

The `slot_key` statement is the backfill too: adding a column with a volatile default rewrites `prizes` and evaluates
`gen_random_uuid()` once per existing row (pinned by the "backfills existing prizes one key each" test), so
`prizes_slot_uq` builds on distinct keys. If drizzle-kit prompts, or the SQL differs from the above, answer nothing,
stop and report BLOCKED: migration.

- [ ] **Step 6: Schema, second pass: drop `photo_paths`, and merge it into 0005**

Remove the `photoPaths` line from `breakItems` in `src/db/schema.ts`, then run:
`export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate --name photos_drop`
Expected: no prompt; `0006_photos_drop.sql` holds exactly `ALTER TABLE "break_items" DROP COLUMN "photo_paths";`.

Merge it into 0005 (one migration, forward-only):

```bash
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH
node -e '
const fs = require("fs"), d = "src/db/migrations/", m = d + "meta/";
const j = JSON.parse(fs.readFileSync(m + "_journal.json", "utf8"));
const [a, b] = j.entries.slice(-2);
if (a.tag !== "0005_photos" || b.tag !== "0006_photos_drop") throw new Error("unexpected journal tail " + a.tag + " " + b.tag);
fs.appendFileSync(d + "0005_photos.sql", "--> statement-breakpoint\n" + fs.readFileSync(d + "0006_photos_drop.sql", "utf8"));
const s5 = JSON.parse(fs.readFileSync(m + "0005_snapshot.json", "utf8")), s6 = JSON.parse(fs.readFileSync(m + "0006_snapshot.json", "utf8"));
fs.writeFileSync(m + "0005_snapshot.json", JSON.stringify({ ...s6, id: s5.id, prevId: s5.prevId }, null, 2));
fs.rmSync(d + "0006_photos_drop.sql"); fs.rmSync(m + "0006_snapshot.json");
j.entries.pop(); fs.writeFileSync(m + "_journal.json", JSON.stringify(j, null, 2));
console.log("merged");'
```

Expected: `merged`. Then check that the merged snapshot matches the schema and the journal is in order:
`export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate --name check` must print
`No schema changes, nothing to migrate` and write nothing, and
`export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; node -e 'const e=require("./src/db/migrations/meta/_journal.json").entries;console.log(e.length, e[5].tag, e[5].when>e[4].when?"ok":"BAD")'`
must print `6 0005_photos ok`. Anything else: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; git checkout src/db/migrations && git clean -f src/db/migrations`,
then stop and report BLOCKED: migration.

- [ ] **Step 7: Append the hand SQL**

Create `src/db/photo-moderation.ts`:

```ts
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";

/**
 * Lets this transaction hide photos and drop their files on a break whose photos are frozen (drawing, drawn,
 * cancelled): migration 0005's break_photos_guard then allows hidden_at, position, bucket and path (to null), and
 * nothing else (photos spec §10). For hidePhoto and the cleanup only; never on a host's request.
 */
export async function allowPhotoModeration(tx: Tx): Promise<void> {
  await tx.execute(sql`select set_config('breaks.photo_moderation', 'on', true)`);
}
```

Append to the end of `src/db/migrations/0005_photos.sql` (after the last statement, starting on a new line):

```sql

--> statement-breakpoint
-- A tag names a prize slot of the same break; deleting that prize (a draft re-save that drops it) clears the tag
-- (photos spec §4.1). Hand-written: drizzle-kit cannot express ON DELETE SET NULL (column) on a composite key.
alter table break_photos add constraint break_photos_prize_slot_fk foreign key (break_id, prize_slot)
  references prizes (break_id, slot_key) on delete set null (prize_slot);
--> statement-breakpoint
-- Photo rows change only while the break is draft, open or filled (photos spec §4 "Status guard"); from the draw
-- request on, and once cancelled, they are frozen (§6), except what a moderation transaction may do (§10, see
-- src/db/photo-moderation.ts). The break is read FOR SHARE so a concurrent draw request and this change serialise.
create or replace function break_photos_guard() returns trigger language plpgsql as $$
declare
  b_id uuid := case when tg_op = 'INSERT' then new.break_id else old.break_id end;
  b_status text;
  live int;
  moderating boolean := coalesce(current_setting('breaks.photo_moderation', true), '') = 'on';
begin
  select status into b_status from breaks where id = b_id for share;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.break_id is distinct from old.break_id
       or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
       or new.width is distinct from old.width or new.height is distinct from old.height then
      raise exception 'a photo''s id, break, author, size and creation time are fixed' using errcode = 'check_violation';
    end if;
    if (old.removed_at is not null and new.removed_at is distinct from old.removed_at)
       or (old.hidden_at is not null and new.hidden_at is distinct from old.hidden_at) then
      raise exception 'removed_at and hidden_at are set once' using errcode = 'check_violation';
    end if;
    if new.path is distinct from old.path and new.path is not null then
      raise exception 'a photo''s path only ever changes to null (every copy gone)' using errcode = 'check_violation';
    end if;
  end if;
  if b_status in ('draft','open','filled') then
    if tg_op = 'INSERT' then
      if new.removed_at is not null or new.hidden_at is not null then
        raise exception 'a photo is added live' using errcode = 'check_violation';
      end if;
      if (b_status = 'draft') <> (new.bucket = 'photos-draft') then
        raise exception 'a draft''s photos go to photos-draft, an open break''s to photos' using errcode = 'check_violation';
      end if;
      select count(*) into live from break_photos where break_id = new.break_id and removed_at is null and hidden_at is null;
      if live >= 8 then
        raise exception 'a break has at most 8 photos' using errcode = 'check_violation';
      end if;
    end if;
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and moderating
     and new.prize_slot is not distinct from old.prize_slot
     and new.alt is not distinct from old.alt
     and new.removed_at is not distinct from old.removed_at then
    return new;
  end if;
  raise exception 'photos are frozen once the draw is requested' using errcode = 'check_violation';
end $$;
--> statement-breakpoint
create trigger break_photos_guard before insert or update or delete on break_photos for each row execute function break_photos_guard();
--> statement-breakpoint
-- Live photos keep positions 0..n-1 with no gaps, so the lead is always position 0 (photos spec §4). Checked at commit,
-- once per touched row, so a renumber may park rows below zero between its two statements (ruling 5).
create or replace function break_photos_shape_check() returns trigger language plpgsql as $$
declare
  b_id uuid := coalesce(new.break_id, old.break_id);
  n int;
  closed boolean;
begin
  select count(*), coalesce(bool_and(position = rn - 1), true) into n, closed
  from (select position, row_number() over (order by position) as rn from break_photos
        where break_id = b_id and removed_at is null and hidden_at is null) live;
  if n > 8 then
    raise exception 'a break has at most 8 photos' using errcode = 'check_violation';
  end if;
  if not closed then
    raise exception 'live photo positions run 0 to n-1 without gaps' using errcode = 'check_violation';
  end if;
  return null;
end $$;
--> statement-breakpoint
create constraint trigger break_photos_shape after insert or update or delete on break_photos
  deferrable initially deferred for each row execute function break_photos_shape_check();
--> statement-breakpoint
-- Re-declare the 0001 freeze guard with three more rules: first_claimed_at is set once (photos spec decision 12), and
-- deleted_at is set once, on a draft only, after which the status never changes (Delete draft, §9).
create or replace function breaks_freeze_guard() returns trigger language plpgsql as $$
begin
  if old.status <> 'draft' and new.status = 'draft' then
    raise exception 'a break cannot return to draft (open -> draft does not exist)' using errcode = 'check_violation';
  end if;
  if old.status <> 'draft' then
    if new.line_count <> old.line_count or new.line_price_cents <> old.line_price_cents then
      raise exception 'line_count and line_price_cents are frozen after open' using errcode = 'check_violation';
    end if;
    if new.claim_mode <> old.claim_mode then
      raise exception 'claim_mode is frozen after open' using errcode = 'check_violation';
    end if;
  end if;
  if old.seed_commitment is not null and new.seed_commitment is distinct from old.seed_commitment then
    raise exception 'seed_commitment is immutable' using errcode = 'check_violation';
  end if;
  if old.first_claimed_at is not null and new.first_claimed_at is distinct from old.first_claimed_at then
    raise exception 'first_claimed_at is set once' using errcode = 'check_violation';
  end if;
  if old.deleted_at is not null and (new.deleted_at is distinct from old.deleted_at or new.status is distinct from old.status) then
    raise exception 'a deleted draft stays deleted' using errcode = 'check_violation';
  end if;
  if old.deleted_at is null and new.deleted_at is not null and (old.status <> 'draft' or new.status <> 'draft') then
    raise exception 'only a draft can be deleted' using errcode = 'check_violation';
  end if;
  return new;
end $$;
--> statement-breakpoint
-- Backfill (photos spec decision 12): the earliest sign that any line of the break was ever claimed. A claim event is
-- the record; any other line event, a line still owned, or a draw with entries is a later bound used when the claim
-- event is missing (rows made outside the commands). Breaks with none of these stay null.
update breaks b set first_claimed_at = f.at
from (
  select x.id, least(
    (select min(e.created_at) from events e where e.break_id = x.id
       and e.type in ('line.claimed','line.sent','line.paid','line.unpaid','line.released','line.bonus_added','line.bonus_removed')),
    (select min(l.claimed_at) from lines l where l.break_id = x.id and l.owner_id is not null),
    (select min(d.created_at) from draws d where d.break_id = x.id and jsonb_array_length(d.entries_snapshot) > 0)
  ) as at
  from breaks x
) f
where f.id = b.id and b.first_claimed_at is null and f.at is not null;
--> statement-breakpoint
-- Deny-all RLS backstop for the new tables, as 0003 did (tests/ci/rls.test.ts checks every public table).
alter table break_photos enable row level security;
--> statement-breakpoint
alter table break_photos force row level security;
--> statement-breakpoint
alter table photo_uploads enable row level security;
--> statement-breakpoint
alter table photo_uploads force row level security;
--> statement-breakpoint
alter table photo_notices_seen enable row level security;
--> statement-breakpoint
alter table photo_notices_seen force row level security;
```

- [ ] **Step 8: Truncate the new tables in the suites that empty the database**

In `tests/concurrency/setup.ts` and `e2e/global-setup.ts`, change the truncate list
`truncate awards, draws, draw_requests, events, lines, prizes, break_items, …` to start
`truncate photo_notices_seen, photo_uploads, break_photos, awards, draws, …` (the rest unchanged). `cascade` would
reach them through `breaks`, but the list names every table so a reader sees what is emptied. (Emptying the buckets
before each e2e run is Task 12's.)

- [ ] **Step 9: Apply it to the three databases**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; ENV_FILE=.env.local pnpm db:migrate && ENV_FILE=.env.test pnpm db:migrate && DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/breaks_e2e pnpm db:migrate`
Expected: `migrated` three times. Then
`psql`-free check (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; node -e 'const p=require("postgres")("postgresql://postgres:postgres@127.0.0.1:54322/postgres",{max:1});p\`select count(*)::int n from breaks where first_claimed_at is null and exists (select 1 from lines l where l.break_id = breaks.id and l.owner_id is not null)\`.then(r=>{console.log(r[0].n);return p.end()})'`
Expected: `0` (no dev break with a held line was left without a first claim). Any error: stop and report BLOCKED: migration.

- [ ] **Step 10: The claim commands set `first_claimed_at`**

In `src/domain/lines/commands.ts`, `finishClaim` runs only when the claim assigned lines (`got.length > 0`); after its
`appendEvent`, add:

```ts
  // "Claimed" means a line of this break was ever claimed (photos spec decision 12): set once, kept after releases.
  await tx.update(breaks).set({ firstClaimedAt: sql`coalesce(${breaks.firstClaimedAt}, now())` }).where(sql`${breaks.id} = ${b.id}`);
```

`now()` is the transaction's time, the same value `assign` wrote to `lines.claimed_at`. Every claim path (`claimLines`,
`claimRandom`, `claimNext`, `claimAllOpen`) goes through `finishClaim`, after `lockBreak`, so no new lock is taken.
`addBonusLine` needs nothing: a bonus line goes only to someone already holding a numbered line.

- [ ] **Step 11: Run the tests to see them pass**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; pnpm test src/db src/domain/lines`
Expected: PASS, including the 14 "migration 0005 photos" tests, the 6 `first_claimed_at` tests, the existing 0001 and
0004 tests and every existing claim test (`schema.test.ts`'s break inserts do not name the new columns).

- [ ] **Step 12: README**

In `README.md`, after the `0004_flights_kits` bullet under "UI conventions", add: "Migration `0005_photos` adds
`break_photos` (up to 8 live photos per break at positions 0..n−1, frozen from the draw request on except for an
admin hide), `photo_uploads` (single-use upload tickets), `photo_notices_seen`, `prizes.slot_key` (the stable key a
photo tag points at), `break_items.condition`, `breaks.first_claimed_at` (set by the first claim, never cleared;
backfilled), `breaks.photos_updated_at` and `photos_updated_note`, and `breaks.deleted_at`; it drops
`break_items.photo_paths`."

- [ ] **Step 13: Run every gate**

Run (sandbox off, 10-minute timeout): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; /usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:concurrency && pnpm test:ci && pnpm test:e2e`
Expected: all green. `pnpm test:ci`'s RLS test now covers the three new tables. The concurrency suite commits, so the
deferred `break_photos_shape` check runs for real there (nothing writes photos yet). The e2e journey claims lines,
which now also sets `first_claimed_at`.

- [ ] **Step 14: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH
git add src/db/schema.ts src/db/migrations src/db/migrations.test.ts src/db/photo-moderation.ts \
  src/domain/lines/commands.ts src/domain/lines/commands.test.ts tests/concurrency/setup.ts e2e/global-setup.ts README.md
git commit -m "feat(db): migration 0005 for photos, prize slots, item condition and first claims"
```

---


### Task 3a: Prize slots, condition, idempotent drafts, deleteDraft (domain) (model: Opus)

Spec §4.1, §7 (condition), §9 (the composer's id, Delete draft), decision 16. Photo tags point at a prize's
**slot key**, so a draft save must keep every slot it already has: `updateDraft` stops deleting and reinserting
prizes and instead updates kept slots in place, inserts new ones and deletes only removed ones (clearing the photo
tags of removed slots). Each prize gains a condition. The composer posts the new break's id (Task 3b) and
`createDraft` becomes idempotent on that id for the same host, so the first photo (Task 7b), a Save pressed while it
uploads, and a reload all land on one draft. Drafts gain **Delete draft**: the break row stays as a tombstone
(`deleted_at`), because `events.break_id` references it and events are append-only; prizes, items, photo rows and
tickets go. Task 3a is the domain; Task 3b is the composer and the Delete draft UI (panel ruling 40).

**Rulings made in this task** (the caller records them in the plan; panel rulings 12, 21, 22, 39 and 41 win where they
differ):
- R3.1 The break row of a deleted draft is kept with `breaks.deleted_at` set (Contract changes, item 2).
  `lockBreak` treats a deleted break as `NotFound`, so every command (this plan's photo commands included) refuses it.
  Every host list, feed, profile and `draftForEdit` query excludes it (ruling 12): `getBreakPage`, `draftForEdit`,
  `listHostBreaks` and `lastBreakDefaults` get an explicit `deleted_at is null`; `listFeed`, `feedHosts`,
  `hostProfile`, `hostTrust`, `waitingOnHost` and `myLines` already exclude it by status (Task 2's guard keeps a
  deleted break a draft forever, and a draft has no lines). Each query gets a test (Step 1).
- R3.2 `createDraft` with an id that already exists: same host and still a draft → it applies the input exactly as
  `updateDraft` does (one row, `break.updated`, no second `break.created`); another caller's id → `NotAuthorized`
  (admins included: an admin edits through `updateDraft`); a break that is no longer a draft → `NotOpen`; a deleted one
  → `NotFound`.
- R3.3 Save draft and Open break keep redirecting to `/b/{id}` (design §5.6; pinned by journey-2, pages and layout
  e2e). "The page moves to the draft's edit address" (spec §9) is for a draft created while the composer stays open
  (Task 7b's first photo): Task 3b's `moveToEditAddress(id)` replaces the URL with `/host/{id}/edit` (ruling 22).
- R3.4 Items keep the composer's order: `insertPrizes` stamps `break_items.created_at` with `clock_timestamp()`
  (today every item of one save shares the transaction's `now()` and the order falls back to a random uuid).
- R3.5 Condition copy (spec §7): "New in box", "New, opened", "Used"; the select's empty first option reads
  "Condition". Every named prize needs a condition (ruling 21): `validatePrizes` (3a) and `parseComposer` (3b) refuse a
  named prize without one, and the browser marks the select `required` on the first top-spot row and on every row whose
  name is filled (3b). A named top spot with its condition is part of "the draft can be saved", which is what lets the
  first photo create the draft (Task 7b).

**Files:**
- Create: `src/domain/breaks/condition.ts` (import-free, so the client composer may import it)
- Modify: `src/domain/breaks/rules.ts` (re-export the condition module; `validatePrizes`)
- Modify: `src/domain/breaks/commands.ts` (`PrizeInput`, `CreateDraftInput`, `insertPrizes`, `createDraft`,
  `updateDraft`, new `deleteDraft`), `src/domain/breaks/commands.test.ts`
- Modify: `src/domain/breaks/queries.ts` (`DraftForEdit`, `draftForEdit`, `getBreakPage`, `listHostBreaks`,
  `lastBreakDefaults` skip deleted), `src/domain/breaks/queries.test.ts` (the `draftForEdit` literal at line 154, and
  the "deleted drafts" tests)
- Modify: `src/domain/breaks/feed.test.ts` (the deleted-draft regression pins)
- Modify: `src/auth/authz.ts` (`lockBreak` refuses a deleted break)
- Modify: `tests/helpers/fixtures.ts` (`prize`, `photoRow`)
- Create: `tests/concurrency/drafts.test.ts`
- Modify (bridge, replaced in Task 3b): `src/app/host/new/parse.ts`, `src/app/host/new/initial.ts`, so `tsc` and the
  e2e stay green between the two commits (Step 4)

**Interfaces:**
- Consumes (Task 2's migration and `src/db/schema.ts`): `prizes.slotKey` (`slot_key uuid not null default
  gen_random_uuid()`, unique per `(break_id, slot_key)`; existing rows backfilled), `breakItems.condition`
  (`text`, nullable, check `in ('new_in_box','new_opened','used')`), `breaks.deletedAt` (set once, on a draft only;
  the status never changes after), `breakPhotos` (`breakId`, `position`, `prizeSlot`, `path` (nullable), `bucket`,
  `width`, `height`, `alt`, `createdBy`; an insert whose bucket does not match the break's status is refused),
  `photoUploads` (`hostId`, `breakId`, `incomingName`, `expiresAt`), the existing `items_mutation_guard`.
  `PhotoLocation` (Task 5's `src/domain/photos/types.ts`; if Task 5 has not landed, import the type from Task 2's
  schema bucket union; it is `"photos-draft" | "photos" | "photo-archive"`). Existing: `assertHostOf`, `lockBreak`,
  `appendEvent`, `isUuid`, `withTx`, `makeUser`.
- Produces (for Task 3b, Tasks 5, 6, 7b and 11):
  - `src/domain/breaks/condition.ts`: `ITEM_CONDITIONS = ["new_in_box", "new_opened", "used"] as const`;
    `type ItemCondition`; `isItemCondition(v: unknown): v is ItemCondition`; `CONDITION_LABEL: Record<ItemCondition,
    string>` = `{ new_in_box: "New in box", new_opened: "New, opened", used: "Used" }`. Re-exported by `rules.ts` and
    by Task 5's `src/domain/photos/types.ts`.
  - `validatePrizes(rows: readonly { name: string; slotKey: string; condition: string }[]): void`
    (`rules.ts`): every `slotKey` a uuid and distinct, else `InvalidInput("This form is out of date. Reload the page
    and try again.")`; every condition one of the three, else `InvalidInput("Choose the condition of each prize")`.
  - `type PrizeInput = { name: string; slotKey: string; condition: ItemCondition }`;
    `CreateDraftInput.items: (PrizeInput & { variantSchema?: …; expectedShipAt?: … })[]`,
    `CreateDraftInput.secondPlace?: PrizeInput[]` (blank names still skipped, their slots ignored).
  - `createDraft(tx, caller, input, opts?: { breakId?: string }): Promise<{ breakId: string }>` (ruling R3.2).
  - `updateDraft(tx, caller, breakId, input): Promise<{ breakId: string }>`: prizes kept by slot.
  - `deleteDraft(tx: Tx, caller: Caller, breakId: string): Promise<{ photos: { location: PhotoLocation; prefix:
    string }[] }>`: host or admin, draft only; deletes `break_photos`, `photo_uploads`, prizes, items; sets
    `deleted_at`; appends `break.deleted` with `{ photos: n }` (n: every photo row); returns the `bucket` and `path`
    of every photo row whose `path` is not null (a hidden row's files are already gone) for Task 6 to remove from
    storage.
  - `DraftForEdit.topSpot` and `.secondPlace`: `{ slotKey: string; name: string; condition: ItemCondition | null
    }[]`, in the composer's order.
  - `tests/helpers/fixtures.ts`: `prize(name, condition?, slotKey?)`, `photoRow(tx, o)` (Step 1).

- [ ] **Step 1: Write the failing domain tests**

In `tests/helpers/fixtures.ts`, add:

```ts
/** A composer prize: a fresh slot key unless given. */
export const prize = (name: string, condition: ItemCondition = "new_in_box", slotKey: string = randomUUID()) => ({ name, slotKey, condition });
/**
 * A break_photos row straight into the table (Task 5's commands are not needed to test slots and deletes).
 * bucket defaults to the one the break's status allows: "photos-draft" for a draft break, "photos" otherwise
 * (Task 2 refuses any other insert). path `${breakId}/${22 url-safe chars}`, width 1600, height 1200, alt "Darts".
 * Returns the row id.
 */
export async function photoRow(tx: Tx, o: { breakId: string; hostId: string; position: number; slot: string | null; bucket?: "photos-draft" | "photos" }): Promise<string>;
```

In `src/domain/breaks/commands.test.ts`: `input.items` becomes `[prize("Chronos 22g"), prize("Chronos 24g")]`;
every other item literal in this file and in `queries.test.ts` goes through `prize(…)`. Import `deleteDraft`,
`draftForEdit`, `getBreakPage`, `listHostBreaks`, `NotFound`, `randomUUID`, `breakPhotos`, `photoUploads`, `prizes`,
`breakItems`. Local helpers: `slotItems(tx, breakId): Promise<Map<string, string>>` (slot key → item id from
`prizes`) and `photoSlot(tx, photoId): Promise<string | null>`. Add:

```ts
describe("prize slots and condition", () => {
  it("stores each prize's slot key and condition, in the composer's order", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const [a, b, c] = [prize("Chronos 22g"), prize("Chronos 24g", "used"), prize("Flight pack", "new_opened")];
      const { breakId } = await createDraft(tx, asHost(host), { ...input, items: [a, b], secondPlace: [c] });
      const d = (await draftForEdit(tx, breakId))!;
      expect(d.topSpot).toEqual([a, b]);
      expect(d.secondPlace).toEqual([c]);
    });
  });
  it("refuses a prize with no condition, a bad slot key, or a slot key used twice", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      await expect(createDraft(tx, asHost(host), { ...input, items: [{ ...prize("X"), condition: "mint" as never }] })).rejects.toThrow("Choose the condition of each prize");
      await expect(createDraft(tx, asHost(host), { ...input, items: [prize("X", "used", "slot-1")] })).rejects.toThrow("This form is out of date. Reload the page and try again.");
      const twice = randomUUID();
      await expect(createDraft(tx, asHost(host), { ...input, items: [prize("X", "used", twice)], secondPlace: [prize("Y", "used", twice)] })).rejects.toBeInstanceOf(InvalidInput);
    });
  });
  it("removing the first 'or' choice keeps the other two slots, their items and their photo tags", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const [a, b, c] = [prize("Chronos 22g"), prize("Chronos 24g", "used"), prize("Phantom 24g", "new_opened")];
      const { breakId } = await createDraft(tx, asHost(host), { ...input, items: [a, b, c] });
      const before = await slotItems(tx, breakId);
      const onB = await photoRow(tx, { breakId, hostId: host.id, position: 0, slot: b.slotKey });
      const onC = await photoRow(tx, { breakId, hostId: host.id, position: 1, slot: c.slotKey });
      await updateDraft(tx, asHost(host), breakId, { ...input, items: [a, c] });
      expect((await draftForEdit(tx, breakId))!.topSpot).toEqual([a, c]);
      const after = await slotItems(tx, breakId);
      expect([...after.keys()].sort()).toEqual([a.slotKey, c.slotKey].sort());
      expect(after.get(a.slotKey)).toBe(before.get(a.slotKey)); // updated in place, not reinserted
      expect(after.get(c.slotKey)).toBe(before.get(c.slotKey));
      expect(await photoSlot(tx, onC)).toBe(c.slotKey); // the Phantom photo still shows the Phantom
      expect(await photoSlot(tx, onB)).toBeNull(); // a removed slot clears the tag
    });
  });
  it("renames and re-conditions a kept slot in place and adds a new slot after the kept ones", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const [a, c, e] = [prize("Chronos 22g"), prize("Phantom 24g"), prize("Chronos 26g", "used")];
      const { breakId } = await createDraft(tx, asHost(host), { ...input, items: [a, c] });
      const before = await slotItems(tx, breakId);
      const renamed = { ...a, name: "Chronos 22g steel", condition: "used" as const };
      await updateDraft(tx, asHost(host), breakId, { ...input, items: [renamed, c, e] });
      expect((await draftForEdit(tx, breakId))!.topSpot).toEqual([renamed, c, e]);
      expect((await slotItems(tx, breakId)).get(a.slotKey)).toBe(before.get(a.slotKey));
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${breakId} and ${events.type} = 'break.updated'`);
      expect(evs).toHaveLength(1);
    });
  });
  // Regression pin (ruling 41): Task 2's column sits under the existing items_mutation_guard, so this passes before
  // Step 3. It pins that the condition freezes with its item and must stay green.
  it("regression pin: freezes a prize's condition with its item after the first paid line", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const { breakId } = await createDraft(tx, asHost(host), input);
      await openBreak(tx, asHost(host), breakId);
      await tx.execute(sql`update lines set owner_id = ${buyer.id}, claimed_at = now(), paid_at = now() where break_id = ${breakId} and number = 1`);
      await expect(tx.execute(sql`update break_items set condition = 'used' where break_id = ${breakId}`))
        .rejects.toMatchObject({ cause: { message: expect.stringMatching(/add-only after the first paid line/) } });
    });
  });
});

describe("createDraft with the composer's id", () => {
  it("makes the break under that id once; a second call applies the input to the same row", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const id = randomUUID();
      expect(await createDraft(tx, asHost(host), input, { breakId: id })).toEqual({ breakId: id });
      expect(await createDraft(tx, asHost(host), { ...input, title: "Target Chronos v2" }, { breakId: id })).toEqual({ breakId: id });
      const rows = await tx.select().from(breaks).where(sql`${breaks.id} = ${id}`);
      expect(rows.map((r) => r.title)).toEqual(["Target Chronos v2"]);
      const types = (await tx.select().from(events).where(sql`${events.breakId} = ${id}`)).map((e) => e.type).sort();
      expect(types).toEqual(["break.created", "break.updated"]);
      expect((await draftForEdit(tx, id))!.topSpot).toEqual(input.items); // same slots, no duplicate prizes
    });
  });
  it("refuses another host's id, an admin's included, and changes nothing", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const other = await makeUser(tx, { role: "host" }); const admin = await makeUser(tx, { role: "admin" });
      const id = randomUUID();
      await createDraft(tx, asHost(host), input, { breakId: id });
      await expect(createDraft(tx, asHost(other), { ...input, title: "Hijacked" }, { breakId: id })).rejects.toBeInstanceOf(NotAuthorized);
      await expect(createDraft(tx, { ...asHost(admin), role: "admin" }, { ...input, title: "Hijacked" }, { breakId: id })).rejects.toBeInstanceOf(NotAuthorized);
      expect((await draftForEdit(tx, id))!.title).toBe("Target Chronos");
    });
  });
  it("refuses an id that is not a uuid, and the id of a break already open", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      await expect(createDraft(tx, asHost(host), input, { breakId: "b1" })).rejects.toBeInstanceOf(InvalidInput);
      const id = randomUUID();
      await createDraft(tx, asHost(host), input, { breakId: id });
      await openBreak(tx, asHost(host), id);
      await expect(createDraft(tx, asHost(host), input, { breakId: id })).rejects.toBeInstanceOf(NotOpen);
    });
  });
});

describe("deleteDraft", () => {
  it("deletes the prizes, items, photo rows and tickets, keeps the events, and returns the photo locations", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), input);
      await photoRow(tx, { breakId, hostId: host.id, position: 0, slot: input.items[0].slotKey }); // bucket defaults to photos-draft
      await photoRow(tx, { breakId, hostId: host.id, position: 1, slot: null });
      await tx.insert(photoUploads).values({ hostId: host.id, breakId, incomingName: "x", expiresAt: new Date(Date.now() + 300_000) });
      const { photos } = await deleteDraft(tx, asHost(host), breakId);
      expect(photos).toHaveLength(2);
      expect(photos.every((p) => p.location === "photos-draft" && p.prefix.startsWith(`${breakId}/`))).toBe(true);
      for (const t of [prizes, breakItems, breakPhotos, photoUploads]) {
        expect(await tx.select().from(t).where(sql`${t.breakId} = ${breakId}`)).toHaveLength(0);
      }
      const [row] = await tx.select().from(breaks).where(sql`${breaks.id} = ${breakId}`);
      expect(row.deletedAt).toBeInstanceOf(Date); // a tombstone: the row stays for its events
      expect(row.status).toBe("draft");
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${breakId}`);
      expect(evs.map((e) => e.type)).toEqual(expect.arrayContaining(["break.created", "break.deleted"]));
      expect(evs.find((e) => e.type === "break.deleted")!.payload).toEqual({ photos: 2 });
    });
  });
  it("skips a photo row whose files are already gone (path null) in what it returns, and counts it in the event", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asHost(host), input);
      await photoRow(tx, { breakId, hostId: host.id, position: 0, slot: null });
      const hidden = await photoRow(tx, { breakId, hostId: host.id, position: 1, slot: null });
      // An admin-hidden photo whose copies are all gone (ruling 10): only reachable under allowPhotoModeration.
      await allowPhotoModeration(tx);
      await tx.execute(sql`update break_photos set hidden_at = now(), bucket = 'photo-archive', path = null where id = ${hidden}`);
      const { photos } = await deleteDraft(tx, asHost(host), breakId);
      expect(photos).toHaveLength(1);
      expect(photos[0].prefix).toMatch(new RegExp(`^${breakId}/`));
      const [ev] = await tx.select().from(events).where(sql`${events.breakId} = ${breakId} and ${events.type} = 'break.deleted'`);
      expect(ev.payload).toEqual({ photos: 2 });
    });
  });
  it("is for the host or an admin, and only while the break is a draft", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const other = await makeUser(tx, { role: "host" }); const member = await makeUser(tx);
      const admin = await makeUser(tx, { role: "admin" });
      const a = await createDraft(tx, asHost(host), input);
      await expect(deleteDraft(tx, asHost(other), a.breakId)).rejects.toBeInstanceOf(NotAuthorized);
      await expect(deleteDraft(tx, asMember(member), a.breakId)).rejects.toBeInstanceOf(NotAuthorized);
      expect(await deleteDraft(tx, { ...asHost(admin), role: "admin" }, a.breakId)).toEqual({ photos: [] });
      const b = await createDraft(tx, asHost(host), input);
      await openBreak(tx, asHost(host), b.breakId);
      await expect(deleteDraft(tx, asHost(host), b.breakId)).rejects.toBeInstanceOf(NotOpen);
    });
  });
  it("leaves a deleted draft unreachable: delete, edit, open and create-by-id all say not found", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const id = randomUUID();
      await createDraft(tx, asHost(host), input, { breakId: id });
      await deleteDraft(tx, asHost(host), id);
      await expect(deleteDraft(tx, asHost(host), id)).rejects.toBeInstanceOf(NotFound);
      await expect(updateDraft(tx, asHost(host), id, input)).rejects.toBeInstanceOf(NotFound);
      await expect(openBreak(tx, asHost(host), id)).rejects.toBeInstanceOf(NotFound);
      await expect(createDraft(tx, asHost(host), input, { breakId: id })).rejects.toBeInstanceOf(NotFound);
    });
  });
});
```

(`allowPhotoModeration` is Task 2's `src/db/photo-moderation.ts`; the hidden-row column names follow Task 2's schema.)

In `src/domain/breaks/queries.test.ts`, update the `draftForEdit` test at line 154 to `prize(…)` literals and object
expectations (`secondPlace: [flights]`, `topSpot` sorted by name), then add one test per query (ruling 12). A deleted
draft is made with SQL, not `deleteDraft`, so these tests do not depend on Step 3's command:

```ts
const markDeleted = (tx: Tx, id: string) => tx.execute(sql`update breaks set deleted_at = now() where id = ${id}`);

describe("deleted drafts leave every host list, profile and editor query (ruling 12)", () => {
  it("draftForEdit and getBreakPage answer null", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const { breakId } = await createDraft(tx, asCaller(host, "host"), draftInput);
      await markDeleted(tx, breakId);
      expect(await draftForEdit(tx, breakId)).toBeNull();
      expect(await getBreakPage(tx, breakId)).toBeNull();
    });
  });
  it("listHostBreaks leaves it out and keeps the host's other drafts", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const kept = await createDraft(tx, asCaller(host, "host"), draftInput);
      const gone = await createDraft(tx, asCaller(host, "host"), { ...draftInput, title: "Gone" });
      await markDeleted(tx, gone.breakId);
      expect((await listHostBreaks(tx, host.id)).map((b) => b.id)).toEqual([kept.breakId]);
    });
  });
  it("lastBreakDefaults skips a newer deleted draft", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      await createDraft(tx, asCaller(host, "host"), { ...draftInput, lineCount: 20 });
      const gone = await createDraft(tx, asCaller(host, "host"), { ...draftInput, lineCount: 30 });
      await tx.execute(sql`update breaks set created_at = now() + interval '1 minute' where id = ${gone.breakId}`);
      await markDeleted(tx, gone.breakId);
      expect((await lastBreakDefaults(tx, host.id))?.lineCount).toBe(20);
    });
  });
  // Regression pins (ruling 41): these queries already leave drafts out by status, and Task 2 keeps a deleted break a
  // draft with no lines. They pass before Step 3 and must stay green.
  it("regression pin: hostProfile and hostTrust count nothing from a deleted draft", async () => {
    await withTx(async (tx) => {
      const member = await makeUser(tx, { handle: "deletedonly" }); const host = await makeUser(tx, { role: "host", handle: "hostdel" });
      const a = await makeBreak(tx, { hostId: member.id, status: "draft" }); await markDeleted(tx, a.id);
      expect(await hostProfile(tx, "deletedonly")).toBeNull(); // a non-host with only a deleted draft has no profile
      const before = await hostTrust(tx, host.id);
      const b = await makeBreak(tx, { hostId: host.id, status: "draft" }); await markDeleted(tx, b.id);
      expect(await hostTrust(tx, host.id)).toEqual(before);
      expect((await hostProfile(tx, "hostdel"))?.pastCount).toBe(0);
    });
  });
  it("regression pin: waitingOnHost and myLines see no deleted draft", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id, status: "draft" }); await markDeleted(tx, b.id);
      expect(await waitingOnHost(tx, host.id)).toEqual([]);
      expect((await myLines(tx, host.id, new Date())).map((r) => r.breakId)).not.toContain(b.id);
    });
  });
});
```

(`draftInput` is the file's existing `createDraft` input with `prize(…)` items; `waitingOnHost` and `myLines` come
from `@/domain/lines/queries`.)

In `src/domain/breaks/feed.test.ts`, add:

```ts
describe("deleted drafts (ruling 12)", () => {
  // Regression pin (ruling 41): the feed lists open breaks only and a deleted break stays a draft (Task 2's guard).
  it("regression pin: listFeed, its host filter and feedHosts never show a deleted draft", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host", handle: "feeddel" });
      const d = await makeBreak(tx, { hostId: host.id, status: "draft" });
      await tx.execute(sql`update breaks set deleted_at = now() where id = ${d.id}`);
      const now = new Date();
      expect((await listFeed(tx, { sort: "newest", now })).map((b) => b.id)).not.toContain(d.id);
      expect(await listFeed(tx, { sort: "newest", hostHandle: "feeddel", now })).toEqual([]);
      expect((await feedHosts(tx)).map((h) => h.handle)).not.toContain("feeddel");
    });
  });
});
```

(Use whichever `FeedSort` value the file already uses for "newest".)

Create `tests/concurrency/drafts.test.ts`:

```ts
describe("concurrent draft saves", () => {
  it("the first photo and a Save racing on one client id make one break", async () => {
    const host = await db.transaction((tx) => makeUser(tx, { role: "host" }));
    const id = randomUUID();
    const results = await Promise.allSettled([0, 1].map((n) =>
      db.transaction((tx) => createDraft(tx, asHost(host), { ...input, title: `Race ${n}` }, { breakId: id }))));
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(await db.select().from(breaks).where(sql`${breaks.id} = ${id}`)).toHaveLength(1);
    const created = await db.select().from(events).where(sql`${events.breakId} = ${id} and ${events.type} = 'break.created'`);
    expect(created).toHaveLength(1);
    expect(await db.select().from(prizes).where(sql`${prizes.breakId} = ${id}`)).toHaveLength(input.items.length);
  });
});
```

- [ ] **Step 2: Run the domain tests to verify they fail**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/domain/breaks && pnpm test:concurrency tests/concurrency/drafts.test.ts`
Expected: FAIL for the new behaviour: `deleteDraft` is not exported; `createDraft` ignores the id (the idempotency
tests see two rows or a new id); `draftForEdit` returns names, not slots, and still finds a deleted draft;
`getBreakPage`, `listHostBreaks` and `lastBreakDefaults` still return the deleted draft; `validatePrizes` does not
exist so the bad-slot and bad-condition cases resolve. `tsc` errors on the `CreateDraftInput` literals are expected
until Step 3.
PASS already, as labelled: the four regression pins ("freezes a prize's condition", "hostProfile and hostTrust",
"waitingOnHost and myLines", "listFeed … feedHosts"). If any of them fails here, stop and report: Task 2's column,
guard or trigger is not what this task consumes.

- [ ] **Step 3: Implement the condition module, `validatePrizes`, the commands and the query filters**

- `src/domain/breaks/condition.ts` and `validatePrizes` as in Produces; `rules.ts` re-exports `condition.ts`.
- `createDraft(tx, caller, input, opts?: { breakId?: string })`: onboarding, role and input checks as today, plus
  `validatePrizes([...items, ...named secondPlace])` and `isUuid(opts.breakId)` (else `InvalidInput("This form is out
  of date. Reload the page and try again.")`). With an id: `insert … on conflict (id) do nothing returning id`
  (Drizzle `onConflictDoNothing({ target: breaks.id })`) before saving handles. A returned row: carry on as today
  (handles, prizes, `break.created`). No row: `lockBreak(tx, id)` (a concurrent insert of the same id has committed by
  then; a deleted break throws `NotFound`), refuse `b.hostId !== caller.id` with `NotAuthorized("Only the host can do
  that")`, then `return updateDraft(tx, caller, id, input)` (ruling R3.2).
- `insertPrizes`: also writes `slotKey`, `condition`; `breakItems.createdAt` set to `sql\`clock_timestamp()\``
  (ruling R3.4).
- `updateDraft`: `validatePrizes` as in `createDraft`; replace the delete-all with `syncPrizes(tx, breakId, input)`
  (private): read the break's item prizes (`item_id is not null`) with their slot keys; for an input slot already
  present update its item (`name`, `variantSchema`, `expectedShipAt`, `condition`) and its prize `rank` if different;
  insert the rest through the same path as `insertPrizes`; delete the prizes of slots not in the input, then their
  items, then `update break_photos set prize_slot = null where break_id = $1 and prize_slot = any($removed)`. The
  `break.updated` payload is unchanged.
- `deleteDraft`: `assertOnboarded`; `assertHostOf` (locks; host or admin); `status !== "draft"` → `NotOpen`; select
  `bucket`, `path` from `break_photos` (every row); delete `break_photos`, `photo_uploads`, prizes, items; set
  `deletedAt: new Date()`; `appendEvent({ breakId, actorId: caller.id, type: "break.deleted", payload: { photos:
  rows.length } })`; return `{ photos: rows.flatMap((r) => (r.path === null ? [] : [{ location: r.bucket, prefix:
  r.path }])) }` (`r.path` is `string | null`; the narrowing keeps `prefix: string` and `tsc` clean).
- `lockBreak` (`src/auth/authz.ts`): a row with `deletedAt` set throws `NotFound("Break not found")`.
- `queries.ts`: `draftForEdit` selects `slotKey` and `condition`, orders by rank then `break_items.created_at`, and
  returns `null` for a deleted break; `getBreakPage` returns `null` for a deleted break; `listHostBreaks` and
  `lastBreakDefaults` add `isNull(breaks.deletedAt)`.

- [ ] **Step 4: Bridge the composer so the app compiles until Task 3b**

`DraftForEdit` and `CreateDraftInput` changed shape, so the composer no longer type-checks. Make the two smallest
changes that keep it working, each marked `// Task 3b replaces this` (3b rewrites both functions):
- `initial.ts` `draftComposerInitial`: `prize1: d.topSpot.length > 0 ? d.topSpot.map((p) => p.name) : [""]`,
  `prize2: d.secondPlace.map((p) => p.name).join(", ")`.
- `parse.ts`: each named prize becomes `{ name, slotKey: crypto.randomUUID(), condition: "new_in_box" as const }`
  (the composer posts no slot or condition until 3b; a re-save therefore replaces the slots, as every save does today).

Both commits land in one branch and one PR; the bridge never ships on its own.

- [ ] **Step 5: Run the domain tests and every gate to verify they pass**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/domain && pnpm test:concurrency`
Expected: PASS, including every existing `createDraft`/`updateDraft`/`openBreak` test with the `prize(…)` literals,
and the four regression pins.

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:ci`
then (sandbox off) `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && /usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test:e2e`
Expected: all green, no lint warnings, no flake (the composer e2e runs unchanged through the bridge).

- [ ] **Step 6: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && git add src/domain/breaks src/auth/authz.ts tests/helpers/fixtures.ts \
  tests/concurrency/drafts.test.ts src/app/host/new/parse.ts src/app/host/new/initial.ts
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && git commit -m "feat(breaks): stable prize slots, item condition, idempotent drafts and deleteDraft"
```

### Task 3b: Composer slots and condition, Delete draft UI (model: Opus)

Spec §7 (condition), §9 (the composer's id, Delete draft). The composer gives every prize row a stable slot and a
condition select, posts the new break's id, and the draft editor and /host gain **Delete draft**. Rulings R3.3 and
R3.5 (Task 3a) and panel rulings 12, 21, 22 and 39 apply.

**Files:**
- Create: `src/app/host/new/prize-rows.ts`, `src/app/host/new/prize-rows.test.ts` (the composer's prize rows, pure)
- Create: `src/app/host/new/draft-address.ts`, `src/app/host/new/draft-address.test.ts`
- Modify: `src/app/host/new/parse.ts`, `parse.test.ts`, `initial.ts`, `initial.test.ts`, `form.tsx`,
  `form-render.test.ts`, `actions.ts`, `page.tsx`; `src/app/host/[id]/edit/page.tsx`
- Create: `src/app/host/actions.ts` (`deleteDraftAction`, the only home of this action), `src/app/host/actions.test.ts`,
  `src/app/host/delete-draft-button.tsx`, `src/app/host/delete-draft-button.test.ts`
- Modify: `src/app/host/page.tsx` (Delete draft on draft rows)
- Modify: `e2e/helpers.ts`, `e2e/journey-1.spec.ts`, `e2e/journey-2.spec.ts`, `e2e/layout.spec.ts` (choose a
  condition), `e2e/pages.spec.ts` (the Delete draft journey)

**Interfaces:**
- Consumes (Task 3a): `ITEM_CONDITIONS`, `ItemCondition`, `isItemCondition`, `CONDITION_LABEL`
  (`@/domain/breaks/condition`); `PrizeInput`, `CreateDraftInput`, `createDraft(tx, caller, input, { breakId })`,
  `updateDraft`, `deleteDraft` (`@/domain/breaks/commands`); `DraftForEdit.topSpot`/`.secondPlace` as `{ slotKey;
  name; condition: ItemCondition | null }[]`. Existing: `action`, `ActionFailure`, `parseInput`, `getCaller`,
  `withTx`, `makeUser`, `Button`.
- Produces (for Tasks 6, 7b and 12):
  - `ComposerInitial`: gains `newBreakId: string | null` (set for a new break; `breakId` stays the editing id);
    `prize1: PrizeRow[]`, `prize2: PrizeRow | null`, where `type PrizeRow = { slotKey: string; name: string;
    condition: ItemCondition | "" }` (`prize-rows.ts`). `newComposerInitial(defaults, handles, newId: () =>
    string)`, `draftComposerInitial(d, handles, newId: () => string)`.
  - `composerBreakId(initial: ComposerInitial): string` (`initial.ts`) = `initial.newBreakId ?? initial.breakId`
    (ruling 22): the composer's id, always the server's (`randomUUID` from `node:crypto` in `page.tsx`, the draft's id
    in the editor), never a client `crypto.randomUUID()`. Task 7b's strip and `ensureDraftAction` use it.
  - Form fields: `newBreakId` (hidden, a new break only), `breakId` (hidden, the draft editor, as today),
    `prize1`/`prize1Slot`/`prize1Condition` (repeated, same order), `prize2`/`prize2Slot`/`prize2Condition`.
  - `moveToEditAddress(breakId: string): void`, `editAddress(breakId: string): string` (`draft-address.ts`), for
    Task 7b: `moveToEditAddress` calls `window.history.replaceState(null, "", editAddress(id))`, and does nothing when
    `location.pathname` is already that address. Passing `null` is what keeps the App Router's history state: Next's
    patched `replaceState` copies its own `__NA` and `__PRIVATE_NEXTJS_INTERNALS_TREE` keys from the current entry
    into the new one and syncs `usePathname`, so Back, reload and later server actions see `/host/{id}/edit` with the
    router tree intact. (Passing the current `history.state` through instead would carry `__NA`, which Next treats as
    its own call and skips that sync.) No navigation runs, so typing and uploads in flight survive.
  - `deleteDraftAction(breakId: string): Promise<ActionFailure>` (`src/app/host/actions.ts`, `"use server"`):
    redirects to `/host` on success; Task 6 adds the storage removal (skipping null paths, already filtered by
    `deleteDraft`) between the transaction and the redirect.
  - `DeleteDraftButton({ breakId, title }: { breakId: string; title: string })` (client).

- [ ] **Step 1: Write the failing composer tests**

`src/app/host/new/prize-rows.ts` holds the composer's prize rows as pure functions over `PrizeRow[]` so slots are
testable outside React. `src/app/host/new/prize-rows.test.ts`:

```ts
const ids = () => { let n = 0; return () => `00000000-0000-4000-8000-00000000000${++n}`; };
describe("composer prize rows", () => {
  it("gives a new row its own slot when it is added, and removing a row keeps the others' slots", () => {
    const newId = ids();
    let rows = [blankRow(newId)];
    rows = addChoice(rows, newId); rows = addChoice(rows, newId);
    expect(rows.map((r) => r.slotKey)).toEqual([1, 2, 3].map((n) => `00000000-0000-4000-8000-00000000000${n}`));
    rows = removeChoice(rows, 1);
    expect(rows.map((r) => r.slotKey)).toEqual(["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000003"]);
    expect(removeChoice(rows, 0)).toEqual(rows); // row 0 is never removed
  });
  it("changes a row's name or condition without touching its slot", () => {
    const rows = [{ slotKey: "s1", name: "", condition: "" as const }];
    expect(setName(rows, 0, "Chronos 22g")).toEqual([{ slotKey: "s1", name: "Chronos 22g", condition: "" }]);
    expect(setCondition(rows, 0, "used")).toEqual([{ slotKey: "s1", name: "", condition: "used" }]);
    expect(rows).toEqual([{ slotKey: "s1", name: "", condition: "" }]); // inputs are not mutated
  });
});
```

Signatures: `blankRow(newId: () => string): PrizeRow`; `addChoice(rows, newId)`; `removeChoice(rows, i)` (never row
0); `setName(rows, i, name)`; `setCondition(rows, i, c: ItemCondition | "")`; all return new arrays.

`src/app/host/new/draft-address.test.ts`:

```ts
afterEach(() => { vi.unstubAllGlobals(); });
it("moves the composer to the draft's edit address without a navigation, letting Next keep its history state", () => {
  const replaceState = vi.fn();
  vi.stubGlobal("window", { history: { state: { __NA: true }, replaceState }, location: { pathname: "/host/new" } });
  moveToEditAddress("6f1c2a3b-0000-4000-8000-000000000001");
  expect(replaceState).toHaveBeenCalledWith(null, "", "/host/6f1c2a3b-0000-4000-8000-000000000001/edit");
  expect(editAddress("abc")).toBe("/host/abc/edit");
});
it("does nothing when the composer is already at that address", () => {
  const replaceState = vi.fn();
  vi.stubGlobal("window", { history: { state: null, replaceState }, location: { pathname: "/host/abc/edit" } });
  moveToEditAddress("abc");
  expect(replaceState).not.toHaveBeenCalled();
});
```

(The App Router's own behaviour, Back and reload after the move, is asserted by Task 7b's composer e2e, which is
where `moveToEditAddress` is first called.)

`parse.test.ts`: `base` gains `prize1Slot: S1, prize1Condition: "new_in_box"` (S1…S4 fixed uuids); existing
expectations' items gain `slotKey`/`condition`. Add:

```ts
it("pairs each prize with its slot and condition, dropping blank rows with theirs", () => {
  const r = parseComposer(form({ ...base, prize1: ["Chronos 22g", " ", "Chronos 24g"], prize1Slot: [S1, S2, S3], prize1Condition: ["new_in_box", "", "used"],
    prize2: "Flight pack", prize2Slot: S4, prize2Condition: "new_opened" }));
  expect(r).toMatchObject({ ok: true, input: {
    items: [{ name: "Chronos 22g", slotKey: S1, condition: "new_in_box" }, { name: "Chronos 24g", slotKey: S3, condition: "used" }],
    secondPlace: [{ name: "Flight pack", slotKey: S4, condition: "new_opened" }] } });
  expect(parseComposer(form({ ...base, prize2: " ", prize2Slot: S4, prize2Condition: "" }))).toMatchObject({ ok: true, input: { secondPlace: [] } });
});
it("asks for the condition of every named prize, the top spot included (ruling 21)", () => {
  expect(parseComposer(form({ ...base, prize1Condition: "" }))).toEqual({ ok: false, error: "Chronos 22g: choose its condition" });
  expect(parseComposer(form({ ...base, prize1Condition: "mint" }))).toEqual({ ok: false, error: "Chronos 22g: choose its condition" });
  expect(parseComposer(form({ ...base, prize2: "Flight pack", prize2Slot: S4, prize2Condition: "" }))).toEqual({ ok: false, error: "Flight pack: choose its condition" });
});
it("refuses a missing, malformed or repeated slot key", () => {
  const stale = { ok: false, error: "This form is out of date. Reload the page and try again." };
  expect(parseComposer(form({ ...base, prize1Slot: "x" }))).toEqual(stale);
  expect(parseComposer(form({ ...base, prize1: ["A", "B"], prize1Slot: [S1, S1], prize1Condition: ["used", "used"] }))).toEqual(stale);
  expect(parseComposer(form({ ...base, prize1: ["A", "B"], prize1Slot: [S1], prize1Condition: ["used", "used"] }))).toEqual(stale);
});
```

`initial.test.ts`: `newComposerInitial(null, {}, ids())` equals the old object with `newBreakId: id1`,
`prize1: [{ slotKey: id2, name: "", condition: "" }]`, `prize2: null`; `draftComposerInitial(d, …, ids())` with
`topSpot: [{ slotKey: "s1", name: "22g", condition: "new_in_box" }, { slotKey: "s2", name: "24g", condition: null }]`,
`secondPlace: [{ slotKey: "s3", name: "Flights", condition: "used" }]` gives `newBreakId: null`, `prize1` with
`condition: ""` for the null one, `prize2: { slotKey: "s3", name: "Flights", condition: "used" }`; an empty `topSpot`
gives one blank row with `id1`; two 2nd-place items give `prize2: { slotKey: <first>, name: "Flights, Darts case",
condition: <first's> }`. Add:

```ts
it("the composer's id is the new break's id, else the draft's (ruling 22)", () => {
  expect(composerBreakId(newComposerInitial(null, {}, ids()))).toBe("00000000-0000-4000-8000-000000000001");
  expect(composerBreakId(draftComposerInitial(draft, {}, ids()))).toBe(draft.id);
});
```

`form-render.test.ts` adds:

```ts
it("posts the new break's id, a hidden slot per prize row and a required condition select", () => {
  const h = renderToStaticMarkup(createElement(ComposerForm, { initial: newComposerInitial(null, {}, ids()), maxLines: 50, kit: PLUM_LIME }));
  expect(h).toContain('name="newBreakId" value="00000000-0000-4000-8000-000000000001"');
  expect(h).toContain('name="prize1Slot" value="00000000-0000-4000-8000-000000000002"');
  expect(h).toMatch(/<select[^>]*name="prize1Condition"[^>]*required/);
  expect(h).toMatch(/<option value="">Condition<\/option><option value="new_in_box">New in box<\/option><option value="new_opened">New, opened<\/option><option value="used">Used<\/option>/);
  expect(h).not.toContain('name="breakId"');
  expect(h).not.toContain('data-testid="delete-draft"'); // a new break has nothing to delete
});
it("the draft editor posts the draft's id, keeps each prize's slot and condition, and requires a condition on every named row", () => {
  const d = { ...draft, topSpot: [{ slotKey: S1, name: "22g", condition: "used" as const }, { slotKey: S3, name: "24g", condition: null }],
    secondPlace: [{ slotKey: S2, name: "Flights", condition: "new_opened" as const }] };
  const h = renderToStaticMarkup(createElement(ComposerForm, { initial: draftComposerInitial(d, {}, ids()), maxLines: 50, kit: PLUM_LIME }));
  expect(h).toContain(`name="breakId" value="${d.id}"`);
  expect(h).not.toContain('name="newBreakId"');
  expect(h).toContain(`name="prize1Slot" value="${S1}"`);
  expect(h).toContain(`name="prize1Slot" value="${S3}"`);
  expect(h).toContain(`name="prize2Slot" value="${S2}"`);
  expect(h).toMatch(/<option value="used" selected="">Used<\/option>/);
  expect(h.match(/<select[^>]*name="prize1Condition"[^>]*required/g)).toHaveLength(2); // both rows are named
  expect(h).toMatch(/<select[^>]*name="prize2Condition"[^>]*required/);
  expect(h).toContain('data-testid="delete-draft"');
});
```

(`draft` is a `DraftForEdit` literal like the one in `initial.test.ts`; add `vi.mock("../actions", () => ({
deleteDraftAction: vi.fn() }))` next to the existing `./actions` mock.)

`src/app/host/delete-draft-button.test.ts` (with `vi.mock("./actions", () => ({ deleteDraftAction: vi.fn() }))`):

```ts
it("renders the Delete draft button and keeps the confirm closed", () => {
  const h = renderToStaticMarkup(createElement(DeleteDraftButton, { breakId: "6f1c2a3b-0000-4000-8000-000000000001", title: "Target Chronos" }));
  expect(h).toMatch(/<button[^>]*type="button"[^>]*data-testid="delete-draft"[^>]*>Delete draft<\/button>|<button[^>]*data-testid="delete-draft"[^>]*type="button"[^>]*>Delete draft<\/button>/);
  expect(h).not.toContain("Delete this draft?");
  expect(h).not.toContain('data-testid="delete-draft-confirm"');
});
```

`src/app/host/actions.test.ts` (ruling 39; harness as `src/app/b/[id]/og/route.test.ts`: mock `@/db/client` so
`db.transaction` runs inside the test's `withTx` transaction; mock `@/auth/session` with `getCaller: async () =>
caller`; mock `next/cache` with `revalidatePath: vi.fn()`; mock `next/navigation` keeping the real module and
replacing `redirect` with `vi.fn((to: string) => { throw new Redirected(to); })`, where `class Redirected extends
Error { constructor(readonly to: string) { super(to); } }`):

```ts
it("deletes the caller's draft: deleted_at is set, the row stays as a tombstone, and it redirects to /host", async () => {
  await withTx(async (tx) => {
    current = tx;
    const host = await makeUser(tx, { role: "host" }); caller = as(host, "host");
    const { breakId } = await createDraft(tx, caller, input);
    await expect(deleteDraftAction(breakId)).rejects.toMatchObject({ to: "/host" });
    expect(redirect).toHaveBeenCalledWith("/host");
    expect(revalidatePath).toHaveBeenCalledWith("/host");
    const [row] = await tx.select().from(breaks).where(eq(breaks.id, breakId));
    expect(row.deletedAt).toBeInstanceOf(Date);
    expect(row.status).toBe("draft");
  });
});
it("answers the refusal and changes nothing for another host's draft, a non-uuid, or no session", async () => {
  await withTx(async (tx) => {
    current = tx;
    const host = await makeUser(tx, { role: "host" }); const other = await makeUser(tx, { role: "host" });
    const { breakId } = await createDraft(tx, as(host, "host"), input);
    caller = as(other, "host");
    expect(await deleteDraftAction(breakId)).toMatchObject({ ok: false, code: "NOT_AUTHORIZED" });
    expect(await deleteDraftAction("b1")).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    caller = null;
    expect(await deleteDraftAction(breakId)).toMatchObject({ ok: false, code: "NOT_SIGNED_IN" });
    expect(redirect).not.toHaveBeenCalled();
    const [row] = await tx.select().from(breaks).where(eq(breaks.id, breakId));
    expect(row.deletedAt).toBeNull();
  });
});
```

(`NOT_AUTHORIZED` and `INVALID_INPUT` are the codes of `NotAuthorized` and `InvalidInput` in `src/domain/errors.ts`;
reset the mocks and `caller` in `beforeEach`.)

- [ ] **Step 2: Run the composer tests to verify they fail**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/app/host`
Expected: FAIL. `prize-rows`, `draft-address`, `actions` (in `src/app/host`) and `delete-draft-button` fail to
resolve; `composerBreakId` is not exported; the parse tests see the bridge's random slots and default condition; the
render tests find no `newBreakId`, `prize1Slot` or `select`.

- [ ] **Step 3: Implement the composer and Delete draft**

- `parse.ts` (replaces 3a's bridge): read `prize1`, `prize1Slot`, `prize1Condition` with `getAll`; unequal lengths, a
  non-uuid or a repeated slot (across rank 1 and 2) → the stale-form error; zip, drop rows whose trimmed name is
  blank, then any remaining row whose condition fails `isItemCondition` → `` `${name}: choose its condition` ``. The
  check order stays: existing field errors first, then "Top spot: name the prize", then slots, then conditions.
- `initial.ts` (replaces 3a's bridge): as in Produces, plus `composerBreakId`; `page.tsx` passes `randomUUID` from
  `node:crypto`; the edit page passes it too (for the blank row of a draft with no top spot).
- `form.tsx`: `choices` state becomes `PrizeRow[]` driven by `prize-rows.ts`, `second` becomes `PrizeRow | null` ("Add
  2nd place" makes one with `crypto.randomUUID()`: a slot key, not the break id); both are controlled, so slots and
  conditions survive re-renders and a failed save (React resets only uncontrolled fields). Each row renders its name
  input, `<input type="hidden" name="prize1Slot">`, and a `<select name="prize1Condition">` labelled "Condition"
  (visually hidden label tied to the row's name label; options from `ITEM_CONDITIONS`/`CONDITION_LABEL` imported from
  `@/domain/breaks/condition`); `required` when `i === 0 || row.name.trim() !== ""` (ruling 21; 2nd place: when its
  name is filled). Hidden `newBreakId` when `initial.newBreakId`, hidden `breakId` as today. When `initial.breakId` is
  set (the draft editor), the form renders `DeleteDraftButton` below its submit buttons, outside the `<form>` element
  (its button is `type="button"`, so it never submits the composer).
- `actions.ts` (`saveBreak`): `breakId` set → `updateDraft` as today; else `newBreakId` must be a uuid (else "This form
  is out of date. Reload the page and try again.") → `createDraft(tx, caller, parsed.input, { breakId: newBreakId })`.
  Redirect unchanged (ruling R3.3).
- `draft-address.ts`: `editAddress`, `moveToEditAddress` as in Produces.
- `src/app/host/actions.ts` (`"use server"`): `deleteDraftAction(breakId)`: `parseInput(uuid, breakId)`; on failure
  return it; `const r = await action((tx, c) => deleteDraft(tx, c, id))`; `if (!r.ok) return r`; (Task 6 inserts the
  storage removal of `r.data.photos` here); `revalidatePath("/host")`; `redirect("/host")` (outside `action`, so the
  redirect does not roll the transaction back).
- `delete-draft-button.tsx` (client, ledger-row's inline-confirm pattern): "Delete draft" (`Button variant="text"`,
  `type="button"`, `data-testid="delete-draft"`) opens an inline confirm: "Delete this draft? Its prizes and photos go
  too. This can't be undone." with "Delete draft" (`variant="secondary"`, `data-testid="delete-draft-confirm"`,
  disabled while pending) and "Keep"; a failure shows its message in `role="alert"`.
- `src/app/host/page.tsx`: a draft row renders `DeleteDraftButton` beside, not inside, its `Link`.

- [ ] **Step 4: Run the composer tests to verify they pass**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/app/host src/lib/copy-audit.test.ts`
Expected: PASS; the copy audit accepts "New in box", "New, opened", "Used", "Condition", "Delete draft", "Keep" and
the confirm sentence.

- [ ] **Step 5: Update the e2e composer fills and add the Delete draft journey**

Every composer fill (`e2e/helpers.ts` `composeBreak`, journey-1, journey-2 both choices and 2nd place, layout lines
31 and 246) adds `selectOption("select[name=prize1Condition]", "new_in_box")` per row (and
`prize2Condition` where 2nd place is filled). journey-2's edit step also asserts the conditions came back
(`toHaveValue("new_in_box")`). In `e2e/pages.spec.ts`:

```ts
test("a host deletes a draft from its editor and another from /host", async ({ browser }) => {
  // host signs in; composeBreak(..., { title: "Delete me 1", intent: "draft" }) → id1; again "Delete me 2" → id2
  await host.goto(`/host/${id1}/edit`);
  await host.getByTestId("delete-draft").click();
  await host.getByTestId("delete-draft-confirm").click();
  await host.waitForURL(/\/host$/);
  await expect(host.getByText("Delete me 1")).toHaveCount(0);
  expect((await host.goto(`/host/${id1}/edit`))?.status()).toBe(404);
  await host.goto("/host");
  const row = host.getByTestId("group-draft").getByRole("listitem").filter({ hasText: "Delete me 2" });
  await row.getByTestId("delete-draft").click();
  await row.getByText("Keep").click(); // nothing happens
  await expect(host.getByText("Delete me 2")).toBeVisible();
  await row.getByTestId("delete-draft").click();
  await row.getByTestId("delete-draft-confirm").click();
  await expect(host.getByText("Delete me 2")).toHaveCount(0);
  expect((await host.goto(`/b/${id2}`))?.status()).toBe(404);
});
```

- [ ] **Step 6: Run every gate**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:concurrency && pnpm test:ci`
then (sandbox off) `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && /usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test:e2e`
Expected: all green, no lint warnings, no flake; no `// Task 3b replaces this` marker left
(`grep -rn "Task 3b replaces this" src` prints nothing); axe passes on /host/new, /host/[id]/edit and /host with the
new select and the Delete draft button.

- [ ] **Step 7: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && git add src/app/host e2e
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && git commit -m "feat(host): composer prize slots and condition, Delete draft"
```

#### Contract changes (Tasks 3a and 3b; context only, the plan's rulings win where they differ, ruling 20)

1. **`ItemCondition` lives in Task 3a**, in a new import-free `src/domain/breaks/condition.ts` (with
   `ITEM_CONDITIONS`, `isItemCondition`, `CONDITION_LABEL`), re-exported by `src/domain/breaks/rules.ts`. Task 5's
   `src/domain/photos/types.ts` re-exports `ItemCondition` and `CONDITION_LABEL` from it instead of defining them
   (no cycle: breaks never imports photos except the `PhotoLocation` type). The separate file, not `rules.ts`, because
   the client composer imports the labels and the composer's convention is to import no domain module with
   dependencies.
2. **Task 2 adds `breaks.deleted_at timestamptz` (nullable)** to migration 0005 and `deletedAt` to the schema, with a
   guard: `deleted_at` may be set only while `status = 'draft'`, is never cleared or changed, and a break with
   `deleted_at` set cannot change `status`. Reason: `events.break_id` references `breaks` with no cascade and events
   are append-only, so a draft's row cannot be deleted while its events are kept. Task 11's cleanup treats
   `deleted_at is not null` as "photos of deleted drafts".
3. **Task 2's assumed shapes**: `prizes.slot_key uuid not null default gen_random_uuid()` with a unique index on
   `(break_id, slot_key)` (the default keeps `makeBreak`, minis and old rows working); `break_items.condition text`
   nullable with the three-value check. If Task 2 chose otherwise, Task 3a's Interfaces follow Task 2.
4. **`createDraft`'s return** stays `{ breakId: string }`; with an existing id it applies the input through
   `updateDraft` (ruling R3.2) rather than returning untouched, so a Save pressed while the first photo created the
   draft does not lose the host's latest typing.
5. **`deleteDraftAction` lives only in `src/app/host/actions.ts` (Task 3b)**, not `src/app/photos/actions.ts`: it
   returns `ActionFailure` or redirects to `/host`. Task 6 adds the storage removal of the returned photos (whose
   paths are never null) after the transaction and before the redirect (best effort; Task 11's cleanup is the
   backstop), and its test asserts `deleted_at` is set, never that the row is gone (ruling 39).
6. **`lockBreak` refuses a deleted break with `NotFound`**, so Task 5's photo commands need no deleted check of their
   own.
7. **Composer names** for Task 7b: fields `newBreakId`, `prize1Slot`, `prize1Condition`, `prize2Slot`,
   `prize2Condition`; the composer's id is `composerBreakId(initial)` (ruling 22, never a client `randomUUID`); the
   strip reads prize slots and names from the form's `PrizeRow` state, and calls `moveToEditAddress(id)` once its first
   photo has created the draft.
### Task 4: `processPhoto`, sharp hardening and variants (model: Opus)

The server re-encode that is the security control of spec §5.3 steps 2–3 and §10: magic bytes first, then a
bounded sharp decode that never picks a format on its own, then three WebP variants (160, 640, 1600 px on the long
edge) with no metadata, upright, never upscaled (recorded ruling 4). Every sharp pipeline carries `.timeout({ seconds: 8
})`, and a timeout is refused as `UnsupportedImage` (panel ruling 29). `failOn: "error"` is kept on purpose: it refuses
corrupt data (a truncated JPEG) but lets through the harmless warnings phone JPEGs often carry, which `"warning"` would
refuse (panel ruling 29). A polyglot (a real JPEG carrying other bytes) is accepted and re-encoded; its variants hold
pixels only (panel ruling 32, amending spec §11's "refused"). Pure Node: no database, no storage. Review Focus 1 (odd
images) is pinned here.

**sharp is already in the tree.** `pnpm-lock.yaml` resolves `sharp@0.35.5` as an optional dependency of `next@16.4.2`
(`"sharp": "^0.35.5"`), with libvips 8.18.7, and lists `@img/sharp-linux-x64@0.35.5` (glibc) and
`@img/sharp-libvips-linux-x64@1.3.4` among its optional packages, so the Vercel build (Linux x64, glibc) installs the
right binary; this Mac installs `@img/sharp-darwin-x64`. sharp 0.35 has no install script, so `allowBuilds` in
`pnpm-workspace.yaml` needs no entry. sharp is in Next's built-in `serverExternalPackages`, so `next.config.ts` needs no
change. Pin the same version so there is one copy. Note the prebuilt libvips includes librsvg, cgif, libtiff and libheif:
SVG, GIF, TIFF and AVIF/HEIF **would** decode if handed over, which is why the magic-byte check and the decoded-format
assertion both exist.

**Fixtures are generated, not committed.** `tests/fixtures/photos/make.ts` builds every fixture in memory with sharp
plus a few spliced bytes (a JPEG COM and APP13 segment, a PNG `tEXt` and a forged `IHDR`, with `zlib.crc32`), memoised
per process. No binary blob enters the repository, the fixtures are reviewable as code, and Task 6's route tests reuse
them. Verified against sharp 0.35.5 while writing this task: `withExif` (IFD0 and IFD3 GPS), `withXmp`,
`withIccProfile("p3")` and `withMetadata({ orientation: 6 })` all read back from `metadata()`; a spliced APP13 reads
back as `iptc`; a PNG `tEXt` reads back as `comments`; a JPEG COM is **not** surfaced by `metadata()`, so its absence is
checked by a byte search; a forged 60000 × 60000 `IHDR` is refused by the pixel limit; a truncated JPEG throws
"premature end of JPEG image" with `failOn: "error"`.

**Files:**
- Modify: `package.json` (`"sharp": "0.35.5"` in `dependencies`, exact), `pnpm-lock.yaml`
- Create: `src/photos/process.ts`
- Create: `tests/fixtures/photos/make.ts`
- Test: `src/photos/process.test.ts`, `src/photos/process-timeout.test.ts` (separate file: it spies on sharp's
  prototype, which must not leak into the fixture-driven tests)

**Interfaces:**
- Consumes: `VARIANT_WIDTHS`, `VariantWidth` (Task 1, `src/storage/buckets.ts`).
- Produces (contract, unchanged):
  - `MAX_INCOMING_BYTES = 5 * 1024 * 1024`
  - `class UnsupportedImage extends Error {}`
  - `type Processed = { width: number; height: number; variants: { width: VariantWidth; body: Buffer }[] }` — `width`
    and `height` are the 1600 variant's actual pixel size (spec §4: "of the largest variant"); `variants` is in
    `VARIANT_WIDTHS` order; `variants[i].width` is the label, the body may be smaller (ruling 4).
  - `processPhoto(input: Buffer): Promise<Processed>` — throws `UnsupportedImage` for every refusal, never a raw sharp
    error.
  - Test-only: `photoFixtures(): Promise<Record<PhotoFixture, Buffer>>` from `tests/fixtures/photos/make.ts`, with
    `PhotoFixture` = `"portrait" | "alphaPng" | "tiny" | "panorama" | "atLimit" | "overLimit" | "pixelBomb" | "headerBomb" | "svg" |
    "gif" | "tiff" | "avif" | "htmlAsJpg" | "polyglot" | "truncated" | "empty"`.

- [ ] **Step 1: Add sharp as a direct, pinned dependency and confirm the Linux build is locked**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm add sharp@0.35.5 --save-exact`
Then: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && grep -c "'@img/sharp-linux-x64@0.35.5'\|'@img/sharp-libvips-linux-x64@1.3.4'" pnpm-lock.yaml && pnpm why sharp`
Expected: the grep count is at least 2; `pnpm why` shows `sharp 0.35.5` as a direct dependency and under `next`, one
version only; `git diff package.json` adds exactly `"sharp": "0.35.5"`.

- [ ] **Step 2: Write the fixture generator `tests/fixtures/photos/make.ts`**

`export async function photoFixtures(): Promise<Record<PhotoFixture, Buffer>>`, memoised in a module-level promise.
Each entry, all made with `sharp({ create })` unless stated:

| Name | What it is |
|---|---|
| `portrait` | 400 × 300 JPEG stored sideways: left half `#ff0000`, right half `#0000ff` (composite two `create` tiles); `withExif({ IFD0: { Make: "Phone" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "14/1 41/1 0/1" } })`, `withXmp(<a minimal x:xmpmeta packet>)`, `withIccProfile("p3")`, `withMetadata({ orientation: 6 })`; then an APP13 `Photoshop 3.0` / `8BIM` 0x0404 segment with IPTC 2:120 `"caption here"` spliced after SOI, and a COM segment `"shot at home"` spliced before SOS |
| `alphaPng` | 300 × 200 RGBA PNG, every pixel alpha 128, with a `tEXt` chunk `Comment\0shot at home` spliced after `IHDR` |
| `tiny` | 100 × 100 JPEG |
| `panorama` | 4000 × 400 JPEG (10:1) |
| `atLimit` | 4000 × 3000 JPEG (exactly 12 MP: accepted) |
| `overLimit` | 4001 × 3000 JPEG (one column over: refused; checked against sharp 0.35.5) |
| `pixelBomb` | 5000 × 5000 single-colour PNG (25 MP, a few kB on disk) |
| `headerBomb` | PNG signature + a forged `IHDR` declaring 60000 × 60000 RGB + one small deflated `IDAT` + `IEND` |
| `svg` | `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>` |
| `gif`, `tiff`, `avif` | 10 × 10, from `.gif()`, `.tiff()`, `.avif()` (AVIF stands in for HEIF: same `ftyp` box family) |
| `htmlAsJpg` | `<!doctype html><script>alert(1)</script>` (an upload whose name and declared type say JPEG) |
| `polyglot` | `tiny` with a COM segment `<script>alert(1)</script>` spliced before SOS: a real JPEG carrying HTML |
| `truncated` | the first 60 % of a 400 × 300 gaussian-noise JPEG |
| `empty` | `Buffer.alloc(0)` |

- [ ] **Step 3: Write the failing tests in `src/photos/process.test.ts` and `src/photos/process-timeout.test.ts`**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import sharp from "sharp";
import { processPhoto, UnsupportedImage, MAX_INCOMING_BYTES } from "./process";
import { photoFixtures } from "../../tests/fixtures/photos/make";

let fx: Awaited<ReturnType<typeof photoFixtures>>;
beforeAll(async () => { fx = await photoFixtures(); }, 60_000);
const sizeOf = async (b: Buffer) => { const m = await sharp(b).metadata(); return [m.width, m.height]; };
/** The RIFF chunk ids of a WebP file, in order (each chunk: 4-byte id, uint32 LE size, data padded to even). */
const webpChunks = (b: Buffer) => {
  const ids: string[] = [];
  for (let o = 12; o + 8 <= b.length; o += 8 + b.readUInt32LE(o + 4) + (b.readUInt32LE(o + 4) % 2)) ids.push(b.toString("latin1", o, o + 4));
  return ids;
};
const PIXEL_CHUNKS = ["VP8 ", "VP8L", "VP8X", "ALPH"];

describe("processPhoto refuses (spec §5.3 step 2)", () => {
  it.each(["svg", "gif", "tiff", "avif", "htmlAsJpg", "truncated", "empty", "overLimit", "pixelBomb", "headerBomb"] as const)(
    "%s throws UnsupportedImage", async (name) => {
      await expect(processPhoto(fx[name])).rejects.toBeInstanceOf(UnsupportedImage);
    });
  it("keeps the 5 MB cap the route downloads with", () => expect(MAX_INCOMING_BYTES).toBe(5_242_880));
});

describe("processPhoto variants (spec §5.3 step 3, recorded ruling 4)", () => {
  it("writes 160, 640 and 1600 WebP variants on the long edge, in that order", async () => {
    const p = await processPhoto(fx.atLimit);
    expect(p.variants.map((v) => v.width)).toEqual([160, 640, 1600]);
    for (const v of p.variants) expect((await sharp(v.body).metadata()).format).toBe("webp");
    expect(await Promise.all(p.variants.map((v) => sizeOf(v.body)))).toEqual([[160, 120], [640, 480], [1600, 1200]]);
    expect([p.width, p.height]).toEqual([1600, 1200]);
  });
  it("never upscales a source smaller than a variant", async () => {
    const p = await processPhoto(fx.tiny);
    expect(await Promise.all(p.variants.map((v) => sizeOf(v.body)))).toEqual([[100, 100], [100, 100], [100, 100]]);
    expect([p.width, p.height]).toEqual([100, 100]);
  });
  it("keeps a 10:1 panorama's proportions", async () => {
    const p = await processPhoto(fx.panorama);
    expect(await Promise.all(p.variants.map((v) => sizeOf(v.body)))).toEqual([[160, 16], [640, 64], [1600, 160]]);
  });
  it("stands the portrait photo upright: red on top, blue below, no orientation tag", async () => {
    const p = await processPhoto(fx.portrait);
    const big = p.variants[2].body;
    expect(await sizeOf(big)).toEqual([300, 400]);
    const { data, info } = await sharp(big).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
    expect(px(150, 50)[0]).toBeGreaterThan(200);   // red at the top
    expect(px(150, 350)[2]).toBeGreaterThan(200);  // blue at the bottom
    expect((await sharp(big).metadata()).orientation).toBeUndefined();
  });
  it("keeps transparency", async () => {
    const p = await processPhoto(fx.alphaPng);
    for (const v of p.variants) {
      const { data, info } = await sharp(v.body).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect((await sharp(v.body).metadata()).hasAlpha).toBe(true);
      expect(data[info.channels - 1]).toBeLessThan(255);
    }
  });
});

describe("processPhoto strips every piece of metadata (spec §5.3, §10)", () => {
  it("the fixtures really carry it", async () => {
    const m = await sharp(fx.portrait).metadata();
    expect([!!m.exif, !!m.xmp, !!m.iptc, !!m.icc, m.orientation]).toEqual([true, true, true, true, 6]);
    expect((await sharp(fx.alphaPng).metadata()).comments).toHaveLength(1);
  });
  it.each(["portrait", "alphaPng", "polyglot"] as const)("no EXIF, XMP, IPTC, ICC or comment in any variant of %s", async (name) => {
    const p = await processPhoto(fx[name]);
    for (const v of p.variants) {
      const m = await sharp(v.body).metadata();
      expect({ exif: m.exif, xmp: m.xmp, iptc: m.iptc, icc: m.icc, comments: m.comments }).toEqual(
        { exif: undefined, xmp: undefined, iptc: undefined, icc: undefined, comments: undefined });
      for (const s of ["shot at home", "Phone", "Photoshop", "xmpmeta", "<script"]) expect(v.body.includes(s), s).toBe(false);
      for (const id of webpChunks(v.body)) expect(PIXEL_CHUNKS, id).toContain(id); // no EXIF, XMP or ICCP chunk
    }
  });
});

describe("a polyglot is accepted and re-encoded to pixels only (panel ruling 32)", () => {
  it("the fixture really is a JPEG that carries HTML", async () => {
    expect((await sharp(fx.polyglot).metadata()).format).toBe("jpeg");
    expect(fx.polyglot.includes("<script>alert(1)</script>")).toBe(true);
  });
  it("is accepted, and no byte of the HTML survives in any variant", async () => {
    const p = await processPhoto(fx.polyglot);
    expect(p.variants.map((v) => v.width)).toEqual([160, 640, 1600]);
    for (const v of p.variants) {
      expect([v.body.toString("latin1", 0, 4), v.body.toString("latin1", 8, 12)]).toEqual(["RIFF", "WEBP"]);
      for (const s of ["<script", "script>", "alert(1)"]) expect(v.body.includes(s), s).toBe(false);
      const ids = webpChunks(v.body);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(PIXEL_CHUNKS, id).toContain(id);
    }
  });
});
```

`src/photos/process-timeout.test.ts` (panel ruling 29). **Why a spy and a stub, not a slow fixture:** sharp's timeout
counts whole seconds and every input the 12 MP limit lets through decodes and encodes in well under 8 s (well under 1 s
on this machine), so no fixture can reach the timeout deterministically; a test that relied on a slow image would be
the flaky kind the gates forbid. The mechanism is therefore pinned in two halves: (1) a spy on `sharp.prototype`
records, for every instance that produces output (`metadata()` or `toBuffer()`), the options its own `.timeout()` call
received, so a pipeline without its own timeout fails the test (a clone does not count as timed by its parent's call);
(2) a stub makes one `toBuffer()` reject with the error sharp raises when `.timeout` fires, and the test asserts it
surfaces as `UnsupportedImage`. sharp is a CommonJS dependency that vitest does not inline, so the test and
`process.ts` share one `sharp` function and one prototype; the spies are restored after each test.

```ts
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import sharp from "sharp";
import { processPhoto, UnsupportedImage } from "./process";
import { photoFixtures } from "../../tests/fixtures/photos/make";

let fx: Awaited<ReturnType<typeof photoFixtures>>;
beforeAll(async () => { fx = await photoFixtures(); }, 60_000);
afterEach(() => { vi.restoreAllMocks(); });
// The prototype every pipeline inherits `timeout`, `metadata` and `toBuffer` from.
const proto = sharp.prototype as sharp.Sharp;

describe("every sharp pipeline is bounded (panel ruling 29)", () => {
  it("each instance that produces output was given its own .timeout({ seconds: 8 })", async () => {
    const timed = new Map<object, unknown>();
    const ran: object[] = [];
    const { timeout, metadata, toBuffer } = proto;
    vi.spyOn(proto, "timeout").mockImplementation(function (this: sharp.Sharp, o) { timed.set(this, o); return timeout.call(this, o); });
    vi.spyOn(proto, "metadata").mockImplementation(function (this: sharp.Sharp, ...a: never[]) { ran.push(this); return (metadata as (...x: never[]) => unknown).apply(this, a); } as never);
    vi.spyOn(proto, "toBuffer").mockImplementation(function (this: sharp.Sharp, ...a: never[]) { ran.push(this); return (toBuffer as (...x: never[]) => unknown).apply(this, a); } as never);
    await processPhoto(fx.atLimit);
    expect(ran.length).toBeGreaterThanOrEqual(4); // the format check and the three variants
    for (const instance of ran) expect(timed.get(instance)).toEqual({ seconds: 8 });
  });
  it("a pipeline that runs past its timeout is refused as UnsupportedImage, never a raw sharp error", async () => {
    // The text sharp 0.35.5 rejects with when `.timeout` fires (copy it from its src/pipeline.cc and confirm it here).
    vi.spyOn(proto, "toBuffer").mockRejectedValueOnce(new Error("timeout: 30% complete") as never);
    const r = processPhoto(fx.atLimit);
    await expect(r).rejects.toBeInstanceOf(UnsupportedImage);
    await expect(r).rejects.toMatchObject({ cause: expect.objectContaining({ message: expect.stringMatching(/^timeout/) }) });
  });
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/photos/process.test.ts src/photos/process-timeout.test.ts`
Expected: FAIL in both files, "Cannot find module './process'".

- [ ] **Step 5: Implement `src/photos/process.ts`**

- No `server-only` import (the tests import the module directly); sharp is imported only here and by the fixtures.
- At module load, once: `sharp.concurrency(1); sharp.cache(false);`.
- `sniff(buf): "jpeg" | "png" | "webp" | null` — JPEG `FF D8 FF`; PNG `89 50 4E 47 0D 0A 1A 0A`; WebP `RIFF` at 0 and
  `WEBP` at 8. Anything else, including a buffer shorter than 12 bytes, throws `UnsupportedImage` before sharp sees it.
- `const PIPELINE_TIMEOUT = { seconds: 8 }` (module constant, not exported).
- `const img = sharp(buf, { limitInputPixels: 12e6, failOn: "error", pages: 1, animated: false }).timeout(PIPELINE_TIMEOUT)`;
  `await img.metadata()` and require `format` to equal the sniffed format (a WebP that libvips reads as something else
  is refused). `failOn: "error"`, not `"warning"`, is deliberate (panel ruling 29): comment it in the code so no one
  "tightens" it and starts refusing ordinary phone photos.
- `const base = img.rotate()` (EXIF orientation applied, the tag dropped; `autoOrient()` is equivalent in 0.35).
- Each variant: `base.clone().timeout(PIPELINE_TIMEOUT).resize({ width: w, height: w, fit: "inside", withoutEnlargement:
  true }).webp({ quality: 80 }).toBuffer()` for `w` of `VARIANT_WIDTHS`, awaited in order. Every clone sets its own
  timeout (the spy test does not accept an inherited one). No `withMetadata`, `keepExif`, `keepIccProfile` or
  `keepMetadata` call anywhere. WebP quality 80 is this plan's choice (the spec pins none).
- `width`/`height` from the 1600 variant's `toBuffer({ resolveWithObject: true }).info`.
- Wrap everything after the sniff: any error that is not already `UnsupportedImage` (a sharp timeout included) is
  rethrown as `new UnsupportedImage("unsupported image", { cause })`.

- [ ] **Step 6: Run the tests to see them pass**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/photos/process.test.ts src/photos/process-timeout.test.ts`
Expected: PASS, every case in both files; each file finishes in under 30 s.

- [ ] **Step 7: Gates**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec tsc --noEmit && pnpm lint && pnpm test` (sandbox off)
Expected: all clean, no warnings.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml src/photos/process.ts src/photos/process.test.ts src/photos/process-timeout.test.ts \
  tests/fixtures/photos/make.ts
git commit -m "feat(photos): re-encode uploads into three metadata-free WebP variants with sharp"
```

---


### Task 5: Photo domain: tickets, commands, notice, queries, concurrency (model: Opus)

The rules every photo change obeys, with no storage and no HTTP: the upload ticket (spec §5.2), recording a processed
photo (§5.3 step 5), remove, reorder, retag, describe and the admin hide, the notice of §6 with recorded rulings 1–3,
and the reads the pages use (§6, §8). Every command locks the break row first, checks ownership and status, keeps
live positions 0..n−1 with the lead at 0 (ruling 5), writes one audit event per committed action with `processed_at`
set, and writes `photos_updated_at` and `photos_updated_note` in the same transaction when a change counts. Task 6
moves files and wires the actions and the finalise route around these commands; this task touches no bucket.

**Files:**
- Create: `src/domain/photos/types.ts`, `src/domain/photos/notice.ts`, `src/domain/photos/commands.ts`, `src/domain/photos/queries.ts`
- Test: `src/domain/photos/notice.test.ts` (pure), `src/domain/photos/tickets.test.ts`, `src/domain/photos/commands.test.ts`, `src/domain/photos/queries.test.ts` (Postgres), `tests/concurrency/photos.test.ts`
- Modify: `src/domain/events.ts` (`appendEvent` gains `opts.processedAt`), `src/domain/events.test.ts`
- Modify: `src/domain/errors.ts` (`PhotosNotReady`, `UploadNotFound`, `UploadExpired`, `UploadUsed`; panel ruling 23)
- Modify: `tests/helpers/fixtures.ts` (`makePhoto`, `makeTicket`, `addPrize`, `newPrefix`). Not `tests/concurrency/setup.ts`: Task 2 already put the new tables in its truncate list, and its `truncate … cascade` clears them.

**Interfaces:**
- Consumes:
  - Task 2 schema (`src/db/schema.ts`): `breakPhotos` {`id`, `breakId`, `position`, `prizeSlot`, `path`, `bucket`, `width`, `height`, `alt`, `createdBy`, `createdAt`, `hiddenAt`, `removedAt`}; `photoUploads` {`id`, `hostId`, `breakId`, `incomingName`, `expiresAt`, `consumedAt`, `createdAt`}; `photoNoticesSeen` {`userId`, `breakId`, `seenAt`}, primary key (`user_id`, `break_id`); `breaks.firstClaimedAt`, `breaks.photosUpdatedAt`, `breaks.photosUpdatedNote`; `prizes.slotKey` (uuid, not null, default `gen_random_uuid()`). The claim commands set `first_claimed_at` (Task 2). The status trigger refuses photo row changes from `drawing` on and on `cancelled`, except inside a transaction that called `allowPhotoModeration(tx)` (`src/db/photo-moderation.ts`), which may change only `hidden_at`, `position`, `bucket` and `path` (ruling 10). `break_photos_gone_chk` is `path is not null or bucket = 'photo-archive'` (ruling 26): a row that is neither removed nor hidden can still be in `photo-archive` with a null path once a cancelled break's retention expired (Task 11's rule 4), so reads must not treat "not removed, not hidden" as live.
  - Task 3: `ItemCondition` from `src/domain/breaks/rules.ts`.
  - Task 1: `PREFIX_PATTERN` from `src/storage/buckets.ts`.
  - Task 2: `allowPhotoModeration(tx)` from `src/db/photo-moderation.ts`.
  - Existing: `lockBreak`, `assertHostOf`, `assertOnboarded`, `assertAdmin` (`src/auth/authz.ts`); `appendEvent`; `hitRateLimit` (`src/domain/rate-limit.ts`); `DomainError`, `InvalidInput`, `NotAuthorized`, `NotFound`, `NotOpen`, `notOpenMessage`; `Caller`, `SYSTEM`; `plural` (`src/lib/list.ts`); fixtures `makeUser`, `makeBreak`, `openBreakWithLines`; `claimLines`, `markPaid`, `releaseLine`, `requestDraw`.
- Produces (the plan's contracts, with the changes listed at the end of this file):
  - `src/domain/photos/types.ts`: `ItemCondition` (re-exported), `CONDITION_LABEL`, `MAX_PHOTOS = 8`, `PhotoLocation`, `PhotoChange`, and the limits `TICKET_SECONDS = 300`, `MAX_OPEN_TICKETS = 8`, `PHOTO_RATE = { hour: 30, day: 100 }`, `ALT_MAX = 120`, `rateBucket(step: "ticket" | "record", window: "hour" | "day", userId: string): string` (`photo-${step}-${window}:${userId}`).
  - `src/domain/photos/notice.ts`: `noticeFor(changes, placeOf): string | null`; `placeWords(prizes: readonly { slotKey: string; rank: number; itemName: string }[]): (slot: string | null) => string`.
  - `src/domain/photos/commands.ts`: `issueUploadTicket`, `recordProcessedPhoto` (gains `location`), `removePhoto`, `reorderPhotos`, `retagPhoto`, `describePhoto`, `hidePhoto` (returns `prefix: string | null`), `markPhotoNoticeSeen`.
  - `src/domain/photos/queries.ts`: `PhotoView`, `RemovedPhotoView`, `BreakPhotos`, `breakPhotos`, `leadPhotos`.
  - `src/domain/errors.ts`: `PhotosNotReady`, `UploadNotFound`, `UploadExpired`, `UploadUsed` (ruling 23; Task 6 only consumes them).
  - `appendEvent(tx, e, opts: { ignoreDuplicateBatch?: boolean; processedAt?: Date })`.
  - Fixtures: `newPrefix(breakId): string`, `makePhoto(tx, o): Promise<{ id: string; prefix: string }>`, `makeTicket(tx, o): Promise<{ id: string }>`, `addPrize(tx, breakId, rank, name): Promise<string>` (the slot key).

**Pinned rules** (each has a test below):

| Rule | Value |
|---|---|
| Who | `assertOnboarded`, then `assertHostOf` (the break's host or an admin). `hidePhoto`: `assertAdmin` (SYSTEM is an admin), then `allowPhotoModeration(tx)` before it changes a row on a frozen break (`drawing`, `drawn`, `cancelled`; ruling 10). `markPhotoNoticeSeen`: any caller, writes only for a holder. |
| Status | `draft`, `open`, `filled`, else `NotOpen(status)`. `hidePhoto` and `markPhotoNoticeSeen` work at any status. A `mini` gets no ticket. |
| Cap | Issue: live rows + this break's unconsumed tickets with `expires_at > now` < 8. Record: live rows < 8 (the ticket's reservation becomes the row). |
| Rate | Issue and record each hit their own buckets: 30 per hour and 100 per day per caller (`rateBucket`); at most 8 unconsumed, unexpired tickets per caller across breaks. |
| Ticket | `expires_at = now + 300 s`; expired when `now >= expires_at`; consumed once; `incoming_name = ${breakId}/${ticketId}`; `host_id = caller.id`. |
| Positions | Live rows only, 0..n−1, lead at 0, compacted in two statements after remove, hide and reorder. |
| Live reads | `breakPhotos`'s live list and `leadPhotos` require `removed_at is null and hidden_at is null and path is not null and bucket <> 'photo-archive'` (ruling 26); an expired row shows nowhere live and is not a removed photo either. |
| Removal | `breaks.first_claimed_at` set → keep the row (`removed_at = now`, `bucket = 'photo-archive'`), `archive: true`; unset → delete the row, `archive: false`. |
| Counts (§6) | Only once `first_claimed_at` is set: a removal, a new lead (by removal or reorder), a retag away from a prize. Not: add, a reorder that keeps the lead, tagging an untagged photo, describe, an admin hide. |
| Events | `photo.added`, `photo.removed`, `photo.reordered`, `photo.retagged`, `photo.hidden`, one per committed action, `processed_at = now`. No-ops (same order, same slot, already hidden) write nothing. `describePhoto` writes no event (not in the spec's list). |

**Copy** (all `InvalidInput` unless stated; the four upload and readiness errors are panel ruling 23's classes and copy; Task 12 adds them to the copy audit):

| Case | Message |
|---|---|
| Cap | `A break can have up to 8 photos.` |
| Open tickets | `Wait for the photos already uploading to finish.` |
| Rate | `Too many photos for now. Try again in 10 minutes.` (`Math.ceil(retryAfter / 60)` minutes up to 60, else `Math.ceil(retryAfter / 3600)` hours) |
| Mini | `A mini shows its parent break's photos.` |
| Ticket missing or another caller's (admins included) | `UploadNotFound` (`UPLOAD_NOT_FOUND`, 404): `This upload could not be found. Try again.` |
| Ticket consumed | `UploadUsed` (`UPLOAD_USED`, 409): `This upload was already used. Try again.` |
| Ticket expired (`now >= expires_at`, 5 minutes after issue) | `UploadExpired` (`UPLOAD_EXPIRED`, 410): `This upload took too long. Try again.` |
| Location does not match the break's status (ruling 7) | `PhotosNotReady` (`PHOTOS_NOT_READY`, 409): `Photos are still being prepared. Try again.` |
| Slot | `Pick one of this break's prizes, or no tag.` |
| Alt | `Describe the photo in 1 to 120 characters.` |
| Reorder set | `The photos just changed. Try again.` |
| Photo missing, removed or hidden | `NotFound("Photo not found")` |
| Hide reason | `Give a reason for hiding the photo.` |
| Prefix, size | `Bad photo path`, `Bad photo size` (Task 6 builds both; never shown to a person) |

---

- [ ] **Step 1: Write the failing `appendEvent` test**

Append inside the `describe("appendEvent")` block of `src/domain/events.test.ts`:

```ts
  it("sets processed_at at insert for an audit-only event", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const at = new Date("2026-10-21T10:50:00Z");
      const id = await appendEvent(tx, { breakId: b.id, actorId: host.id, type: "photo.added" }, { processedAt: at });
      const [row] = await tx.select().from(events).where(sql`${events.id} = ${id}`);
      expect(row.processedAt).toEqual(at);
    });
  });
```

- [ ] **Step 2: Add the option**

`appendEvent(tx, e, opts: { ignoreDuplicateBatch?: boolean; processedAt?: Date } = {})` in `src/domain/events.ts`: pass `processedAt: opts.processedAt ?? null` into the insert. Nothing else changes.

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; pnpm test src/domain/events.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 3: Write the failing notice tests**

`src/domain/photos/notice.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { noticeFor, placeWords } from "./notice";
import type { PhotoChange } from "./types";

const TOP = "11111111-1111-4111-8111-111111111111";
const SECOND = "22222222-2222-4222-8222-222222222222";
const CHRONOS = "33333333-3333-4333-8333-333333333333";
const PHANTOM = "44444444-4444-4444-8444-444444444444";
const single = placeWords([{ slotKey: TOP, rank: 1, itemName: "Taylor Chronos 24g" }, { slotKey: SECOND, rank: 2, itemName: "Case" }]);
const choice = placeWords([
  { slotKey: CHRONOS, rank: 1, itemName: "Chronos 24g" }, { slotKey: PHANTOM, rank: 1, itemName: "Phantom 24g" },
  { slotKey: SECOND, rank: 2, itemName: "Case" },
]);
const n = (changes: PhotoChange[], placeOf = single) => noticeFor(changes, placeOf);

describe("placeWords", () => {
  it("names a single prize by its place and an 'or' alternative by its item (ruling 3)", () => {
    expect(single(TOP)).toBe("Top spot");
    expect(single(SECOND)).toBe("2nd place");
    expect(choice(CHRONOS)).toBe("Chronos 24g");
    expect(choice(PHANTOM)).toBe("Phantom 24g");
    expect(choice(SECOND)).toBe("2nd place");
  });
});

describe("noticeFor", () => {
  it("is null when nothing counts: an add, a reorder that keeps the lead, no change", () => {
    expect(n([])).toBeNull();
    expect(n([{ kind: "added" }])).toBeNull();
    expect(n([{ kind: "reordered" }])).toBeNull();
    expect(n([{ kind: "added" }, { kind: "reordered" }])).toBeNull();
  });
  it("names the removed photo's place", () => {
    expect(n([{ kind: "removed", slot: TOP, wasLead: false }])).toBe("Top-spot photo removed");
    expect(n([{ kind: "removed", slot: SECOND, wasLead: false }])).toBe("2nd-place photo removed");
    expect(n([{ kind: "removed", slot: null, wasLead: false }])).toBe("Photo removed");
    expect(n([{ kind: "removed", slot: PHANTOM, wasLead: false }], choice)).toBe("Phantom 24g photo removed");
  });
  it("removing the last photo reads as its removal, not a replaced lead (ruling 1)", () => {
    expect(n([{ kind: "removed", slot: TOP, wasLead: true }])).toBe("Top-spot photo removed");
    expect(n([{ kind: "removed", slot: null, wasLead: true }])).toBe("Photo removed");
  });
  it("removing the lead when another photo takes position 0 reads as a replaced lead (ruling 1)", () => {
    expect(n([{ kind: "removed", slot: TOP, wasLead: true }, { kind: "lead" }])).toBe("Lead photo replaced");
  });
  it("a reorder that changes position 0 is one lead change, however many photos moved (ruling 2)", () => {
    expect(n([{ kind: "lead" }])).toBe("Lead photo replaced");
    expect(n([{ kind: "lead" }, { kind: "lead" }])).toBe("Lead photo replaced");
  });
  it("a retag away from a prize counts; tagging an untagged photo and a same-slot retag do not", () => {
    expect(n([{ kind: "retagged", from: TOP, to: SECOND }])).toBe("A photo moved from Top spot to 2nd place");
    expect(n([{ kind: "retagged", from: CHRONOS, to: PHANTOM }], choice)).toBe("A photo moved from Chronos 24g to Phantom 24g");
    expect(n([{ kind: "retagged", from: TOP, to: null }])).toBe("Top-spot photo untagged");
    expect(n([{ kind: "retagged", from: null, to: TOP }])).toBeNull();
    expect(n([{ kind: "retagged", from: TOP, to: TOP }])).toBeNull();
  });
  it("two or more counting changes of different kinds in one action read 'Photos changed' (ruling 2)", () => {
    expect(n([{ kind: "removed", slot: SECOND, wasLead: false }, { kind: "retagged", from: TOP, to: SECOND }])).toBe("Photos changed");
    expect(n([{ kind: "lead" }, { kind: "retagged", from: TOP, to: null }])).toBe("Photos changed");
    // Non-counting changes never turn one sentence into "Photos changed".
    expect(n([{ kind: "added" }, { kind: "removed", slot: SECOND, wasLead: false }])).toBe("2nd-place photo removed");
  });
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; pnpm test src/domain/photos/notice.test.ts`
Expected: FAIL, `./notice` does not exist.

- [ ] **Step 5: Write `types.ts` and `notice.ts`**

`types.ts`: the contract block's types and constants, plus `TICKET_SECONDS`, `MAX_OPEN_TICKETS`, `PHOTO_RATE`, `ALT_MAX` and `rateBucket` from the Interfaces block. `ItemCondition` is `export type { ItemCondition } from "@/domain/breaks/rules"`; `CONDITION_LABEL` stays here (`new_in_box: "New in box"`, `new_opened: "New, opened"`, `used: "Used"`) unless Task 3 already exports one, in which case re-export it.

`placeWords`: rank 1 → `"Top spot"`, rank 2 → `"2nd place"`, rank n ≥ 3 → `"${ordinal(n)} place"`, except that a rank with two or more items uses each item's name; an unknown slot → `"A prize"`.

`noticeFor` (the rulings fix the order of operations, so the algorithm is written out):

```ts
type Counting = { kind: "removed" | "lead" | "retagged"; sentence: string };
/** "Top spot" → "Top-spot", "2nd place" → "2nd-place"; item names stay as typed (ruling 3). */
const compound = (place: string) => (/^(Top spot|\d+(st|nd|rd|th) place)$/.test(place) ? place.replace(" ", "-") : place);

export function noticeFor(changes: readonly PhotoChange[], placeOf: (slot: string | null) => string): string | null {
  const newLead = changes.some((c) => c.kind === "lead");
  const counting: Counting[] = [];
  for (const c of changes) {
    if (c.kind === "removed") {
      // Ruling 1: removing the lead while another photo takes position 0 is the "lead" change already in the list.
      if (c.wasLead && newLead) continue;
      counting.push({ kind: "removed", sentence: c.slot === null ? "Photo removed" : `${compound(placeOf(c.slot))} photo removed` });
    } else if (c.kind === "lead") {
      counting.push({ kind: "lead", sentence: "Lead photo replaced" });
    } else if (c.kind === "retagged" && c.from !== null && c.from !== c.to) {
      counting.push({ kind: "retagged", sentence: c.to === null
        ? `${compound(placeOf(c.from))} photo untagged`
        : `A photo moved from ${placeOf(c.from)} to ${placeOf(c.to)}` });
    }
  }
  if (counting.length === 0) return null;
  // Ruling 2: one kind reads as its own sentence; two or more kinds in one action read "Photos changed".
  return new Set(counting.map((c) => c.kind)).size > 1 ? "Photos changed" : counting[counting.length - 1].sentence;
}
```

- [ ] **Step 6: Run them to see them pass**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; pnpm test src/domain/photos/notice.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 7: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH
git add src/domain/events.ts src/domain/events.test.ts src/domain/photos/types.ts src/domain/photos/notice.ts src/domain/photos/notice.test.ts
git commit -m "feat(photos): photo types and the notice sentences of spec §6"
```

- [ ] **Step 8: Add the fixtures**

In `tests/helpers/fixtures.ts` (direct inserts, so tests can build states the commands would refuse):

```ts
/** A storage prefix as Task 6 makes it: `${breakId}/` + 22 url-safe base64 characters (128 bits). */
export function newPrefix(breakId: string): string;
export async function makePhoto(tx: Tx, o: { breakId: string; createdBy: string; position: number; slot?: string | null;
  bucket?: PhotoLocation; removedAt?: Date; hiddenAt?: Date; path?: string | null; alt?: string }): Promise<{ id: string; prefix: string }>;
  // defaults: slot null, bucket "photos", path newPrefix(breakId), width 1600, height 1200, alt "Darts"
export async function makeTicket(tx: Tx, o: { hostId: string; breakId: string; expiresAt: Date; consumedAt?: Date }): Promise<{ id: string }>;
/** Adds an item and its prize at `rank`; returns the prize's slot key. */
export async function addPrize(tx: Tx, breakId: string, rank: number, name: string): Promise<string>;
```

`tests/concurrency/setup.ts` is not touched: Task 2 (its Step 8) already names the new tables in the truncate, and `truncate … cascade` clears them.

- [ ] **Step 9: Write the failing ticket and record tests**

`src/domain/photos/tickets.test.ts`. Shared lines:

```ts
import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, makeBreak, openBreakWithLines, makePhoto, makeTicket, newPrefix } from "../../../tests/helpers/fixtures";
import { breaks, breakPhotos, photoUploads, events, prizes } from "@/db/schema";
import { hitRateLimit } from "@/domain/rate-limit";
import { NotAuthorized, NotOpen, notOpenMessage, PhotosNotReady, UploadExpired, UploadNotFound, UploadUsed } from "@/domain/errors";
import type { Caller } from "@/domain/types";
import { rateBucket } from "./types";
import { issueUploadTicket, recordProcessedPhoto } from "./commands";

const NOW = new Date("2026-10-21T10:50:00Z");
const as = (id: string, role: Caller["role"] = "host"): Caller => ({ id, role, onboarded: true, banned: false });
const later = (s: number) => new Date(NOW.getTime() + s * 1000);
const setStatus = (tx: Tx, id: string, status: string) => tx.update(breaks).set({ status }).where(sql`${breaks.id} = ${id}`);
const live = async (tx: Tx, breakId: string) => (await tx.select().from(breakPhotos)
  .where(sql`${breakPhotos.breakId} = ${breakId} and ${breakPhotos.removedAt} is null and ${breakPhotos.hiddenAt} is null`)
  .orderBy(breakPhotos.position));
const fill = async (tx: Tx, bucket: string, n: number, windowSeconds: number) => {
  for (let i = 0; i < n; i++) await hitRateLimit(tx, { bucket, limit: n, windowSeconds, now: NOW });
};
const rec = (ticketId: string, breakId: string, o: Partial<Parameters<typeof recordProcessedPhoto>[2]> = {}) =>
  ({ ticketId, prefix: newPrefix(breakId), width: 1600, height: 1200, slot: null, alt: "Darts", location: "photos" as const, now: NOW, ...o });
/** Asserts both the class and the exact copy of a refusal (ruling 23). */
async function refusedWith(p: Promise<unknown>, cls: new (...args: never[]) => Error, message: string): Promise<void> {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(cls);
  expect((e as Error).message).toBe(message);
}
```

Tests (assertions as code):

```ts
describe("issueUploadTicket", () => {
  it("writes a 5-minute ticket for the caller under the break", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const t = await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
      expect(t.incomingName).toBe(`${b.id}/${t.ticketId}`);
      const [row] = await tx.select().from(photoUploads).where(sql`${photoUploads.id} = ${t.ticketId}`);
      expect(row).toMatchObject({ hostId: host.id, breakId: b.id, expiresAt: later(300), consumedAt: null });
    });
  });
  it("is for the break's host or an admin", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const other = await makeUser(tx, { role: "host" });
      const admin = await makeUser(tx, { role: "admin" });
      const b = await makeBreak(tx, { hostId: host.id });
      await expect(issueUploadTicket(tx, as(other.id), { breakId: b.id, now: NOW })).rejects.toBeInstanceOf(NotAuthorized);
      await expect(issueUploadTicket(tx, { ...as(host.id), banned: true }, { breakId: b.id, now: NOW })).rejects.toThrow(/suspended/);
      const t = await issueUploadTicket(tx, as(admin.id, "admin"), { breakId: b.id, now: NOW });
      const [row] = await tx.select().from(photoUploads).where(sql`${photoUploads.id} = ${t.ticketId}`);
      expect(row.hostId).toBe(admin.id);
    });
  });
  it("works for a draft, an open and a filled break, and refuses every later status", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      for (const status of ["draft", "open", "filled"]) {
        const b = await makeBreak(tx, { hostId: host.id, status });
        await expect(issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW })).resolves.toBeTruthy();
      }
      for (const status of ["drawing", "drawn", "cancelled"]) {
        const b = await makeBreak(tx, { hostId: host.id, status });
        const p = issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
        await expect(p).rejects.toBeInstanceOf(NotOpen);
        await expect(issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW })).rejects.toThrow(notOpenMessage(status));
      }
    });
  });
  it("refuses a mini", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id, kind: "mini" });
      await expect(issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW })).rejects.toThrow("A mini shows its parent break's photos.");
    });
  });
  it("counts live photos and unexpired unconsumed tickets against the 8, nothing else (spec §5.2)", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id });
      for (let i = 0; i < 6; i++) await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: i });
      await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: 6, removedAt: NOW, bucket: "photo-archive" });
      await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: 7, hiddenAt: NOW, bucket: "photo-archive" });
      await makeTicket(tx, { hostId: host.id, breakId: b.id, expiresAt: later(60), consumedAt: NOW });
      await makeTicket(tx, { hostId: host.id, breakId: b.id, expiresAt: NOW }); // expired: expires_at <= now
      await makeTicket(tx, { hostId: host.id, breakId: b.id, expiresAt: later(60) }); // live: 6 + 1 = 7
      await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW }); // 8
      await expect(issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW })).rejects.toThrow("A break can have up to 8 photos.");
    });
  });
  it("allows at most 8 unconsumed, unexpired tickets per caller across breaks", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const a = await makeBreak(tx, { hostId: host.id });
      const c = await makeBreak(tx, { hostId: host.id });
      await makeTicket(tx, { hostId: host.id, breakId: a.id, expiresAt: NOW }); // expired, not counted
      for (let i = 0; i < 5; i++) await issueUploadTicket(tx, as(host.id), { breakId: a.id, now: NOW });
      for (let i = 0; i < 3; i++) await issueUploadTicket(tx, as(host.id), { breakId: c.id, now: NOW });
      await expect(issueUploadTicket(tx, as(host.id), { breakId: c.id, now: NOW })).rejects.toThrow("Wait for the photos already uploading to finish.");
      // The 5-minute window passing frees them (Review Focus 3).
      await expect(issueUploadTicket(tx, as(host.id), { breakId: c.id, now: later(300) })).resolves.toBeTruthy();
    });
  });
  it("allows 30 an hour and 100 a day per caller, with the wait in the message", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      await fill(tx, rateBucket("ticket", "hour", host.id), 30, 3600);
      // NOW is 10:50 UTC: the hour window ends at 11:00.
      await expect(issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW })).rejects.toThrow("Too many photos for now. Try again in 10 minutes.");
      const other = await makeUser(tx, { role: "host" });
      const ob = await makeBreak(tx, { hostId: other.id });
      await fill(tx, rateBucket("ticket", "day", other.id), 100, 86_400);
      // The day window ends at midnight UTC, 13 h 10 min after NOW.
      await expect(issueUploadTicket(tx, as(other.id), { breakId: ob.id, now: NOW })).rejects.toThrow("Too many photos for now. Try again in 14 hours.");
    });
  });
});

describe("recordProcessedPhoto", () => {
  it("consumes the ticket, adds the photo at the next position and logs one processed event", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const slot = (await tx.select({ s: prizes.slotKey }).from(prizes).where(sql`${prizes.breakId} = ${b.id}`))[0].s;
      const t1 = await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
      const t2 = await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
      const r1 = await recordProcessedPhoto(tx, as(host.id), rec(t1.ticketId, b.id, { location: "photos-draft", slot, alt: "  Chronos front  " }));
      const r2 = await recordProcessedPhoto(tx, as(host.id), rec(t2.ticketId, b.id, { location: "photos-draft" }));
      expect(r1.location).toBe("photos-draft");
      expect((await live(tx, b.id)).map((p) => [p.id, p.position, p.prizeSlot, p.alt, p.bucket])).toEqual([
        [r1.photoId, 0, slot, "Chronos front", "photos-draft"], [r2.photoId, 1, null, "Darts", "photos-draft"],
      ]);
      const [ticket] = await tx.select().from(photoUploads).where(sql`${photoUploads.id} = ${t1.ticketId}`);
      expect(ticket.consumedAt).toEqual(NOW);
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${b.id} and ${events.type} = 'photo.added'`);
      expect(evs).toHaveLength(2);
      expect(evs.every((e) => e.processedAt?.getTime() === NOW.getTime())).toBe(true);
      expect(evs.map((e) => e.payload)).toContainEqual({ photoId: r1.photoId, position: 0, slot, location: "photos-draft" });
    });
  });
  it("an add never sets the notice, even after the first claim", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id });
      await tx.update(breaks).set({ firstClaimedAt: NOW }).where(sql`${breaks.id} = ${b.id}`);
      const t = await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
      expect((await recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id))).location).toBe("photos");
      const [row] = await tx.select().from(breaks).where(sql`${breaks.id} = ${b.id}`);
      expect(row).toMatchObject({ photosUpdatedAt: null, photosUpdatedNote: null });
    });
  });
  it("refuses an unknown ticket and another caller's (UploadNotFound), an expired one (UploadExpired) and a used one (UploadUsed), and adds nothing", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const admin = await makeUser(tx, { role: "admin" });
      const b = await openBreakWithLines(tx, { hostId: host.id });
      const t = await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
      // Another caller, even an admin, cannot finalise a host's ticket; the reply does not say it exists.
      await refusedWith(recordProcessedPhoto(tx, as(admin.id, "admin"), rec(t.ticketId, b.id)), UploadNotFound, "This upload could not be found. Try again.");
      await refusedWith(recordProcessedPhoto(tx, as(host.id), rec("55555555-5555-4555-8555-555555555555", b.id)), UploadNotFound, "This upload could not be found. Try again.");
      // Past 5 minutes (expired when now >= expires_at).
      await refusedWith(recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id, { now: later(300) })), UploadExpired, "This upload took too long. Try again.");
      expect(await live(tx, b.id)).toHaveLength(0);
      // One second earlier is still in time.
      await recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id, { now: later(299) }));
      await refusedWith(recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id)), UploadUsed, "This upload was already used. Try again.");
      expect(await live(tx, b.id)).toHaveLength(1);
    });
  });
  it("refuses variants written for the other state of the break with PhotosNotReady (ruling 7), and re-checks status", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const t = await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
      // A draft's photo written to the public bucket.
      await refusedWith(recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id, { location: "photos" })), PhotosNotReady, "Photos are still being prepared. Try again.");
      await setStatus(tx, b.id, "open"); // opened while the photo was processing (Task 6 wrote to photos-draft)
      await refusedWith(recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id, { location: "photos-draft" })), PhotosNotReady, "Photos are still being prepared. Try again.");
      // The ticket stays unconsumed, so Task 6's one retry (after copying to `photos`) can use it.
      const [ticket] = await tx.select().from(photoUploads).where(sql`${photoUploads.id} = ${t.ticketId}`);
      expect(ticket.consumedAt).toBeNull();
      await setStatus(tx, b.id, "drawing");
      await refusedWith(recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id)), NotOpen, notOpenMessage("drawing"));
      expect(await live(tx, b.id)).toHaveLength(0);
    });
  });
  it("refuses a prefix outside the break, a bad size, an unknown slot and alt text out of 1–120", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id });
      const elsewhere = await makeBreak(tx, { hostId: host.id });
      const t = await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
      const cases: [Partial<Parameters<typeof recordProcessedPhoto>[2]>, string][] = [
        [{ prefix: newPrefix(elsewhere.id) }, "Bad photo path"],
        [{ prefix: `${b.id}/../x` }, "Bad photo path"],
        [{ width: 0 }, "Bad photo size"], [{ height: 1601 }, "Bad photo size"], [{ width: 1.5 }, "Bad photo size"],
        [{ slot: (await tx.select({ s: prizes.slotKey }).from(prizes).where(sql`${prizes.breakId} = ${elsewhere.id}`))[0].s }, "Pick one of this break's prizes, or no tag."],
        [{ alt: "   " }, "Describe the photo in 1 to 120 characters."], [{ alt: "x".repeat(121) }, "Describe the photo in 1 to 120 characters."],
      ];
      for (const [o, msg] of cases) await expect(recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id, o)), msg).rejects.toThrow(msg);
      await expect(recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id, { alt: "x".repeat(120) }))).resolves.toBeTruthy();
    });
  });
  it("re-checks the cap on live rows", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id });
      for (let i = 0; i < 8; i++) await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: i });
      const t = await makeTicket(tx, { hostId: host.id, breakId: b.id, expiresAt: later(60) }); // bypasses the issue check
      await expect(recordProcessedPhoto(tx, as(host.id), rec(t.id, b.id))).rejects.toThrow("A break can have up to 8 photos.");
    });
  });
  it("has its own rate limit", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id });
      const t = await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
      await fill(tx, rateBucket("record", "hour", host.id), 30, 3600);
      await expect(recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id))).rejects.toThrow("Too many photos for now. Try again in 10 minutes.");
    });
  });
});
```

- [ ] **Step 10: Run them to see them fail**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; pnpm test src/domain/photos/tickets.test.ts`
Expected: FAIL, `./commands` does not exist.

- [ ] **Step 11: Write `issueUploadTicket` and `recordProcessedPhoto` in `src/domain/photos/commands.ts`**

First add the four errors to `src/domain/errors.ts`, after `InvalidInput`, with ruling 23's copy exactly (codes and statuses as Task 6's table uses them):

```ts
export class PhotosNotReady extends DomainError { constructor() { super("PHOTOS_NOT_READY", "Photos are still being prepared. Try again.", 409); } }
export class UploadNotFound extends DomainError { constructor() { super("UPLOAD_NOT_FOUND", "This upload could not be found. Try again.", 404); } }
export class UploadExpired extends DomainError { constructor() { super("UPLOAD_EXPIRED", "This upload took too long. Try again.", 410); } }
export class UploadUsed extends DomainError { constructor() { super("UPLOAD_USED", "This upload was already used. Try again.", 409); } }
```

Signatures as in the plan's contract, with `recordProcessedPhoto`'s `p` gaining `location: "photos-draft" | "photos"`.
Check order for `issueUploadTicket`: onboarded → `assertHostOf` (locks) → status → mini → break cap → open tickets →
hour → day (each `hitRateLimit` with `limit` and `windowSeconds` from `PHOTO_RATE`; refused → `InvalidInput(photoRateMessage(retryAfter))`) → insert.
Check order for `recordProcessedPhoto`, which the race tests depend on:

1. `assertOnboarded`; read the ticket without a lock; missing or `host_id ≠ caller.id` (admins included) → `UploadNotFound`.
2. `assertHostOf(tx, caller, ticket.breakId)`: the break lock, before anything else is decided.
3. Re-read the ticket `for update`: consumed → `UploadUsed`, then expired (`now >= expires_at`) → `UploadExpired`.
4. Status (`NotOpen`), then `p.location` against it (`photos-draft` exactly when the break is a draft); a mismatch → `PhotosNotReady` (ruling 7), leaving the ticket unconsumed.
5. Inputs: `PREFIX_PATTERN.test(prefix) && prefix.startsWith(`${b.id}/`)`; width and height integers in 1..1600; alt trimmed, 1..120; slot null or a `prizes.slot_key` of this break.
6. Live count ≥ 8 → cap message. Rate limits (`"record"` buckets).
7. Insert at `position = live count`, `bucket = p.location`, `created_by = caller.id`; set `consumed_at = now`; `appendEvent(… "photo.added", { photoId, position, slot, location }, { processedAt: now })`.

Keep three private helpers in this file for the remaining commands: `lockPhoto(tx, caller, photoId)` (find the break id, `assertHostOf`, re-read the row `for update` with `removed_at is null and hidden_at is null`, else `NotFound("Photo not found")`), `compact(tx, breakId, order?)` (Step 15), and `noteChange(tx, b, changes, now)` (if `b.firstClaimedAt` and `noticeFor(changes, placeWords(prizes of b))` is a sentence, set `photosUpdatedAt = now` and `photosUpdatedNote` to it).

- [ ] **Step 12: Run them to see them pass**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; pnpm test src/domain/photos/tickets.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 13: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH
git add src/domain/errors.ts src/domain/photos/commands.ts src/domain/photos/tickets.test.ts tests/helpers/fixtures.ts
git commit -m "feat(photos): upload tickets and recording a processed photo"
```

- [ ] **Step 14: Write the failing command tests**

`src/domain/photos/commands.test.ts` uses the same imports and `NOW`, `as`, `later`, `live`, `setStatus` as Step 9, plus `NotFound` (errors), `addPrize` (fixtures), `photoNoticesSeen` (schema), `SYSTEM`, `claimLines`, `releaseLine`, `randomUUID` and `removePhoto`, `reorderPhotos`, `retagPhoto`, `describePhoto`, `hidePhoto`, `markPhotoNoticeSeen`, and:

```ts
/** An open break with a claimed line (first_claimed_at set by the claim, Task 2), a 2nd-place prize and n photos. */
async function claimedBreak(tx: Tx, n: number, slots: (string | null)[] = []) { /* returns { host, buyer, b, top, second, photos: {id, prefix}[] } */ }
const positions = async (tx: Tx, breakId: string) => (await live(tx, breakId)).map((p) => [p.id, p.position]);
const noticeOf = async (tx: Tx, breakId: string) => (await tx.select({ at: breaks.photosUpdatedAt, text: breaks.photosUpdatedNote }).from(breaks).where(sql`${breaks.id} = ${breakId}`))[0];
const typed = async (tx: Tx, breakId: string, type: string) => tx.select().from(events).where(sql`${events.breakId} = ${breakId} and ${events.type} = ${type}`);
```

`claimedBreak` builds with `openBreakWithLines`, `addPrize(tx, b.id, 2, "Case")`, `makePhoto` per slot entry (null or `"top"`/`"second"` mapped to the slot keys), then `claimLines` of line 1 for the buyer (a member).

```ts
describe("removePhoto", () => {
  it("before any claim deletes the row outright, renumbers, and sets no notice", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id });
      const ps = [];
      for (let i = 0; i < 3; i++) ps.push(await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: i }));
      expect(await removePhoto(tx, as(host.id), { photoId: ps[1].id, now: NOW })).toEqual({ prefix: ps[1].prefix, from: "photos", archive: false });
      expect(await tx.select().from(breakPhotos).where(sql`${breakPhotos.id} = ${ps[1].id}`)).toHaveLength(0);
      expect(await positions(tx, b.id)).toEqual([[ps[0].id, 0], [ps[2].id, 1]]);
      expect(await noticeOf(tx, b.id)).toEqual({ at: null, text: null });
      expect((await typed(tx, b.id, "photo.removed")).map((e) => e.payload)).toEqual([
        { photoId: ps[1].id, position: 1, slot: null, wasLead: false, archived: false, previousLead: ps[0].id },
      ]);
    });
  });
  it("after the first claim archives the row and sets the place's sentence in the same transaction", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 3, [null, "top", null]);
      expect(await removePhoto(tx, as(host.id), { photoId: photos[1].id, now: NOW })).toEqual({ prefix: photos[1].prefix, from: "photos", archive: true });
      const [row] = await tx.select().from(breakPhotos).where(sql`${breakPhotos.id} = ${photos[1].id}`);
      expect(row).toMatchObject({ removedAt: NOW, bucket: "photo-archive", path: photos[1].prefix });
      expect(await positions(tx, b.id)).toEqual([[photos[0].id, 0], [photos[2].id, 1]]);
      expect(await noticeOf(tx, b.id)).toEqual({ at: NOW, text: "Top-spot photo removed" });
    });
  });
  it("a claim that was later released still counts as claimed (decision 12)", async () => {
    await withTx(async (tx) => {
      const { host, buyer, b, photos } = await claimedBreak(tx, 2);
      await releaseLine(tx, as(buyer.id, "member"), { breakId: b.id, number: 1, reason: "withdrawn" });
      expect((await removePhoto(tx, as(host.id), { photoId: photos[0].id, now: NOW })).archive).toBe(true);
    });
  });
  it("removing the lead with others left reads 'Lead photo replaced'; the next photo leads", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 2, ["top", "second"]);
      await removePhoto(tx, as(host.id), { photoId: photos[0].id, now: NOW });
      expect(await positions(tx, b.id)).toEqual([[photos[1].id, 0]]);
      expect((await noticeOf(tx, b.id)).text).toBe("Lead photo replaced");
    });
  });
  it("removing the last photo reads as its place's removal (ruling 1, Review Focus 2)", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 1, ["top"]);
      await removePhoto(tx, as(host.id), { photoId: photos[0].id, now: NOW });
      expect(await live(tx, b.id)).toHaveLength(0);
      expect((await noticeOf(tx, b.id)).text).toBe("Top-spot photo removed");
      const untagged = await claimedBreak(tx, 1, [null]);
      await removePhoto(tx, as(untagged.host.id), { photoId: untagged.photos[0].id, now: NOW });
      expect((await noticeOf(tx, untagged.b.id)).text).toBe("Photo removed");
    });
  });
  it("is the host's or an admin's, only until the draw is requested, and once per photo", async () => {
    await withTx(async (tx) => {
      const { host, buyer, b, photos } = await claimedBreak(tx, 2);
      await expect(removePhoto(tx, as(buyer.id, "member"), { photoId: photos[0].id, now: NOW })).rejects.toBeInstanceOf(NotAuthorized);
      await removePhoto(tx, as(host.id), { photoId: photos[0].id, now: NOW });
      await expect(removePhoto(tx, as(host.id), { photoId: photos[0].id, now: NOW })).rejects.toThrow(new NotFound("Photo not found"));
      await setStatus(tx, b.id, "drawing");
      await expect(removePhoto(tx, as(host.id), { photoId: photos[1].id, now: NOW })).rejects.toBeInstanceOf(NotOpen);
    });
  });
});

describe("reorderPhotos", () => {
  it("sets positions from the order and logs the final order once", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 3);
      const order = [photos[0].id, photos[2].id, photos[1].id];
      await reorderPhotos(tx, as(host.id), { breakId: b.id, order, now: NOW });
      expect(await positions(tx, b.id)).toEqual(order.map((id, i) => [id, i]));
      expect((await typed(tx, b.id, "photo.reordered")).map((e) => e.payload)).toEqual([{ order, previousLead: photos[0].id }]);
      expect(await noticeOf(tx, b.id)).toEqual({ at: null, text: null }); // the lead was kept
    });
  });
  it("a new lead after the first claim reads 'Lead photo replaced'", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 3);
      await reorderPhotos(tx, as(host.id), { breakId: b.id, order: [photos[2].id, photos[0].id, photos[1].id], now: NOW });
      expect(await noticeOf(tx, b.id)).toEqual({ at: NOW, text: "Lead photo replaced" });
    });
  });
  it("refuses an order that is not exactly the live photos, and the same order is a no-op", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 3);
      const removed = await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: 3, removedAt: NOW, bucket: "photo-archive" });
      const ids = photos.map((p) => p.id);
      for (const order of [ids.slice(0, 2), [...ids, removed.id], [ids[0], ids[0], ids[1]], [ids[0], ids[1], randomUUID()]]) {
        await expect(reorderPhotos(tx, as(host.id), { breakId: b.id, order, now: NOW })).rejects.toThrow("The photos just changed. Try again.");
      }
      await reorderPhotos(tx, as(host.id), { breakId: b.id, order: ids, now: NOW });
      expect(await typed(tx, b.id, "photo.reordered")).toHaveLength(0);
      expect(await positions(tx, b.id)).toEqual(ids.map((id, i) => [id, i]));
    });
  });
});

describe("retagPhoto", () => {
  it("a move to another prize after the first claim sets the sentence; tagging an untagged photo does not", async () => {
    await withTx(async (tx) => {
      const { host, b, top, second, photos } = await claimedBreak(tx, 2, ["top", null]);
      await retagPhoto(tx, as(host.id), { photoId: photos[1].id, slot: top, now: NOW });
      expect(await noticeOf(tx, b.id)).toEqual({ at: null, text: null });
      await retagPhoto(tx, as(host.id), { photoId: photos[0].id, slot: second, now: NOW });
      expect(await noticeOf(tx, b.id)).toEqual({ at: NOW, text: "A photo moved from Top spot to 2nd place" });
      expect((await typed(tx, b.id, "photo.retagged")).map((e) => e.payload)).toContainEqual({ photoId: photos[0].id, from: top, to: second });
    });
  });
  it("untagging a prize's photo counts; two separate actions keep the latest sentence and time (ruling 2)", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 3, ["top", "second", null]);
      await removePhoto(tx, as(host.id), { photoId: photos[1].id, now: NOW });
      await retagPhoto(tx, as(host.id), { photoId: photos[0].id, slot: null, now: later(60) });
      expect(await noticeOf(tx, b.id)).toEqual({ at: later(60), text: "Top-spot photo untagged" });
    });
  });
  it("refuses a slot of another break; the same slot is a no-op", async () => {
    await withTx(async (tx) => {
      const { host, b, top, photos } = await claimedBreak(tx, 1, ["top"]);
      const elsewhere = await makeBreak(tx, { hostId: host.id });
      const foreign = await addPrize(tx, elsewhere.id, 2, "Case");
      await expect(retagPhoto(tx, as(host.id), { photoId: photos[0].id, slot: foreign, now: NOW })).rejects.toThrow("Pick one of this break's prizes, or no tag.");
      await retagPhoto(tx, as(host.id), { photoId: photos[0].id, slot: top, now: NOW });
      expect(await typed(tx, b.id, "photo.retagged")).toHaveLength(0);
    });
  });
});

describe("describePhoto", () => {
  it("stores the trimmed alt text, 1–120 characters, without an event", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 1);
      await describePhoto(tx, as(host.id), { photoId: photos[0].id, alt: "  Chronos, barrels  " });
      expect((await live(tx, b.id))[0].alt).toBe("Chronos, barrels");
      await expect(describePhoto(tx, as(host.id), { photoId: photos[0].id, alt: "" })).rejects.toThrow("Describe the photo in 1 to 120 characters.");
      expect(await tx.select().from(events).where(sql`${events.breakId} = ${b.id} and ${events.type} like 'photo.%'`)).toHaveLength(0);
      await setStatus(tx, b.id, "drawing");
      await expect(describePhoto(tx, as(host.id), { photoId: photos[0].id, alt: "x" })).rejects.toBeInstanceOf(NotOpen);
    });
  });
});

describe("hidePhoto", () => {
  it("is for admins and SYSTEM; hides, renumbers, moves the row to the archive and never sets the notice", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 2, ["top", null]);
      const admin = await makeUser(tx, { role: "admin" });
      await expect(hidePhoto(tx, as(host.id), { photoId: photos[0].id, reason: "x", now: NOW })).rejects.toThrow("Admins only");
      await expect(hidePhoto(tx, as(admin.id, "admin"), { photoId: photos[0].id, reason: "  ", now: NOW })).rejects.toThrow("Give a reason for hiding the photo.");
      expect(await hidePhoto(tx, as(admin.id, "admin"), { photoId: photos[0].id, reason: "Not the item", now: NOW })).toEqual({ prefix: photos[0].prefix, from: "photos" });
      const [row] = await tx.select().from(breakPhotos).where(sql`${breakPhotos.id} = ${photos[0].id}`);
      expect(row).toMatchObject({ hiddenAt: NOW, bucket: "photo-archive" });
      expect(await positions(tx, b.id)).toEqual([[photos[1].id, 0]]);
      expect(await noticeOf(tx, b.id)).toEqual({ at: null, text: null });
      const [ev] = await typed(tx, b.id, "photo.hidden");
      expect(ev).toMatchObject({ actorId: admin.id, payload: { photoId: photos[0].id, reason: "Not the item", slot: expect.any(String), position: 0, previousLead: photos[0].id } });
      expect(ev.processedAt).toEqual(NOW);
      // Again: nothing more is written.
      await hidePhoto(tx, as(admin.id, "admin"), { photoId: photos[0].id, reason: "Not the item", now: NOW });
      expect(await typed(tx, b.id, "photo.hidden")).toHaveLength(1);
    });
  });
  it("an admin hides a live photo on a drawn break, under allowPhotoModeration (ruling 10)", async () => {
    await withTx(async (tx) => {
      const { b, top, photos } = await claimedBreak(tx, 3, ["top", null, null]);
      const admin = await makeUser(tx, { role: "admin" });
      await setStatus(tx, b.id, "drawn"); // frozen: without the moderation flag the guard refuses the update
      expect(await hidePhoto(tx, as(admin.id, "admin"), { photoId: photos[0].id, reason: "Personal data", now: NOW })).toEqual({ prefix: photos[0].prefix, from: "photos" });
      const [row] = await tx.select().from(breakPhotos).where(sql`${breakPhotos.id} = ${photos[0].id}`);
      // Moderation only takes things down: the tag and the alt text stay as promised.
      expect(row).toMatchObject({ hiddenAt: NOW, bucket: "photo-archive", path: photos[0].prefix, prizeSlot: top, alt: "Darts", removedAt: null });
      expect(await positions(tx, b.id)).toEqual([[photos[1].id, 0], [photos[2].id, 1]]); // the lead stays at position 0
      expect((await typed(tx, b.id, "photo.hidden")).map((e) => e.actorId)).toEqual([admin.id]);
      expect(await noticeOf(tx, b.id)).toEqual({ at: null, text: null });
    });
  });
  it("works after the draw, by SYSTEM, on a removed photo too", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 2);
      await removePhoto(tx, as(host.id), { photoId: photos[0].id, now: NOW });
      await setStatus(tx, b.id, "drawn");
      expect(await hidePhoto(tx, SYSTEM, { photoId: photos[0].id, reason: "Report 12", now: NOW })).toEqual({ prefix: photos[0].prefix, from: "photo-archive" });
      expect((await typed(tx, b.id, "photo.hidden"))[0].payload).toMatchObject({ position: null });
    });
  });
});

describe("markPhotoNoticeSeen", () => {
  const seen = async (tx: Tx, userId: string, breakId: string) =>
    (await tx.select().from(photoNoticesSeen).where(sql`${photoNoticesSeen.userId} = ${userId} and ${photoNoticesSeen.breakId} = ${breakId}`))[0]?.seenAt ?? null;
  it("records a holder's view once per change", async () => {
    await withTx(async (tx) => {
      const { host, buyer, b, photos } = await claimedBreak(tx, 2);
      await markPhotoNoticeSeen(tx, as(buyer.id, "member"), { breakId: b.id, now: NOW }); // no change yet
      expect(await seen(tx, buyer.id, b.id)).toBeNull();
      await removePhoto(tx, as(host.id), { photoId: photos[1].id, now: NOW });
      await markPhotoNoticeSeen(tx, as(buyer.id, "member"), { breakId: b.id, now: later(10) });
      await markPhotoNoticeSeen(tx, as(buyer.id, "member"), { breakId: b.id, now: later(20) }); // not older: unchanged
      expect(await seen(tx, buyer.id, b.id)).toEqual(later(10));
      await reorderPhotos(tx, as(host.id), { breakId: b.id, order: [photos[0].id], now: later(30) }); // no-op, no change
      await removePhoto(tx, as(host.id), { photoId: photos[0].id, now: later(40) });
      await markPhotoNoticeSeen(tx, as(buyer.id, "member"), { breakId: b.id, now: later(50) });
      expect(await seen(tx, buyer.id, b.id)).toEqual(later(50));
    });
  });
  it("writes nothing for anyone who holds no line in the break", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 2);
      const stranger = await makeUser(tx);
      await removePhoto(tx, as(host.id), { photoId: photos[1].id, now: NOW });
      await markPhotoNoticeSeen(tx, as(stranger.id, "member"), { breakId: b.id, now: later(10) });
      await markPhotoNoticeSeen(tx, as(host.id), { breakId: b.id, now: later(10) });
      expect(await seen(tx, stranger.id, b.id)).toBeNull();
      expect(await seen(tx, host.id, b.id)).toBeNull();
    });
  });
});
```

- [ ] **Step 15: Run them to see them fail, then write the commands**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; pnpm test src/domain/photos/commands.test.ts`
Expected: FAIL, `removePhoto` and the rest are not exported.

Then write them in `src/domain/photos/commands.ts` with the plan's signatures (`hidePhoto` returns `{ prefix: string | null; from: PhotoLocation }`). Each one: `lockPhoto` (or `assertHostOf` for `reorderPhotos`), the status check (not for `hidePhoto`), the change, `compact` where positions moved, one event with `{ processedAt: now }`, then `noteChange`. The changes each passes to `noteChange`:

- `removePhoto`: `[{ kind: "removed", slot, wasLead: position === 0 }]`, plus `{ kind: "lead" }` when it was the lead and a live photo remains. Event payload `{ photoId, position, slot, wasLead, archived, previousLead }`. Returns the row's `path` and its `bucket` before the change.
- `reorderPhotos`: validate `order` against the live ids (same length, no duplicates, every id live); identical to the current order → return. `[{ kind: order[0] === previousLead ? "reordered" : "lead" }]`. Payload `{ order, previousLead }`.
- `retagPhoto`: slot validated as in Step 11; unchanged → return. `[{ kind: "retagged", from, to }]`. Payload `{ photoId, from, to }`.
- `describePhoto`: alt only; no event, no notice.
- `hidePhoto`: `assertAdmin`; reason trimmed, 1..500 characters; find the row in any state, `lockBreak`, re-read `for update`; already hidden → return without writing. If the break is `drawing`, `drawn` or `cancelled`, `await allowPhotoModeration(tx)` (ruling 10; `src/db/photo-moderation.ts`) before the first update. Set `hidden_at = now`, `bucket = 'photo-archive'`; `compact` if it was live. Payload `{ photoId, reason, slot, position: live ? position : null, previousLead }`. No `noteChange`.
- `markPhotoNoticeSeen`: no break lock (a holder's page view must not queue behind claims). Read `photos_updated_at`; null → return. Holder = a `lines` row with `owner_id = caller.id` in the break; none → return. Upsert `(caller.id, breakId, now)`, updating only `where photo_notices_seen.seen_at < breaks.photos_updated_at`.

`compact` (ruling 5; the live index is not deferrable, so a one-statement renumber can collide mid-update):

```ts
/** postgres-js with prepare:false cannot bind a JS array inside raw SQL; ids were checked against the live rows first. */
const uuidArray = (ids: readonly string[]) => sql`${`{${ids.join(",")}}`}::uuid[]`;

async function compact(tx: Tx, breakId: string, order?: readonly string[]): Promise<void> {
  const live = sql`break_id = ${breakId}::uuid and removed_at is null and hidden_at is null`;
  // 1. Every live position to a distinct negative (0 → -1, 1 → -2, …), clear of 0..7.
  await tx.execute(sql`update break_photos set position = -1 - position where ${live}`);
  // 2. Final positions: the given order, or the old order with the gap closed (old 0 is now -1, the highest).
  await tx.execute(order
    ? sql`update break_photos set position = array_position(${uuidArray(order)}, id) - 1 where ${live}`
    : sql`update break_photos bp set position = o.rn - 1
          from (select id, row_number() over (order by position desc) as rn from break_photos where ${live}) o
          where bp.id = o.id`);
}
```

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; pnpm test src/domain/photos`
Expected: PASS, the notice, ticket and command tests (40).

- [ ] **Step 16: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH
git add src/domain/photos/commands.ts src/domain/photos/commands.test.ts
git commit -m "feat(photos): remove, reorder, retag, describe, hide and notice-seen commands"
```

- [ ] **Step 17: Write the failing query tests**

`src/domain/photos/queries.test.ts` (same helpers; `claimedBreak` moves to a shared `src/domain/photos/test-helpers.ts` exporting it with `as`, `NOW`, `later`, `live`, `setStatus`; plus `allowPhotoModeration` from `@/db/photo-moderation`):

```ts
const viewer = (id: string, o: Partial<{ isHost: boolean; isHolder: boolean; isAdmin: boolean }> = {}) =>
  ({ id, isHost: false, isHolder: false, isAdmin: false, ...o });

describe("breakPhotos", () => {
  it("live photos in order for everyone on an open break; removed ones only for the host, holders and admins", async () => {
    await withTx(async (tx) => {
      const { host, buyer, b, top, photos } = await claimedBreak(tx, 3, ["top", null, null]);
      await removePhoto(tx, as(host.id), { photoId: photos[2].id, now: NOW });
      const stranger = await breakPhotos(tx, b.id, null);
      expect(stranger.live).toEqual([
        { id: photos[0].id, position: 0, slot: top, alt: "Darts", width: 1600, height: 1200, location: "photos", prefix: photos[0].prefix },
        { id: photos[1].id, position: 1, slot: null, alt: "Darts", width: 1600, height: 1200, location: "photos", prefix: photos[1].prefix },
      ]);
      expect(stranger.removed).toEqual([]);
      expect(stranger.notice).toEqual({ text: "Photo removed", at: NOW }); // everyone sees the notice (§6)
      expect(stranger.unseen).toBe(false);
      const removed = [{ id: photos[2].id, slot: null, alt: "Darts", width: 1600, height: 1200, removedAt: NOW, location: "photo-archive", prefix: photos[2].prefix }];
      for (const v of [viewer(host.id, { isHost: true }), viewer(buyer.id, { isHolder: true }), viewer(randomUUID(), { isAdmin: true })]) {
        expect((await breakPhotos(tx, b.id, v)).removed, JSON.stringify(v)).toEqual(removed);
      }
      expect((await breakPhotos(tx, b.id, viewer(randomUUID()))).removed).toEqual([]);
    });
  });
  it("a draft's photos only for the host and admins", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: 0, bucket: "photos-draft" });
      expect((await breakPhotos(tx, b.id, null)).live).toEqual([]);
      expect((await breakPhotos(tx, b.id, viewer(randomUUID()))).live).toEqual([]);
      expect((await breakPhotos(tx, b.id, viewer(host.id, { isHost: true }))).live.map((p) => p.location)).toEqual(["photos-draft"]);
      expect((await breakPhotos(tx, b.id, viewer(randomUUID(), { isAdmin: true }))).live).toHaveLength(1);
    });
  });
  it("a hidden photo, live or removed, reaches nobody", async () => {
    await withTx(async (tx) => {
      const { host, b, photos } = await claimedBreak(tx, 2);
      await removePhoto(tx, as(host.id), { photoId: photos[1].id, now: NOW });
      await hidePhoto(tx, SYSTEM, { photoId: photos[0].id, reason: "r", now: NOW });
      await hidePhoto(tx, SYSTEM, { photoId: photos[1].id, reason: "r", now: NOW });
      for (const v of [null, viewer(host.id, { isHost: true }), viewer(randomUUID(), { isAdmin: true, isHolder: true })]) {
        const r = await breakPhotos(tx, b.id, v);
        expect([r.live, r.removed]).toEqual([[], []]);
      }
    });
  });
  it("unseen is true only for a holder who has not seen the latest change", async () => {
    await withTx(async (tx) => {
      const { host, buyer, b, photos } = await claimedBreak(tx, 2);
      await removePhoto(tx, as(host.id), { photoId: photos[1].id, now: NOW });
      expect((await breakPhotos(tx, b.id, viewer(buyer.id, { isHolder: true }))).unseen).toBe(true);
      expect((await breakPhotos(tx, b.id, viewer(host.id, { isHost: true }))).unseen).toBe(false);
      await markPhotoNoticeSeen(tx, as(buyer.id, "member"), { breakId: b.id, now: later(10) });
      expect((await breakPhotos(tx, b.id, viewer(buyer.id, { isHolder: true }))).unseen).toBe(false);
    });
  });
  it("a removed photo whose archive copy was dropped keeps its mark with a null prefix", async () => {
    await withTx(async (tx) => {
      const { host, buyer, b } = await claimedBreak(tx, 0);
      await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: 0, removedAt: NOW, bucket: "photo-archive", path: null });
      expect((await breakPhotos(tx, b.id, viewer(buyer.id, { isHolder: true }))).removed[0]).toMatchObject({ removedAt: NOW, prefix: null });
    });
  });
});

describe("expired photos (ruling 26)", () => {
  it("a row in photo-archive with a null path, neither removed nor hidden, appears nowhere live", async () => {
    await withTx(async (tx) => {
      const { host, buyer, b, photos } = await claimedBreak(tx, 2, ["top", null]);
      await setStatus(tx, b.id, "cancelled");
      // As the cleanup's retention rule 4 leaves a cancelled break's photo (Task 11).
      await allowPhotoModeration(tx);
      await tx.update(breakPhotos).set({ bucket: "photo-archive", path: null }).where(sql`${breakPhotos.id} = ${photos[0].id}`);
      const [row] = await tx.select().from(breakPhotos).where(sql`${breakPhotos.id} = ${photos[0].id}`);
      expect(row).toMatchObject({ removedAt: null, hiddenAt: null, bucket: "photo-archive", path: null });
      for (const v of [null, viewer(host.id, { isHost: true }), viewer(buyer.id, { isHolder: true }), viewer(randomUUID(), { isAdmin: true })]) {
        const r = await breakPhotos(tx, b.id, v);
        expect(r.live.map((p) => p.id), JSON.stringify(v)).toEqual([photos[1].id]);
        expect(r.live.every((p) => p.prefix !== null && p.location !== "photo-archive"), JSON.stringify(v)).toBe(true);
        expect(r.removed, JSON.stringify(v)).toEqual([]);
      }
      // Its position 0 is no lead: the feed, /me, /host, the profile and the preview show no photo.
      expect((await leadPhotos(tx, [b.id])).has(b.id)).toBe(false);
    });
  });
});

describe("leadPhotos", () => {
  it("returns each break's live position-0 photo from the public bucket only", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const open = await openBreakWithLines(tx, { hostId: host.id });
      const lead = await makePhoto(tx, { breakId: open.id, createdBy: host.id, position: 0 });
      await makePhoto(tx, { breakId: open.id, createdBy: host.id, position: 1 });
      const draft = await makeBreak(tx, { hostId: host.id });
      await makePhoto(tx, { breakId: draft.id, createdBy: host.id, position: 0, bucket: "photos-draft" });
      const onlyRemoved = await openBreakWithLines(tx, { hostId: host.id });
      await makePhoto(tx, { breakId: onlyRemoved.id, createdBy: host.id, position: 0, removedAt: NOW, bucket: "photo-archive" });
      const onlyHidden = await openBreakWithLines(tx, { hostId: host.id });
      await makePhoto(tx, { breakId: onlyHidden.id, createdBy: host.id, position: 0, hiddenAt: NOW, bucket: "photo-archive" });
      const m = await leadPhotos(tx, [open.id, draft.id, onlyRemoved.id, onlyHidden.id]);
      expect([...m.keys()]).toEqual([open.id]);
      expect(m.get(open.id)).toMatchObject({ id: lead.id, position: 0, location: "photos", prefix: lead.prefix });
      expect((await leadPhotos(tx, [])).size).toBe(0);
    });
  });
});
```

- [ ] **Step 18: Run them to see them fail, then write `queries.ts`**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; pnpm test src/domain/photos/queries.test.ts`
Expected: FAIL, `./queries` does not exist.

`breakPhotos` (the visibility rules live in one query, so the body is given):

```ts
export async function breakPhotos(tx: Tx, breakId: string, viewer: { id: string; isHost: boolean; isHolder: boolean; isAdmin: boolean } | null): Promise<BreakPhotos> {
  const [b] = await tx.select({ status: breaks.status, at: breaks.photosUpdatedAt, note: breaks.photosUpdatedNote }).from(breaks).where(eq(breaks.id, breakId));
  if (!b) return { live: [], removed: [], notice: null, unseen: false };
  const privileged = !!viewer && (viewer.isHost || viewer.isAdmin);
  const seesLive = b.status !== "draft" || privileged; // a draft's photos: its host and admins (§5.5)
  const seesRemoved = privileged || !!viewer?.isHolder; // decision 14: never strangers
  const rows = await tx.select().from(breakPhotos).where(sql`${breakPhotos.breakId} = ${breakId} and ${breakPhotos.hiddenAt} is null
      and ((${breakPhotos.removedAt} is null and ${breakPhotos.path} is not null and ${breakPhotos.bucket} <> 'photo-archive' and ${seesLive}::boolean)
        or (${breakPhotos.removedAt} is not null and ${seesRemoved}::boolean))`) // ruling 26: an expired row is neither
    .orderBy(sql`${breakPhotos.removedAt} nulls first`, breakPhotos.position);
  const notice = b.at && b.note ? { text: b.note, at: b.at } : null;
  let unseen = false;
  if (notice && viewer?.isHolder) {
    const [s] = await tx.select({ seenAt: photoNoticesSeen.seenAt }).from(photoNoticesSeen)
      .where(sql`${photoNoticesSeen.userId} = ${viewer.id} and ${photoNoticesSeen.breakId} = ${breakId}`);
    unseen = !s || s.seenAt < notice.at;
  }
  // map rows: removed_at null → PhotoView (prefix = path, never null after the filter above), else RemovedPhotoView (location "photo-archive", prefix = path)
}
```

`leadPhotos`: empty ids → empty map, no query; else one select `where break_id = any(…) and position = 0 and removed_at is null and hidden_at is null and path is not null and bucket = 'photos'` (pass the ids with `inArray`; `bucket = 'photos'` already excludes `photo-archive`, ruling 26).

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; pnpm test src/domain/photos`
Expected: PASS (47).

- [ ] **Step 19: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH
git add src/domain/photos/queries.ts src/domain/photos/queries.test.ts src/domain/photos/test-helpers.ts src/domain/photos/commands.test.ts
git commit -m "feat(photos): breakPhotos and leadPhotos with the visibility rules"
```

- [ ] **Step 20: Write the concurrency tests**

`tests/concurrency/photos.test.ts` (commits for real; `setup.ts` truncates between tests). These are **regression pins**: the commands of Steps 11–15 already take the break lock first, so they pass on their first run; they guard that lock order against later changes.

```ts
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { makeUser, openBreakWithLines, makePhoto, makeTicket, newPrefix, assertInvariants } from "../helpers/fixtures";
import { breakPhotos, breaks, photoUploads } from "@/db/schema";
import { claimLines, markPaid } from "@/domain/lines/commands";
import { requestDraw } from "@/domain/draws/commands";
import { InvalidInput, NotOpen, notOpenMessage } from "@/domain/errors";
import type { Caller } from "@/domain/types";
import { issueUploadTicket, recordProcessedPhoto, removePhoto, reorderPhotos } from "@/domain/photos/commands";

const c = (id: string, role: Caller["role"] = "member"): Caller => ({ id, role, onboarded: true, banned: false });
const ROUNDS = 10;
const livePositions = async (breakId: string) => (await db.select({ p: breakPhotos.position }).from(breakPhotos)
  .where(sql`${breakPhotos.breakId} = ${breakId} and ${breakPhotos.removedAt} is null and ${breakPhotos.hiddenAt} is null`)
  .orderBy(breakPhotos.position)).map((r) => r.p);
const record = (hostId: string, breakId: string, ticketId: string) => (tx: Tx) => recordProcessedPhoto(tx, c(hostId, "host"),
  { ticketId, prefix: newPrefix(breakId), width: 1600, height: 1200, slot: null, alt: "Darts", location: "photos", now: new Date() });
/** Resolves once some backend waits on a row lock: the second transaction is queued behind the first. */
async function blockedOnLock(): Promise<void> {
  for (let i = 0; i < 300; i++) {
    const [r] = await db.execute<{ n: number }>(sql`select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`);
    if (r.n > 0) return;
    await new Promise((res) => setTimeout(res, 10));
  }
  throw new Error("the second transaction never waited on the break lock");
}
/** Runs `first` in a transaction that holds its locks until `release()`; `held` resolves once `first` returned. */
function gated<T>(first: (tx: Tx) => Promise<T>) {
  let release!: () => void; let held!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const ready = new Promise<void>((r) => (held = r));
  const done = db.transaction(async (tx) => { const v = await first(tx); held(); await gate; return v; });
  return { done, ready, release };
}
/** A committed, filled 2-line break and one ticket issued while filled. */
async function filledWithTicket() { /* as draw.test.ts filledBreak, then issueUploadTicket(tx, c(host.id, "host"), { breakId, now: new Date() }) */ }

describe("photo races", () => {
  it("two finalises racing for the 8th place: exactly one wins", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { host, b, t1, t2 } = await db.transaction(async (tx) => {
        const host = await makeUser(tx, { role: "host" });
        const b = await openBreakWithLines(tx, { hostId: host.id });
        for (let i = 0; i < 7; i++) await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: i });
        // Two valid tickets for one place: issuing would refuse the second; this is the lock's own guarantee under test.
        const exp = new Date(Date.now() + 300_000);
        return { host, b, t1: await makeTicket(tx, { hostId: host.id, breakId: b.id, expiresAt: exp }), t2: await makeTicket(tx, { hostId: host.id, breakId: b.id, expiresAt: exp }) };
      });
      const results = await Promise.allSettled([db.transaction(record(host.id, b.id, t1.id)), db.transaction(record(host.id, b.id, t2.id))]);
      expect(results.filter((r) => r.status === "fulfilled"), `round ${round}`).toHaveLength(1);
      const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected")!;
      expect(rejected.reason, `round ${round}`).toBeInstanceOf(InvalidInput); // the cap, not a unique-index violation
      expect(rejected.reason.message).toBe("A break can have up to 8 photos.");
      expect(await livePositions(b.id), `round ${round}`).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      const consumed = await db.select().from(photoUploads).where(sql`${photoUploads.breakId} = ${b.id} and ${photoUploads.consumedAt} is not null`);
      expect(consumed, `round ${round}`).toHaveLength(1);
    }
  });

  it("a draw requested first: the finalise queued behind it is refused and adds nothing", async () => {
    const { host, b, ticketId } = await filledWithTicket();
    const draw = gated((tx) => requestDraw(tx, c(host.id, "host"), { breakId: b.id }));
    await draw.ready;
    const rec = db.transaction(record(host.id, b.id, ticketId));
    await blockedOnLock();
    draw.release();
    await expect(draw.done).resolves.toBeTruthy();
    await expect(rec).rejects.toBeInstanceOf(NotOpen);
    await expect(db.transaction(record(host.id, b.id, ticketId))).rejects.toThrow(notOpenMessage("drawing"));
    expect(await livePositions(b.id)).toEqual([]);
  });

  it("a finalise first: the draw waits for it, and the photo is there before drawing", async () => {
    const { host, b, ticketId } = await filledWithTicket();
    const rec = gated(record(host.id, b.id, ticketId));
    await rec.ready;
    const draw = db.transaction((tx) => requestDraw(tx, c(host.id, "host"), { breakId: b.id }));
    await blockedOnLock();
    rec.release();
    await expect(rec.done).resolves.toMatchObject({ location: "photos" });
    await expect(draw).resolves.toBeTruthy();
    expect(await livePositions(b.id)).toEqual([0]);
    const [row] = await db.select({ status: breaks.status }).from(breaks).where(sql`${breaks.id} = ${b.id}`);
    expect(row.status).toBe("drawing");
  });

  it("finalise against requestDraw, unordered: the draw always lands; the photo lands or is refused as NotOpen", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { host, b, ticketId } = await filledWithTicket();
      const [rec, draw] = await Promise.allSettled([db.transaction(record(host.id, b.id, ticketId)), db.transaction((tx) => requestDraw(tx, c(host.id, "host"), { breakId: b.id }))]);
      expect(draw.status, `round ${round}`).toBe("fulfilled");
      if (rec.status === "rejected") expect(rec.reason, `round ${round}`).toBeInstanceOf(NotOpen);
      expect(await livePositions(b.id), `round ${round}`).toEqual(rec.status === "fulfilled" ? [0] : []);
    }
    await db.transaction((tx) => assertInvariants(tx));
  });

  it("reorder racing remove: positions stay 0..n−1", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { host, b, ids } = await db.transaction(async (tx) => {
        const host = await makeUser(tx, { role: "host" });
        const b = await openBreakWithLines(tx, { hostId: host.id });
        const ids: string[] = [];
        for (let i = 0; i < 4; i++) ids.push((await makePhoto(tx, { breakId: b.id, createdBy: host.id, position: i })).id);
        return { host, b, ids };
      });
      const [reorder, remove] = await Promise.allSettled([
        db.transaction((tx) => reorderPhotos(tx, c(host.id, "host"), { breakId: b.id, order: [...ids].reverse(), now: new Date() })),
        db.transaction((tx) => removePhoto(tx, c(host.id, "host"), { photoId: ids[1], now: new Date() })),
      ]);
      expect(remove.status, `round ${round}`).toBe("fulfilled");
      if (reorder.status === "rejected") expect(reorder.reason.message, `round ${round}`).toBe("The photos just changed. Try again.");
      expect(await livePositions(b.id), `round ${round}`).toEqual([0, 1, 2]);
    }
  });
});
```

- [ ] **Step 21: Run the concurrency suite**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; pnpm test:concurrency`
Expected: PASS at once (regression pins), the existing claim and draw suites and the 5 photo tests, three runs in a row with no flake.

- [ ] **Step 22: Run every gate**

Run (sandbox off, 10-minute timeout): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:concurrency && pnpm test:ci`
Expected: all green, no lint warnings. Nothing outside tests calls these commands yet (Task 6 does), so e2e is not needed here.

- [ ] **Step 23: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH
git add tests/concurrency/photos.test.ts
git commit -m "test(photos): races for the 8th place, against requestDraw, and reorder against remove"
```

---

#### Contract changes and requirements on neighbouring tasks (Task 5)

1. **`recordProcessedPhoto` gains `location: "photos-draft" | "photos"`**: the bucket Task 6 wrote the variants to before the lock. If it does not match the break's status, the command refuses with `PhotosNotReady` ("Photos are still being prepared. Try again.") and leaves the ticket unconsumed; Task 6 copies the variants to `photos`, retries once, and deletes the draft copies (ruling 7). Without it, a photo processed during opening would be recorded as `photos` with its files still in `photos-draft`.
2. **`hidePhoto` returns `prefix: string | null`**: an archived row whose copy the cleanup already dropped has no path.
3. **`appendEvent` gains `opts.processedAt?: Date`**: every `photo.*` event is written already processed.
4. **`ItemCondition` is defined by Task 3** in `src/domain/breaks/rules.ts` and re-exported by `src/domain/photos/types.ts`. The contract had it the other way round.
5. **New exports:** `placeWords` (`notice.ts`); `TICKET_SECONDS`, `MAX_OPEN_TICKETS`, `PHOTO_RATE`, `ALT_MAX`, `rateBucket` (`types.ts`); the fixtures `newPrefix`, `makePhoto`, `makeTicket`, `addPrize`.
6. **What Task 2 must provide:**
   - `break_photos.bucket` accepts `'photo-archive'`.
   - `path` is nullable, null only on archived rows.
   - No `position >= 0` check, because compaction passes through negative positions.
   - The live unique index on `(break_id, position) where removed_at is null and hidden_at is null` is not deferrable.
   - `prizes.slot_key` defaults to `gen_random_uuid()`.
   - `photo_notices_seen` has the primary key `(user_id, break_id)`.
   - On a frozen break the status trigger lets an update through only inside a transaction that called `allowPhotoModeration(tx)`, and then only for `hidden_at`, `position`, `bucket` and `path` (ruling 10). `hidePhoto` calls it so a hide works after the draw; Task 11 calls it when it nulls `path`.
   - `break_photos_gone_chk` is `path is not null or bucket = 'photo-archive'` (ruling 26), so live reads add `path is not null and bucket <> 'photo-archive'`.
7. **No Replace (ruling 34):** the strip has no Replace item. A host replaces the lead by removing it (another photo takes position 0) or by making another photo lead; each reads "Lead photo replaced" under the notice rules above.
8. **My calls within the rulings:**
   - Tagging an untagged photo does not count.
   - Moving a photo off a prize counts and reads "Top-spot photo untagged".
   - A rank with two or more items uses item names, which extends ruling 3 to 2nd place.
   - Bad-input copy and the rate-limit copy are as in the Copy table above. Task 12 adds them to the copy audit.
9. **Errors (ruling 23):** this task adds `PhotosNotReady`, `UploadNotFound`, `UploadExpired` and `UploadUsed` to `src/domain/errors.ts` and is the only one that throws them from the domain; Task 6 maps them to responses.

### Task 6: Pipeline wiring: actions, finalise route, open copy, URLs, archive moves (model: Opus)

Everything between Task 5's commands and Storage: the server actions (spec §5.2), the finalise route handler (§5.3
steps 1, 4–6), the copy into `photos` when a break opens (§5.4), the archive move on a counted removal (§6), the removal
of a deleted draft's files, and `photoSrc` (§5.5 reads). **No Storage call runs inside a database transaction or while
a break row is locked** (panel ruling 28): `requestPhotoUpload` commits the ticket first and signs the upload URL after.
The rule for every move: **write the new copy, commit, then delete the old one**; a failure at any point leaves at least
one complete copy and a row that can find it (Task 11's cleanup matches by prefix across buckets, ruling 11). A removal
after a claim never commits with its files outside `photo-archive` (panel ruling 24). When a transaction reports a
failure that is not a `DomainError`, it may still have committed; before deleting anything on that path the code
re-reads what the database holds and deletes only what the re-read proves unused.

**Files:**
- Create: `src/photos/variants.ts` (prefix and per-variant storage helpers)
- Create: `src/photos/urls.ts`, test `src/photos/urls.test.ts`
- Create: `src/domain/photos/peek.ts` (unlocked reads the pipeline needs before any storage call, and dropping an
  unsigned ticket), test `src/domain/photos/peek.test.ts`
- Create: `src/photos/publish.ts` (the open copy), test `src/photos/publish.test.ts`
- Create: `src/app/api/photos/finalise/route.ts`, tests `src/app/api/photos/finalise/route.test.ts` and
  `src/app/api/photos/finalise/config.test.ts`
- Create: `src/app/photos/actions.ts`, test `src/app/photos/actions.test.ts`
- Create: `tests/helpers/photos.ts` (`seedPhoto`)
- Modify: `src/app/b/[id]/host-actions.ts` (`openBreakAction`), `src/app/host/new/actions.ts` (`saveBreak`'s Open
  intent), `src/app/host/actions.ts` (`deleteDraftAction`, owned by Task 3b: Task 6 adds the storage removal only),
  `vercel.json` (adds `functions`, keeps every existing key)
- Test: `src/app/b/[id]/host-actions.test.ts` (new), `src/app/host/actions.test.ts` (add to Task 3b's file, or create it)

**Interfaces:**
- Consumes: `BUCKETS`, `BucketName`, `VARIANT_WIDTHS`, `VariantWidth`, `PREFIX_PATTERN`, `variantPath`,
  `publicVariantUrl`, `PhotoStorage`, `photoStorage`, `createMemoryStorage`, `TooLarge`, `StorageNotFound` (Task 1);
  `processPhoto`, `UnsupportedImage`, `MAX_INCOMING_BYTES`, `photoFixtures` (Task 4); `issueUploadTicket`,
  `recordProcessedPhoto` (refuses a location that does not match the break's status with `PhotosNotReady`, ruling 7),
  `removePhoto`, `reorderPhotos`, `retagPhoto`, `describePhoto`, `markPhotoNoticeSeen`, `PhotoLocation`, `PhotoView`,
  `RemovedPhotoView` (Task 5); **`PhotosNotReady`, `UploadNotFound`, `UploadExpired`, `UploadUsed` from
  `src/domain/errors.ts`, added by Task 5** (panel ruling 23; Task 6 only imports them); `deleteDraft` (sets
  `breaks.deleted_at`, returns `{ photos: { location, prefix }[] }`), `deleteDraftAction` in `src/app/host/actions.ts`,
  `openBreak` flipping live rows to `photos` (Task 3a); the `break_photos` and `photo_uploads` tables,
  `breaks.first_claimed_at` and `breaks.deleted_at` (Task 2); `action`, `toFailure`, `parseInput`, `getCaller`,
  `lockBreak`, `assertHostOf`, `assertOnboarded`, `DomainError`, `NotOpen`.
- Produces:
  - `src/photos/variants.ts`: `newPhotoPrefix(breakId: string): string` (`${breakId}/${randomBytes(16).toString("base64url")}`,
    matches `PREFIX_PATTERN`); `putVariants(s: PhotoStorage, bucket: BucketName, prefix: string, variants:
    Processed["variants"]): Promise<void>`; `copyVariants(s, prefix, from: BucketName, to: BucketName): Promise<void>`;
    `removeVariants(s, bucket: BucketName, prefix: string): Promise<void>` (the three `variantPath`s in one call).
  - `src/photos/urls.ts`: `photoSrc` and `PhotoSrc` exactly as the contract; `SIGNED_READ_SECONDS = 600`.
  - `src/domain/photos/peek.ts`:
    `peekUploadTicket(tx: Tx, caller: Caller, p: { ticketId: string; now: Date }): Promise<{ breakId: string;
    incomingName: string; expired: boolean; consumed: boolean; breakStatus: string }>` — no lock; `assertOnboarded`;
    throws `UploadNotFound` when the ticket is missing **or belongs to another user** (admins included: a ticket is
    personal); never throws for expired or consumed, so the route can still remove the caller's own incoming file.
    `peekPhoto(tx: Tx, photoId: string): Promise<{ breakId: string; hostId: string; prefix: string; location:
    PhotoLocation; live: boolean; claimed: boolean } | null>` — `claimed` is `breaks.first_claimed_at is not null`.
    `peekBreakStatus(tx: Tx, breakId: string): Promise<string | null>` — the status, null for a missing or deleted break.
    `dropUploadTicket(tx: Tx, caller: Caller, ticketId: string): Promise<void>` — deletes the caller's own unconsumed
    ticket (no break lock: one row, and deleting only lowers the count the cap reads).
  - `src/photos/publish.ts`:
    `publishDraftPhotos(s: PhotoStorage, caller: Caller, breakId: string): Promise<{ ids: ReadonlySet<string>; prefixes:
    readonly string[] }>` — in its own short read, only when the caller hosts the break (or is admin) and it is a draft,
    lists live rows in `photos-draft`, then (the read committed) copies each one's three variants to `photos`; returns
    the copied photo ids and prefixes (empty for anyone else, so `openBreak` gives its own refusal). On any copy failure
    removes what it copied into `photos` (best effort) and throws `PhotosNotReady`.
    `assertPhotosPublished(tx: Tx, breakId: string, copied: ReadonlySet<string>): Promise<void>` — inside the open
    transaction, after the break is locked: throws `PhotosNotReady` if any live row is in `photos-draft` and not in
    `copied` (a finalise that landed between the copy and the lock).
    `settleOpenCopies(s: PhotoStorage, breakId: string, prefixes: readonly string[], failure: ActionFailure | null):
    Promise<boolean>` — after the open transaction returns; resolves `true` when the open is known to have committed.
    `failure` null → remove the `photos-draft` originals, `true`. A `DomainError` failure (any code but `INTERNAL`):
    the transaction rolled back → remove the `photos` copies, `false`. `INTERNAL` (the commit may have landed):
    `peekBreakStatus` in a fresh read; still `draft` → remove the `photos` copies, `false`; anything else → the open
    committed → remove the `photos-draft` originals, `true`; the re-read itself fails → remove nothing, `false`. Every
    removal here logs and swallows its error (Task 11's cleanup is the backstop).
  - `POST /api/photos/finalise` body `{ ticketId: string; slot: string | null; alt: string }` → `200 { photoId: string;
    src: PhotoSrc }` (`src` at size 160, so the strip swaps the tile in place) | `{ error: string }` with the status of
    Step 9. `export async function POST(req: Request): Promise<Response>`; `runtime = "nodejs"`, `maxDuration = 30`,
    `dynamic = "force-dynamic"`; no other export (Next refuses other names in a route module).
  - `src/app/photos/actions.ts` (`"use server"`), every one returning `ActionResult`:
    `requestPhotoUpload(breakId: string): Promise<ActionResult<{ ticketId: string; uploadUrl: string; token: string }>>`,
    `removePhotoAction(photoId: string): Promise<ActionResult<void>>`,
    `reorderPhotosAction(breakId: string, order: string[]): Promise<ActionResult<void>>`,
    `retagPhotoAction(photoId: string, slot: string | null): Promise<ActionResult<void>>`,
    `describePhotoAction(photoId: string, alt: string): Promise<ActionResult<void>>`,
    `markPhotoNoticeSeenAction(breakId: string): Promise<ActionResult<void>>`.
    (`deleteDraftAction` is **not** here: it stays in `src/app/host/actions.ts`, panel ruling 39.)
  - `tests/helpers/photos.ts`: `seedPhoto(tx: Tx, s: PhotoStorage, caller: Caller, breakId: string, o?: { slot?: string
    | null; alt?: string }): Promise<{ photoId: string; prefix: string; location: PhotoLocation }>` — issues a ticket,
    puts three small placeholder bodies at the variant paths in the location the break's status implies, and calls
    `recordProcessedPhoto` with that location (no sharp; for tests that only need rows and files).

**Test harness (route and action tests).** As `src/app/b/[id]/og/route.test.ts`, mock `@/db/client` so `db.transaction`
runs inside the test's `withTx` transaction, with two changes: it runs `fn` in a **savepoint** (`current.transaction(fn)`,
so a throw rolls back exactly as a real transaction would), and it supports a commit that reports failure:

```ts
let current: Tx | null = null;
let failAfterCommit = false;
/** Call from inside a mocked command: its transaction commits (the savepoint is released), then db.transaction rejects. */
const commitThenFail = () => { failAfterCommit = true; };
const timeline: string[] = []; // "tx:begin", "tx:end" and every storage op, in order
vi.mock("@/db/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/db/client")>();
  return { ...real, db: { transaction: async <T>(fn: (tx: Tx) => Promise<T>) => {
    if (!current) return real.db.transaction(fn);
    timeline.push("tx:begin");
    try {
      const out = await current.transaction(fn);
      if (failAfterCommit) { failAfterCommit = false; throw new Error("connection reset after commit"); }
      return out;
    } finally { timeline.push("tx:end"); }
  } } };
});
/** Storage ops that ran between a tx:begin and its tx:end (panel ruling 28: must be empty). */
const storageInsideTx = () => { let d = 0; return timeline.filter((e) => (e === "tx:begin" ? (d++, false) : e === "tx:end" ? (d--, false) : d > 0)); };
```

Also mock `@/auth/session` (`getCaller: async () => caller`, a `let caller: Caller | null`), `@/storage/photo-storage`
(`photoStorage: () => recording(mem)`, with `mem = createMemoryStorage()` fresh per test), `next/cache`
(`revalidatePath: vi.fn()`), and `next/navigation`'s `redirect` (throws `new Error(\`REDIRECT:${to}\`)`, for
`deleteDraftAction` and `saveBreak`). `@/domain/photos/commands`, `@/domain/photos/peek`, `@/domain/breaks/commands` and
`@/photos/process` are mocked with every export wrapped as `vi.fn(realExport)`, so a test overrides one call with
`mockImplementationOnce` and reaches the real one through `vi.importActual`; `afterEach` runs `vi.clearAllMocks()`,
empties `timeline` and sets `current = null`. `recording(mem)` pushes `"sign:incoming"`, `"download:<bucket>"`,
`"put:<bucket>"`, `"copy:<to bucket>"`, `"remove:<bucket>"` onto both `ops` and `timeline`, and rejects the operations its
`failOn: (op: string, n: number) => boolean` selects (`n` counts that op so far, from 1). `key(bucket, path)` is the memory
store's file key (ruling 11: `${bucket}/${path}`); `filesIn(bucket)` lists `mem.files` keys under that bucket, sorted.
`rows(tx, breakId)` selects that break's `break_photos` rows; `ticket(tx, id)` selects one `photo_uploads` row.

- [ ] **Step 1: Write the failing tests for `variants.ts`, `urls.ts` and `peek.ts`**

`src/photos/urls.test.ts` (`P = \`${randomUUID()}/${"A".repeat(22)}\``, `mem = createMemoryStorage()`):
```ts
it("a photo in `photos` gets public URLs and a srcset over the three widths", async () => {
  const s = await photoSrc(mem, { location: "photos", prefix: P, width: 1600, height: 1200, alt: "Taylor Chronos" }, 640);
  expect(s).toEqual({
    src: publicVariantUrl(P, 640),
    srcSet: `${publicVariantUrl(P, 160)} 160w, ${publicVariantUrl(P, 640)} 640w, ${publicVariantUrl(P, 1600)} 1600w`,
    width: 1600, height: 1200, alt: "Taylor Chronos",
  });
});
it("srcset widths are the variants' real widths, and duplicates collapse (ruling 4)", async () => {
  expect((await photoSrc(mem, { location: "photos", prefix: P, width: 100, height: 100, alt: "a" }, 160)).srcSet)
    .toBe(`${publicVariantUrl(P, 160)} 100w`);
  expect((await photoSrc(mem, { location: "photos", prefix: P, width: 1600, height: 160, alt: "a" }, 160)).srcSet)
    .toBe(`${publicVariantUrl(P, 160)} 160w, ${publicVariantUrl(P, 640)} 640w, ${publicVariantUrl(P, 1600)} 1600w`);
  expect((await photoSrc(mem, { location: "photos", prefix: P, width: 300, height: 400, alt: "a" }, 160)).srcSet)
    .toBe(`${publicVariantUrl(P, 160)} 120w, ${publicVariantUrl(P, 640)} 300w`);
});
it.each(["photos-draft", "photo-archive"] as const)("a photo in %s gets 10-minute signed URLs and never a public one", async (location) => {
  const spy = vi.spyOn(mem, "signedReadUrl");
  const s = await photoSrc(mem, { location, prefix: P, width: 1600, height: 1200, alt: "a" }, 160);
  expect(spy.mock.calls).toEqual(VARIANT_WIDTHS.map((w) => [location, variantPath(P, w), 600]));
  expect(s.src + s.srcSet).not.toContain("/object/public/");
});
it("newPhotoPrefix matches PREFIX_PATTERN, starts with the break id, and never repeats", () => {
  const id = randomUUID();
  const [a, b] = [newPhotoPrefix(id), newPhotoPrefix(id)];
  expect(a).toMatch(PREFIX_PATTERN); expect(a.startsWith(`${id}/`)).toBe(true); expect(a).not.toBe(b);
});
```
`src/domain/photos/peek.test.ts` (database, `withTx`, no mocks; `as(u, role?)` builds a `Caller`):
```ts
it("peekUploadTicket reads a fresh, an expired and a consumed ticket without throwing", async () => {
  // host + makeBreak(draft); t = issueUploadTicket(...)
  expect(await peekUploadTicket(tx, as(host), { ticketId: t.ticketId, now: NOW })).toEqual(
    { breakId: b.id, incomingName: t.incomingName, expired: false, consumed: false, breakStatus: "draft" });
  await tx.update(photoUploads).set({ expiresAt: new Date(NOW.getTime() - 1) }).where(eq(photoUploads.id, t.ticketId));
  expect((await peekUploadTicket(tx, as(host), { ticketId: t.ticketId, now: NOW })).expired).toBe(true);
  // t2 issued and recorded with recordProcessedPhoto (location "photos-draft")
  expect((await peekUploadTicket(tx, as(host), { ticketId: t2.ticketId, now: NOW })).consumed).toBe(true);
});
it("peekUploadTicket refuses an unknown id, another host's ticket, an admin on someone else's, and a banned caller", async () => {
  await expect(peekUploadTicket(tx, as(host), { ticketId: randomUUID(), now: NOW })).rejects.toBeInstanceOf(UploadNotFound);
  await expect(peekUploadTicket(tx, as(other, "host"), { ticketId: t.ticketId, now: NOW })).rejects.toBeInstanceOf(UploadNotFound);
  await expect(peekUploadTicket(tx, as(admin, "admin"), { ticketId: t.ticketId, now: NOW })).rejects.toBeInstanceOf(UploadNotFound);
  await expect(peekUploadTicket(tx, { ...as(host), banned: true }, { ticketId: t.ticketId, now: NOW })).rejects.toBeInstanceOf(NotAuthorized);
});
it("peekPhoto reports claimed only after a claim, and null for an unknown id", async () => {
  // b = openBreakWithLines; p = makePhoto on b
  expect(await peekPhoto(tx, p.id)).toMatchObject({ breakId: b.id, hostId: host.id, prefix: p.prefix, location: "photos", live: true, claimed: false });
  await claimLines(tx, as(buyer), { breakId: b.id, numbers: [1], batchId: randomUUID() });
  expect((await peekPhoto(tx, p.id))!.claimed).toBe(true);
  expect(await peekPhoto(tx, randomUUID())).toBeNull();
});
it("peekBreakStatus reads the status, and null for a missing or deleted break", async () => {
  expect(await peekBreakStatus(tx, b.id)).toBe("draft");
  expect(await peekBreakStatus(tx, randomUUID())).toBeNull();
  await deleteDraft(tx, as(host, "host"), b.id);
  expect(await peekBreakStatus(tx, b.id)).toBeNull();
});
it("dropUploadTicket deletes only the caller's own unconsumed ticket", async () => {
  await dropUploadTicket(tx, as(other, "host"), t.ticketId);
  expect(await tx.select().from(photoUploads).where(eq(photoUploads.id, t.ticketId))).toHaveLength(1);
  await dropUploadTicket(tx, as(host), t.ticketId);
  expect(await tx.select().from(photoUploads).where(eq(photoUploads.id, t.ticketId))).toEqual([]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/photos/urls.test.ts src/domain/photos/peek.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `src/photos/variants.ts`, `src/photos/urls.ts`, `src/domain/photos/peek.ts`**

`photoSrc` srcset rule (the one algorithm the signature does not fix): with `L = max(width, height)` of the largest
variant, the variant labelled `w` has real width `round(width × min(w, L) / L)`; list the variants in
`VARIANT_WIDTHS` order, skipping one whose real width equals the previous entry's. `src` is the variant labelled
`size`. `photos` → `publicVariantUrl`; any other location → `storage.signedReadUrl(location, variantPath(prefix, w),
SIGNED_READ_SECONDS)` per listed variant, run in parallel.

- [ ] **Step 4: Run them to see them pass**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/photos/urls.test.ts src/domain/photos/peek.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing route tests `src/app/api/photos/finalise/route.test.ts`**

`post(body, headers?)` builds `new Request("http://localhost/api/photos/finalise", { method: "POST", headers: {
"content-type": "application/json", origin: "http://localhost", ...headers }, body: JSON.stringify(body) })`.
`upload(tx, host, breakId, file)` issues a ticket with `issueUploadTicket`, sets `mem.files` at
`key("incoming", incomingName)` to `file`, and returns `{ ticketId, incomingName }`. `realRecord` is
`(await vi.importActual<typeof import("@/domain/photos/commands")>("@/domain/photos/commands")).recordProcessedPhoto`,
`realProcess` likewise from `@/photos/process`. `openNow(tx, id)` sets `breaks.status = 'open'` directly on `tx` (the
outer test transaction, outside any savepoint). Every test runs inside `withTx` with `current = tx`, a 60 s timeout,
and Task 4's `photoFixtures()`; every one also asserts `expect(storageInsideTx()).toEqual([])` (ruling 28).

```ts
it("a draft's photo lands in photos-draft as three variants, the row is recorded, the incoming file is gone", async () => {
  // host + makeBreak(draft); r = await post({ ticketId, slot: null, alt: "Taylor Chronos 24g" })
  expect(r.status).toBe(200);
  const { photoId, src } = await r.json();
  expect(filesIn("photos-draft")).toHaveLength(3);
  for (const k of filesIn("photos-draft")) expect(k).toMatch(new RegExp(`^photos-draft/${b.id}/[A-Za-z0-9_-]{22}-(160|640|1600)\\.webp$`));
  expect(filesIn("photos")).toEqual([]);
  expect(filesIn("incoming")).toEqual([]);
  expect(await rows(tx, b.id)).toMatchObject([{ id: photoId, bucket: "photos-draft", position: 0, alt: "Taylor Chronos 24g" }]);
  expect((await ticket(tx, ticketId)).consumedAt).not.toBeNull();
  expect(src.src).not.toContain("/object/public/");      // a draft is read through a signed URL
});
it("an open break's photo lands in photos", async () => {
  // openBreakWithLines; upload(fx.tiny); r = await post(...)
  expect(r.status).toBe(200);
  expect(filesIn("photos")).toHaveLength(3);
  expect([...filesIn("photos-draft"), ...filesIn("incoming")]).toEqual([]);
  expect((await r.json()).src.src).toBe(publicVariantUrl((await rows(tx, b.id))[0].path!, 160));
});
it("the break opened while the photo was processing: copied to photos, recorded once with location photos, draft copies gone (ruling 7)", async () => {
  // draft; upload(fx.tiny); vi.mocked(processPhoto).mockImplementationOnce(async (buf) => { await openNow(tx, b.id); return realProcess(buf); })
  expect(r.status).toBe(200);
  expect(vi.mocked(recordProcessedPhoto).mock.calls.map((c) => c[2].location)).toEqual(["photos-draft", "photos"]);
  expect(filesIn("photos")).toHaveLength(3);
  expect([...filesIn("photos-draft"), ...filesIn("incoming")]).toEqual([]);
  expect(await rows(tx, b.id)).toMatchObject([{ bucket: "photos" }]);
  expect(ops.filter((o) => o !== "download:incoming" && o !== "remove:incoming")).toEqual(
    ["put:photos-draft", "put:photos-draft", "put:photos-draft", "copy:photos", "copy:photos", "copy:photos", "remove:photos-draft"]);
});
it("a second refusal after the copy removes every copy and answers that refusal", async () => {
  // as above (processPhoto opens the break), then the retry is refused:
  // vi.mocked(recordProcessedPhoto).mockImplementationOnce(realRecord).mockImplementationOnce(async () => { throw new InvalidInput("A break can have up to 8 photos."); })
  expect(r.status).toBe(400);
  expect(await r.json()).toEqual({ error: "A break can have up to 8 photos." });
  expect([...filesIn("photos-draft"), ...filesIn("photos"), ...filesIn("incoming")]).toEqual([]);
  expect(await rows(tx, b.id)).toEqual([]);
});
it("a failed copy after the break opened removes every copy and answers 'Photos are still being prepared. Try again.'", async () => {
  // processPhoto opens the break; failOn: (op, n) => op === "copy:photos" && n === 2
  expect(r.status).toBe(409);
  expect(await r.json()).toEqual({ error: "Photos are still being prepared. Try again." });
  expect([...filesIn("photos-draft"), ...filesIn("photos"), ...filesIn("incoming")]).toEqual([]);
  expect(await rows(tx, b.id)).toEqual([]);
});
it("a record that committed but reported a failure keeps the variants the row names", async () => {
  // draft; vi.mocked(recordProcessedPhoto).mockImplementationOnce(async (t, c, p) => { commitThenFail(); return realRecord(t, c, p); })
  expect(r.status).toBe(500);
  const [row] = await rows(tx, b.id);
  expect(filesIn("photos-draft")).toEqual(VARIANT_WIDTHS.map((w) => key("photos-draft", variantPath(row.path!, w))).sort());
  expect(filesIn("incoming")).toEqual([]);
});
it("another host's ticket answers 404 and leaves that host's incoming file alone", async () => {
  // A uploads; caller = B
  expect(r.status).toBe(404);
  expect(await r.json()).toEqual({ error: "This upload could not be found. Try again." });
  expect(filesIn("incoming")).toEqual([key("incoming", incomingName)]);
  expect([...filesIn("photos-draft"), ...filesIn("photos")]).toEqual([]);
});
it("an expired ticket answers 410 and removes the incoming file", async () => {
  // expires_at set in the past
  expect(r.status).toBe(410);
  expect(await r.json()).toEqual({ error: "This upload took too long. Try again." });
  expect([...filesIn("incoming"), ...filesIn("photos-draft")]).toEqual([]);
});
it("a ticket used once answers 409 the second time and removes the re-sent file", async () => {
  // first post 200; mem.files.set(key("incoming", incomingName), fx.tiny); second post
  expect(second.status).toBe(409);
  expect(await second.json()).toEqual({ error: "This upload was already used. Try again." });
  expect(filesIn("incoming")).toEqual([]);
  expect(await rows(tx, b.id)).toHaveLength(1);
});
it("a file over 5 MB answers 413, writes no variant, leaves the ticket unconsumed, removes the incoming file", async () => {
  // upload(Buffer.concat([fx.tiny, Buffer.alloc(MAX_INCOMING_BYTES + 1 - fx.tiny.length)]))
  expect(r.status).toBe(413);
  expect(await r.json()).toEqual({ error: "This photo is over 5 MB. Pick a smaller one." });
  expect([...filesIn("photos-draft"), ...filesIn("photos"), ...filesIn("incoming")]).toEqual([]);
  expect((await ticket(tx, ticketId)).consumedAt).toBeNull();
});
it.each(["svg", "gif", "htmlAsJpg", "pixelBomb"] as const)("%s answers 415 with no variant anywhere and no incoming file", async (name) => {
  expect(r.status).toBe(415);
  expect(await r.json()).toEqual({ error: "This photo can't be used. Pick a JPEG, PNG or WebP." });
  expect([...filesIn("photos-draft"), ...filesIn("photos"), ...filesIn("incoming")]).toEqual([]);
});
it("a refusal after the put removes the variants and the incoming file", async () => {
  // vi.mocked(recordProcessedPhoto).mockImplementationOnce(async () => { throw new InvalidInput("refused"); })
  expect(r.status).toBe(400);
  expect(await r.json()).toEqual({ error: "refused" });
  expect([...filesIn("photos-draft"), ...filesIn("photos"), ...filesIn("incoming")]).toEqual([]);
});
it("no incoming file (the upload never arrived) answers 409", async () => {
  // ticket issued, nothing put in incoming
  expect(r.status).toBe(409);
  expect(await r.json()).toEqual({ error: "The photo didn't arrive. Try again." });
  expect((await ticket(tx, ticketId)).consumedAt).toBeNull();
});
it("refuses a signed-out caller (401), a cross-site origin (403) and a malformed body (400), touching nothing", async () => {
  caller = null;
  const u = await post(body);
  expect([u.status, await u.json()]).toEqual([401, { error: "Sign in to continue" }]);
  caller = as(host, "host");
  const x = await post(body, { origin: "https://evil.example" });
  expect([x.status, await x.json()]).toEqual([403, { error: "This request was refused." }]);
  expect(filesIn("incoming")).toEqual([key("incoming", incomingName)]);
  expect((await ticket(tx, ticketId)).consumedAt).toBeNull();
  expect((await post({ ...body, alt: "x".repeat(121) })).status).toBe(400);
  expect((await post({ ...body, ticketId: "../x" })).status).toBe(400);
  expect(ops.filter((o) => o !== "remove:incoming")).toEqual([]);
});
it("reads the body with a 2 KB cap: a chunked oversized body with no Content-Length answers 413 unread (ruling 30)", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull: (c) => c.enqueue(new TextEncoder().encode(" ".repeat(1024))), // never ends on its own
    cancel: () => { cancelled = true; },
  });
  const req = new Request("http://localhost/api/photos/finalise", {
    method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: stream, duplex: "half",
  } as RequestInit);
  expect(req.headers.get("content-length")).toBeNull();
  const r = await POST(req);
  expect(r.status).toBe(413);
  expect(await r.json()).toEqual({ error: "This request was refused." });
  expect(cancelled).toBe(true);
  expect(filesIn("incoming")).toEqual([key("incoming", incomingName)]);
  expect((await ticket(tx, ticketId)).consumedAt).toBeNull();
});
it("a drawing break answers 409 with the state copy and removes the incoming file", async () => {
  // ticket issued while open, then status set to 'drawing'
  expect(r.status).toBe(409);
  expect(await r.json()).toEqual({ error: notOpenMessage("drawing") });
  expect(filesIn("incoming")).toEqual([]);
});
```
The `polyglot` fixture is not in the refused list: it is a real JPEG and is accepted; Task 4 proves no byte of its HTML
survives the re-encode (panel ruling 32).

`src/app/api/photos/finalise/config.test.ts`:
```ts
it("the route runs on Node for up to 30 s, and vercel.json keeps its keys while adding the function config", async () => {
  const route = await import("./route");
  expect([route.runtime, route.maxDuration, route.dynamic]).toEqual(["nodejs", 30, "force-dynamic"]);
  const v = JSON.parse(readFileSync("vercel.json", "utf8"));
  expect(v.crons).toContainEqual({ path: "/api/tick", schedule: "* * * * *" });
  expect(v.functions["src/app/api/photos/finalise/route.ts"]).toEqual({ maxDuration: 30 });
});
```

- [ ] **Step 6: Run them to see them fail**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/app/api/photos/finalise`
Expected: FAIL, "Cannot find module './route'".

- [ ] **Step 7: The photo errors are already present; import them**

`PhotosNotReady`, `UploadNotFound`, `UploadExpired` and `UploadUsed` are added to `src/domain/errors.ts` by Task 5 (panel
ruling 23). Do not add or change them here. Import them where Steps 3, 8 and 14 need them, and confirm their status
and copy match the Step 9 table; if Task 5's differ, Task 5 wins and the implementer reports the mismatch.

- [ ] **Step 8: Implement `src/app/api/photos/finalise/route.ts`**

`export async function POST(req: Request): Promise<Response>`; every response carries `Cache-Control: no-store`. Order:

1. `Origin` header present and not equal to `new URL(req.url).origin` → 403 "This request was refused.".
   `content-type` not `application/json` → 415 "This request was refused.". The `Content-Length` header is not
   consulted: the capped read below is the only size guard.
2. Read the body from `req.body` with a module-private `readCapped(req, 2048)`: pull chunks from the reader, summing
   their bytes; past 2048 → `reader.cancel()` and 413 "This request was refused."; a null body is zero bytes. Then
   `JSON.parse` the UTF-8 text; a parse error → 400 "This request was refused." (panel ruling 30: a missing
   `Content-Length` is no exception).
3. `getCaller()`; null → 401 "Sign in to continue"; banned → 403 "This account is suspended".
4. `parseInput(z.object({ ticketId: z.uuid(), slot: z.uuid().nullable(), alt: z.string().trim().min(1).max(120) }))`
   → 400 with the issue's message.
5. `db.transaction(tx => peekUploadTicket(tx, caller, { ticketId, now }))`. A throw here returns before any storage
   call (another host's file is never touched).
6. `try { … } finally { await storage.remove("incoming", [incomingName]).catch(log) }` around everything below:
   `consumed` → `UploadUsed`; `expired` → `UploadExpired`; `breakStatus` draft → `putBucket = "photos-draft"`, open or
   filled → `"photos"`, else `throw new NotOpen(breakStatus)`; `storage.download("incoming", incomingName,
   MAX_INCOMING_BYTES)`; `processPhoto` (no transaction open); `prefix = newPhotoPrefix(breakId)`; `putVariants(putBucket)`.
7. Record, with `record(location) = db.transaction(tx => recordProcessedPhoto(tx, caller, { ticketId, prefix, location,
   width, height, slot, alt, now: new Date() }))` (panel ruling 7):
   - `record(putBucket)` succeeds → done.
   - It throws `PhotosNotReady` and `putBucket` is `"photos-draft"` (the break opened while the photo was processing):
     `copyVariants(prefix, "photos-draft" → "photos")`, then `record("photos")` once. On success, `removeVariants(
     "photos-draft")` (logged on failure, the row is in `photos`). If the copy fails, remove every copy (`photos-draft`
     and `photos`) and answer `PhotosNotReady`; if the retry throws, remove every copy and answer that error.
   - It throws another `DomainError` (or `PhotosNotReady` for a `photos` put) → `removeVariants(putBucket)`, rethrow.
   - It throws anything else (the commit may have landed): `peekUploadTicket` in a fresh read; `consumed` → the row
     exists and names these files: keep them, answer 500. Not consumed → `removeVariants(putBucket)`, answer 500. If
     the re-read fails, remove nothing and answer 500 (Task 11's cleanup removes unnamed files after 24 hours).
8. `revalidatePath(`/b/${breakId}`)`; respond `{ photoId, src: await photoSrc(storage, { location, prefix, width,
   height, alt }, 160) }` with the location the successful record returned.

Errors map in one function: `DomainError` → `e.status` and `e.message`; `UnsupportedImage` → 415; the storage
`TooLarge` → 413; `StorageNotFound` on download → 409; anything else → logged, 500 "Something went wrong. Please
try again."

- [ ] **Step 9: Copy and status codes (plan copy, not in the spec; each line passes `copy-audit.test.ts`)**

| Condition | Status | `error` / `message` |
|---|---|---|
| Signed out | 401 | `Sign in to continue` |
| Banned | 403 | `This account is suspended` |
| Cross-site origin, wrong content type, body over 2 KB, body not JSON | 403 / 415 / 413 / 400 | `This request was refused.` |
| Ticket missing or another user's (`UploadNotFound`) | 404 | `This upload could not be found. Try again.` |
| Ticket expired (`UploadExpired`) | 410 | `This upload took too long. Try again.` |
| Ticket consumed (`UploadUsed`) | 409 | `This upload was already used. Try again.` |
| No incoming file | 409 | `The photo didn't arrive. Try again.` |
| Over 5 MB (`TooLarge`) | 413 | `This photo is over 5 MB. Pick a smaller one.` |
| `UnsupportedImage` | 415 | `This photo can't be used. Pick a JPEG, PNG or WebP.` |
| Frozen or not a host state (`NotOpen`) | 409 | `notOpenMessage(status)` |
| Any other `DomainError` (cap, rate limit, tag) | its status | its message |
| Open copy or finalise copy failed (`PhotosNotReady`) | 409 | `Photos are still being prepared. Try again.` (spec §5.4) |
| Archive copy before a removal failed (action, code `INTERNAL`) | — | `Couldn't remove the photo. Try again.` (panel ruling 24) |
| Anything else | 500 / `INTERNAL` | `Something went wrong. Please try again.` |

- [ ] **Step 10: Add the function config to `vercel.json`**

Add a `functions` key to the existing object and keep every key already there (today only `crons`; Task 11 later adds a
second cron beside it, panel ruling 39). The result today:

```json
{
  "crons": [{ "path": "/api/tick", "schedule": "* * * * *" }],
  "functions": { "src/app/api/photos/finalise/route.ts": { "maxDuration": 30 } }
}
```
Memory: under Fluid compute (Vercel's default) a per-function `memory` key in `vercel.json` is not honoured; the
project's standard 2 GB covers one 12 MP decode at `sharp.concurrency(1)`. Check the project setting in the Vercel
dashboard and say so in the PR description; do not add a `memory` key.

- [ ] **Step 11: Run the route tests to see them pass**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/app/api/photos/finalise`
Expected: PASS.

- [ ] **Step 12: Write the failing action tests**

`src/app/photos/actions.test.ts` (harness above; photos made with `seedPhoto`; `realRemove`, `realPeekPhoto` from
`vi.importActual`; every test also asserts `expect(storageInsideTx()).toEqual([])`):
```ts
it("requestPhotoUpload commits the ticket, then signs an upload into incoming for that ticket's name (ruling 28)", async () => {
  const spy = vi.spyOn(mem, "createSignedUpload");
  const r = await requestPhotoUpload(b.id);
  expect(r.ok).toBe(true);
  const [t] = await tx.select().from(photoUploads).where(eq(photoUploads.breakId, b.id));
  expect(r.ok && r.data.ticketId).toBe(t.id);
  expect(spy.mock.calls).toEqual([[t.incomingName]]);
  expect(timeline).toEqual(["tx:begin", "tx:end", "sign:incoming"]);
});
it("requestPhotoUpload deletes the ticket when the upload URL cannot be signed", async () => {
  // failOn: (op) => op === "sign:incoming"
  const r = await requestPhotoUpload(b.id);
  expect(r).toEqual({ ok: false, code: "INTERNAL", message: "Something went wrong. Please try again." });
  expect(await tx.select().from(photoUploads).where(eq(photoUploads.breakId, b.id))).toEqual([]);
  expect(timeline).toEqual(["tx:begin", "tx:end", "sign:incoming", "tx:begin", "tx:end"]); // signed outside, dropped after
});
it("removing before any claim deletes the variants outright; nothing reaches photo-archive", async () => {
  expect((await removePhotoAction(p.photoId)).ok).toBe(true);
  expect(ops).toEqual(["remove:photos"]); expect(filesIn("photo-archive")).toEqual([]);
  expect(await rows(tx, b.id)).toEqual([]);
});
it("removing after a claim copies to photo-archive first, commits, then deletes from photos", async () => {
  // openBreakWithLines, seedPhoto, claimLines by a buyer (sets first_claimed_at)
  expect((await removePhotoAction(p.photoId)).ok).toBe(true);
  expect(ops).toEqual(["copy:photo-archive", "copy:photo-archive", "copy:photo-archive", "remove:photos"]);
  expect(timeline.indexOf("copy:photo-archive")).toBeLessThan(timeline.indexOf("tx:begin", 2)); // copied before the removing transaction
  expect(filesIn("photo-archive")).toHaveLength(3); expect(filesIn("photos")).toEqual([]);
  expect(await rows(tx, b.id)).toMatchObject([{ id: p.photoId, bucket: "photo-archive" }]);
  expect((await rows(tx, b.id))[0].removedAt).not.toBeNull();
});
it("a failed archive copy removes nothing and answers 'Couldn't remove the photo. Try again.' (ruling 24)", async () => {
  // claimed break; failOn: (op, n) => op === "copy:photo-archive" && n === 2
  const r = await removePhotoAction(p.photoId);
  expect(r).toEqual({ ok: false, code: "INTERNAL", message: "Couldn't remove the photo. Try again." });
  expect((await rows(tx, b.id))[0]).toMatchObject({ removedAt: null, bucket: "photos" });
  expect(filesIn("photos")).toHaveLength(3);
  expect(filesIn("photo-archive")).toEqual([]);
  expect(vi.mocked(removePhoto)).not.toHaveBeenCalled();
});
it("a first claim landing between the peek and the lock: the removal rolls back, archives, then commits (ruling 24)", async () => {
  // open break, no claim; vi.mocked(peekPhoto).mockImplementationOnce(async (t, id) => {
  //   const v = await realPeekPhoto(t, id); await claimLines(tx, as(buyer), { breakId: b.id, numbers: [1], batchId: randomUUID() }); return v; })
  const r = await removePhotoAction(p.photoId);
  expect(r.ok).toBe(true);
  expect(vi.mocked(removePhoto)).toHaveBeenCalledTimes(2); // the first attempt saw archive: true with no copy and rolled back
  expect(ops).toEqual(["copy:photo-archive", "copy:photo-archive", "copy:photo-archive", "remove:photos"]);
  expect(await rows(tx, b.id)).toMatchObject([{ id: p.photoId, bucket: "photo-archive" }]);
  expect(filesIn("photo-archive")).toHaveLength(3);
});
it("the same race with a failed archive copy leaves the photo live with its files and archives nothing", async () => {
  // as above, plus failOn: (op) => op === "copy:photo-archive"
  const r = await removePhotoAction(p.photoId);
  expect(r).toEqual({ ok: false, code: "INTERNAL", message: "Couldn't remove the photo. Try again." });
  expect((await rows(tx, b.id))[0]).toMatchObject({ removedAt: null, bucket: "photos" });
  expect(filesIn("photos")).toHaveLength(3); expect(filesIn("photo-archive")).toEqual([]);
});
it("a refused removal after the archive copy removes that copy", async () => {
  // claimed break; vi.mocked(removePhoto).mockImplementationOnce(async () => { throw new NotOpen("drawing"); })
  const r = await removePhotoAction(p.photoId);
  expect(r).toMatchObject({ ok: false, code: "NOT_OPEN" });
  expect(filesIn("photo-archive")).toEqual([]); expect(filesIn("photos")).toHaveLength(3);
});
it("a removal that committed but reported a failure keeps the archive copy the row now names", async () => {
  // claimed break; vi.mocked(removePhoto).mockImplementationOnce(async (t, c, q) => { commitThenFail(); return realRemove(t, c, q); })
  const r = await removePhotoAction(p.photoId);
  expect(r.ok).toBe(true); // the re-read shows the photo removed, so the action finishes as a success
  expect(await rows(tx, b.id)).toMatchObject([{ bucket: "photo-archive" }]);
  expect(filesIn("photo-archive")).toHaveLength(3); expect(filesIn("photos")).toEqual([]);
});
it("a failed delete from photos after the commit still answers ok and leaves the archive copy", async () => {
  // claimed break; failOn: (op) => op === "remove:photos"
  expect((await removePhotoAction(p.photoId)).ok).toBe(true);
  expect((await rows(tx, b.id))[0].removedAt).not.toBeNull();
  expect(filesIn("photo-archive")).toHaveLength(3); // the stray public files are Task 11's
});
it("another host's removePhotoAction is refused and no storage call is made", async () => {
  caller = as(other, "host");
  expect(await removePhotoAction(p.photoId)).toMatchObject({ ok: false, code: "NOT_AUTHORIZED" });
  expect(ops).toEqual([]);
});
it("reorder, retag, describe and notice-seen pass their inputs to the commands and refuse malformed ones", async () => {
  expect(await reorderPhotosAction(b.id, [p1.photoId, "nope"])).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  expect(await reorderPhotosAction(b.id, [p2.photoId, p1.photoId])).toEqual({ ok: true, data: undefined });
  expect(vi.mocked(reorderPhotos).mock.calls[0][2]).toMatchObject({ breakId: b.id, order: [p2.photoId, p1.photoId] });
  expect(await describePhotoAction(p1.photoId, "")).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  expect(await describePhotoAction(p1.photoId, "x".repeat(121))).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  expect((await retagPhotoAction(p1.photoId, null)).ok).toBe(true);
  expect((await markPhotoNoticeSeenAction(b.id)).ok).toBe(true);
  expect(ops).toEqual([]);
});
```
`src/app/host/actions.test.ts` (Task 3b's `deleteDraftAction`; add these two cases to its file with the same harness,
or create the file with it):
```ts
it("deleteDraftAction sets deleted_at, removes every draft photo's variants after the commit, then redirects", async () => {
  // a draft with two seeded photos
  await expect(deleteDraftAction(b.id)).rejects.toThrow("REDIRECT:/host");
  const [row] = await tx.select({ deletedAt: breaks.deletedAt }).from(breaks).where(eq(breaks.id, b.id));
  expect(row.deletedAt).not.toBeNull();
  expect(filesIn("photos-draft")).toEqual([]);
  expect(storageInsideTx()).toEqual([]);
});
it("deleteDraftAction skips a photo with no path and still redirects", async () => {
  // vi.mocked(deleteDraft).mockImplementationOnce(async (t, c, id) => { const r = await realDeleteDraft(t, c, id); return { photos: [...r.photos, { location: "photos-draft", prefix: null }] }; })
  await expect(deleteDraftAction(b.id)).rejects.toThrow("REDIRECT:/host");
  expect(ops).toEqual(["remove:photos-draft", "remove:photos-draft"]); // one call per seeded photo, none for the null path
});
```
`src/app/b/[id]/host-actions.test.ts` (`realOpen` from `vi.importActual("@/domain/breaks/commands")`):
```ts
it("openBreakAction copies every draft photo to photos, opens, then drops the draft copies", async () => {
  // draft with two seeded photos (complete via Task 3b's form fixture)
  expect((await openBreakAction(b.id)).ok).toBe(true);
  expect(filesIn("photos")).toHaveLength(6); expect(filesIn("photos-draft")).toEqual([]);
  expect((await rows(tx, b.id)).map((r) => r.bucket)).toEqual(["photos", "photos"]);
  expect(await peekBreakStatus(tx, b.id)).toBe("open");
  expect(ops.lastIndexOf("copy:photos")).toBeLessThan(ops.indexOf("remove:photos-draft"));
  expect(storageInsideTx()).toEqual([]);
});
it("a copy failure answers 'Photos are still being prepared. Try again.', the break stays a draft, photos holds nothing", async () => {
  // failOn: (op, n) => op === "copy:photos" && n === 4
  expect(await openBreakAction(b.id)).toEqual({ ok: false, code: "PHOTOS_NOT_READY", message: "Photos are still being prepared. Try again." });
  expect(await peekBreakStatus(tx, b.id)).toBe("draft");
  expect(filesIn("photos")).toEqual([]); expect(filesIn("photos-draft")).toHaveLength(6);
});
it("an open that rolled back on an unexpected error removes the photos copies and keeps the draft copies", async () => {
  // vi.mocked(openBreak).mockImplementationOnce(async () => { throw new Error("socket closed"); })
  expect(await openBreakAction(b.id)).toMatchObject({ ok: false, code: "INTERNAL" });
  expect(await peekBreakStatus(tx, b.id)).toBe("draft");
  expect(filesIn("photos")).toEqual([]); expect(filesIn("photos-draft")).toHaveLength(6);
});
it("an open that committed but reported a failure keeps the photos copies (the re-read shows it open)", async () => {
  // vi.mocked(openBreak).mockImplementationOnce(async (t, c, id) => { commitThenFail(); return realOpen(t, c, id); })
  expect((await openBreakAction(b.id)).ok).toBe(true);
  expect(await peekBreakStatus(tx, b.id)).toBe("open");
  expect(filesIn("photos")).toHaveLength(6); expect(filesIn("photos-draft")).toEqual([]);
  expect((await rows(tx, b.id)).map((r) => r.bucket)).toEqual(["photos", "photos"]);
});
it("a refused open (a domain error) removes the photos copies", async () => {
  // vi.mocked(openBreak).mockImplementationOnce(async () => { throw new NotOpen("open"); })
  expect(await openBreakAction(b.id)).toMatchObject({ ok: false, code: "NOT_OPEN" });
  expect(filesIn("photos")).toEqual([]); expect(filesIn("photos-draft")).toHaveLength(6);
});
it("regression pin: a stranger's openBreakAction copies nothing and gets the host refusal", async () => {
  caller = as(stranger, "host");
  expect(await openBreakAction(b.id)).toMatchObject({ ok: false, code: "NOT_AUTHORIZED" });
  expect(ops).toEqual([]);
});
it("regression pin: a draft with no photo opens as before", async () => {
  expect((await openBreakAction(b.id)).ok).toBe(true);
  expect(await peekBreakStatus(tx, b.id)).toBe("open");
  expect(ops).toEqual([]);
});
it("saveBreak with intent=open on a draft with a photo copies it to photos before opening", async () => {
  // form from Task 3b's fixture with breakId = b.id and intent "open"
  await expect(saveBreak({} as ComposerState, form)).rejects.toThrow(`REDIRECT:/b/${b.id}`);
  expect(filesIn("photos")).toHaveLength(3); expect(filesIn("photos-draft")).toEqual([]);
  expect(await peekBreakStatus(tx, b.id)).toBe("open");
});
```
The two regression pins describe behaviour that already holds before this task (today's `openBreakAction` makes no
storage call and refuses a stranger); they guard what the copy must not change.

`src/photos/publish.test.ts`:
```ts
it("assertPhotosPublished throws PhotosNotReady for a live photos-draft row missing from copied", async () => {
  await expect(assertPhotosPublished(tx, b.id, new Set([p1.photoId]))).rejects.toBeInstanceOf(PhotosNotReady); // p2 seeded after the copy
});
it("assertPhotosPublished passes when every live row is copied, and ignores removed rows", async () => {
  await expect(assertPhotosPublished(tx, b.id, new Set([p1.photoId, p2.photoId]))).resolves.toBeUndefined();
  await removePhoto(tx, as(host, "host"), { photoId: p2.photoId, now: new Date() });
  await expect(assertPhotosPublished(tx, b.id, new Set([p1.photoId]))).resolves.toBeUndefined();
});
```

- [ ] **Step 13: Run them to see them fail**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/app/photos src/app/host/actions.test.ts src/app/b/\[id\]/host-actions.test.ts src/photos/publish.test.ts`
Expected: FAIL, modules or exports not found. (The files import modules that do not exist yet, so even the two
regression pins fail to load here; the behaviour they pin already holds on main.)

- [ ] **Step 14: Implement `src/photos/publish.ts`, `src/app/photos/actions.ts`, and wire the open and delete paths**

- Every action parses with `parseInput` first (`z.uuid()` ids; `order: z.array(z.uuid()).min(1).max(8)` with unique
  ids; `slot: z.uuid().nullable()`; `alt` trimmed 1–120), then `action(...)`, then `revalidatePath(`/b/${breakId}`)`
  and `revalidatePath("/host")` on success (`markPhotoNoticeSeenAction` revalidates nothing). Command `now` is `new
  Date()`.
- `requestPhotoUpload` (panel ruling 28): `r = await action((tx, c) => issueUploadTicket(tx, c, { breakId, now }))` —
  the ticket commits and the break lock is released. Then `photoStorage().createSignedUpload(r.data.incomingName)`
  outside any transaction. If signing throws: log, `db.transaction(tx => dropUploadTicket(tx, caller, ticketId))`
  (logged on failure; an unsigned ticket expires in 5 minutes anyway), and return `{ ok: false, code: "INTERNAL",
  message: "Something went wrong. Please try again." }`. Otherwise return `{ ticketId, uploadUrl: url, token }`.
- `removePhotoAction` (panel ruling 24), in this order (the only one in which no failure loses the only copy and no
  removal commits with its files outside the archive):
  1. `pre = peekPhoto` in a read transaction. If the caller is the host (or admin), the photo is live, and
     `pre.claimed`: `copyVariants(pre.prefix, pre.location → photo-archive)` with the break unlocked; `copied = true`.
     A copy failure: remove what was copied (best effort) and return `{ ok: false, code: "INTERNAL", message:
     "Couldn't remove the photo. Try again." }`; nothing has changed.
  2. `action(async (tx, c) => { const out = await removePhoto(tx, c, …); if (out.archive && !copied) throw new
     ArchiveFirst(); return out; })`. `ArchiveFirst` is a module-private `DomainError` (code `ARCHIVE_FIRST`, 409),
     so `action` maps it without logging and the transaction rolls back: the first claim landed between 1 and 2.
     On `ARCHIVE_FIRST`, and only once: copy as in 1 (same failure answer), then run 2 again. A second
     `ARCHIVE_FIRST` removes the archive copy and answers "Couldn't remove the photo. Try again.". There is no path
     that commits an archived removal without the archive copy.
  3. Any other failure with `copied`: a `DomainError` code (the transaction rolled back) → remove the archive copy
     (best effort), return the failure. `INTERNAL` (the commit may have landed) → `peekPhoto` in a fresh read: still
     live → remove the archive copy and return the failure; not live → the removal committed: continue to 4 with
     `from = pre.location` and answer ok; the re-read fails → remove nothing and return the failure.
  4. Success: `removeVariants(from)`; a failure is logged, the result is still ok. (`!archive && copied` cannot happen,
     since `first_claimed_at` is never cleared; if it does, remove the archive copy and log.)
- `deleteDraftAction` (`src/app/host/actions.ts`, Task 3b's file, panel ruling 39): between the successful
  `action(deleteDraft)` and `revalidatePath("/host")`/`redirect("/host")`, `removeVariants(storage, location, prefix)`
  for each returned photo whose `prefix` is not null, each error logged and swallowed. Nothing else in the action
  changes.
- `openBreakAction` (`src/app/b/[id]/host-actions.ts`): after `parseInput`, `const caller = await getCaller()`; when
  signed in, `copied = await publishDraftPhotos(storage, caller, id)` (a `PhotosNotReady` returns `toFailure(e)`);
  then `r = await action(async (tx, c) => { await assertHostOf(tx, c, id); await assertPhotosPublished(tx, id,
  copied.ids); await openBreak(tx, c, id); })`; then `committed = await settleOpenCopies(storage, id,
  copied.prefixes, r.ok ? null : r)`. Return `r` if it is ok; if it failed but `committed` is true (the ambiguous
  commit landed), revalidate and return `{ ok: true, data: undefined }`; else return the failure. A break with no
  draft photo has empty `prefixes`, so `settleOpenCopies` makes no storage call.
- `saveBreak` (`src/app/host/new/actions.ts`): when `parsed.open` and a break id is known (the editing id, or Task 3b's
  `newBreakId`), the same three calls around the existing transaction: `publishDraftPhotos` before it,
  `assertPhotosPublished` inside it right before `openBreak`, `settleOpenCopies` after it; a failure that
  `settleOpenCopies` proves committed redirects as a success.

- [ ] **Step 15: Run them to see them pass**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/app/photos src/app/host src/app/b/\[id\]/host-actions.test.ts src/photos src/domain/photos/peek.test.ts src/app/api/photos`
Expected: PASS.

- [ ] **Step 16: Confirm sharp is traced only into the finalise route and, if Task 10 needs it, the link preview route**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm build && grep -l "@img/sharp" $(find .next/server -name '*.nft.json') | sort`
Expected: the list contains `.next/server/app/api/photos/finalise/route.js.nft.json`, and nothing else except, once
Task 10 transcodes the preview with sharp (ruling 15, panel ruling 31), `.next/server/app/b/[id]/og/route.js.nft.json`.
In particular `.next/server/app/b/[id]/page.js.nft.json` is not listed (sharp stays out of page functions). Task 10
reruns this check with the preview route expected in the list.

- [ ] **Step 17: Gates**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:concurrency && pnpm test:ci`,
then the full e2e on `breaks_e2e`: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && /usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test:e2e`.
Expected: all clean, no warnings; the existing open-break e2e still passes with no photo.

- [ ] **Step 18: Commit**

```bash
git add src/photos src/domain/photos/peek.ts src/domain/photos/peek.test.ts \
  src/app/api/photos src/app/photos "src/app/b/[id]/host-actions.ts" "src/app/b/[id]/host-actions.test.ts" \
  src/app/host/new/actions.ts src/app/host/actions.ts src/app/host/actions.test.ts tests/helpers/photos.ts vercel.json
git commit -m "feat(photos): finalise route, photo actions, open copy and archive moves"
```

---

### Task 7a: Pure photo modules and e2e helpers (model: Sonnet)

Spec §5.1 (the client shrink), §5.3 (upload states, one automatic retry on `online`, leaving with uploads in flight),
§9 (when "Add photos" is enabled, the alt default, Undo for 8 seconds). Review Focus 4 lives here: **9 picks with 0
attached admit 8, and the 9th says why at once, as pure state before any network call; the same file picked twice is
two tiles.** This task writes no React and touches no page: every module below is a plain function over plain data,
so Tasks 7b and 7c only wire them.

**Rulings for Tasks 7a to 7c (the spec leaves them to the builder, §12):**
1. **Order invariant**: ready tiles always precede unready ones, in server order. A finished upload moves its tile to
   just after the last ready tile (the server appends it at the end). Make lead, Move earlier/later and drag act on
   ready tiles only and send `reorderPhotosAction(breakId, readyOrder)`, which is then the full live set.
2. **Unready tiles** (queued, uploading, finishing, failed) offer only Cancel (not while "finishing") and Retry (when
   failed and retryable). Tag and Describe need a ready tile. The alt text and tag when the upload starts are what
   finalise receives.
3. **Alt default**: `defaultAlt({ itemName, title })` = the tagged prize's typed name, else the form title, trimmed
   and cut to 120 characters, else "Photo of the items". A retag of a tile whose alt the host never edited in this
   session also calls `describePhotoAction` with the new default. Photos loaded from the server count as edited (their
   alt may be the host's own words), so a retag never overwrites them.
4. **Remove before any claim** goes through `removalQueue`: the tile leaves at once and "Photo removed." shows with
   Undo for 8 seconds; the removal commits when the 8 seconds end, when a second removal starts (the first commits
   first), or when the strip unmounts, and never twice. **After a claim** there is no queue: Remove asks first and
   commits at once (Task 7b).
5. **"Add photos" is enabled** once the draft can be saved (panel ruling 21): a title, a line count within the
   limits, a price, and a named top spot with its condition. The reason beside a disabled button reads "Add a title,
   a price and the top spot first."
6. **Uploads in flight** = tiles queued, uploading or finishing (a failed tile is not in flight). While any are in
   flight a `beforeunload` handler is registered, and only then.
7. **Upload transport**: `XMLHttpRequest` for the PUT (fetch has no upload progress), `FormData` with `cacheControl`
   `"3600"` and the blob as the unnamed field, header `x-upsert: false`, to the `uploadUrl` Task 6 returns (token
   already in it); then `fetch("/api/photos/finalise")`. Retryable: a network error (status 0, `error`, `timeout`),
   any 5xx, 408 and 429; every other 4xx is final.

**Files:**
- Create: `src/components/photos/strip-state.ts`, `src/components/photos/strip-state.test.ts`
- Create: `src/components/photos/shrink.ts`, `src/components/photos/shrink.test.ts`
- Create: `src/components/photos/upload-client.ts`, `src/components/photos/upload-client.test.ts`
- Create: `src/components/photos/removal-queue.ts`, `src/components/photos/removal-queue.test.ts`
- Create: `src/components/photos/unload-guard.ts`, `src/components/photos/unload-guard.test.ts`
- Modify: `e2e/helpers.ts` (`jpeg`, `composeBreakWithPhotos`)
- Create: `tests/e2e-helpers/jpeg.test.ts`

**Interfaces:**
- Consumes:
  - Task 6: `PhotoSrc` (`src/photos/urls.ts`, type only); `requestPhotoUpload`'s result shape
    `ActionResult<{ ticketId: string; uploadUrl: string; token: string }>`; `POST /api/photos/finalise` body
    `{ ticketId; slot; alt }` → `200 { photoId: string; src: PhotoSrc }` | `{ error: string }` (assembly ruling 9).
  - Task 3a: `isItemCondition` from `src/domain/breaks/condition.ts` (import-free, client-safe; assembly ruling 6).
  - Task 3b: the composer's fields `prize1`, `prize1Condition` (a `<select>`), and `composeBreak`'s condition choice.
  - `ActionResult` (`src/lib/action-result.ts`), sharp (direct dependency since Task 4).
- Produces:
  - `strip-state.ts` (pure, no DOM, no React, no `crypto`: every key comes from the caller):
    ```ts
    export type StripPhoto = { photoId: string; src: PhotoSrc; slot: string | null; alt: string };
    export type TileStatus = "queued" | "uploading" | "finishing" | "failed" | "ready";
    export type StripTile = { key: string; photoId: string | null; status: TileStatus; progress: number; preview: string | null; src: PhotoSrc | null; slot: string | null; alt: string; altEdited: boolean; error: string | null; retryable: boolean; autoRetried: boolean };
    export type StripRemoval = { tile: StripTile; index: number };
    export type StripState = { tiles: StripTile[]; notice: string | null; removal: StripRemoval | null; max: number };
    export type StripAction =
      | { type: "pick"; files: { key: string; preview: string; alt: string }[] }
      | { type: "start"; key: string } | { type: "progress"; key: string; fraction: number } | { type: "finishing"; key: string }
      | { type: "done"; key: string; photoId: string; src: PhotoSrc }
      | { type: "fail"; key: string; error: string; retryable: boolean }
      | { type: "retry"; key: string } | { type: "online" } | { type: "unreadable"; key: string }
      | { type: "cancel"; key: string }                        // an unready tile, not while finishing
      | { type: "lead"; key: string } | { type: "move"; key: string; by: -1 | 1 } | { type: "drag"; key: string; to: number }
      | { type: "order"; ids: string[] }                       // re-sync after a failed reorder
      | { type: "tag"; key: string; slot: string | null; defaultAlt: string } | { type: "alt"; key: string; alt: string }
      | { type: "slots"; valid: string[] }                     // a prize field was removed: its tags clear
      | { type: "remove"; key: string } | { type: "undo" }
      | { type: "removalDone"; photoId: string }               // clears `removal` only if it names this photo
      | { type: "removeFailed"; removal: StripRemoval; error: string } // the tile comes back at its index; notice = error
      | { type: "notice"; text: string | null };
    export function initStrip(photos: readonly StripPhoto[], max: number): StripState; // ready tiles, key = photoId, altEdited true
    export function stripReducer(s: StripState, a: StripAction): StripState;           // returns `s` itself for a no-op
    export function nextToStart(s: StripState, limit?: number): string[]; // queued keys to start; limit 2 (uploading + finishing count)
    export function uploadsInFlight(s: StripState): number;              // queued + uploading + finishing
    export function readyIds(s: StripState): string[];                   // photoIds of ready tiles, in order
    export function defaultAlt(p: { itemName: string | null; title: string }): string; // 1 to 120 characters
    export type AddGate = { title: string; lineCount: number; price: string; maxLines: number; topSpot: { name: string; condition: string } | null };
    export function canAddPhotos(f: AddGate): boolean;
    export const UNREADABLE_NOTICE = "This photo can't be read here. Pick a JPEG or PNG.";
    export const NEED_FORM_NOTICE = "Add a title, a price and the top spot first.";
    export function limitNotice(notAdded: number): string; // "Photos are limited to 8 per break. 1 photo was not added." / "… 2 photos were not added."
    ```
  - `shrink.ts`: `shrinkForUpload(file: File): Promise<Blob>`, `class CannotRead extends Error` (message
    `UNREADABLE_NOTICE`), `fitWithin(w: number, h: number, maxEdge?: number): { width: number; height: number }`,
    `MAX_EDGE = 2048`, `JPEG_QUALITY = 0.85`.
  - `upload-client.ts`:
    ```ts
    export type RequestUpload = (breakId: string) => Promise<ActionResult<{ ticketId: string; uploadUrl: string; token: string }>>;
    export class UploadError extends Error { constructor(message: string, readonly retryable: boolean) }
    export const NETWORK_FAILED = "The upload didn't finish. Check your connection.";
    export const UPLOAD_REFUSED = "This photo couldn't be uploaded. Pick it again.";
    export function isRetryableStatus(status: number): boolean; // 0, 408, 429, 500–599
    export function uploadPhoto(p: { breakId: string; blob: Blob; slot: string | null; alt: string; signal: AbortSignal; request: RequestUpload; onProgress(fraction: number): void; onFinishing(): void }): Promise<{ photoId: string; src: PhotoSrc }>;
    // throws UploadError, or the signal's AbortError when cancelled
    ```
  - `removal-queue.ts`:
    ```ts
    export const UNDO_MS = 8000;
    export type Schedule = (run: () => void, ms: number) => () => void; // returns a cancel
    export const timers: Schedule;                                     // setTimeout / clearTimeout
    export type RemovalQueue<T> = { remove(item: T): void; undo(): T | null; flush(): void; pending(): T | null };
    export function removalQueue<T>(commit: (item: T) => void, schedule: Schedule): RemovalQueue<T>;
    ```
  - `unload-guard.ts`: `guardUnload(target: Pick<Window, "addEventListener" | "removeEventListener">, active: boolean): () => void`
    (adds one `beforeunload` handler when `active`, returns the cleanup that removes that same handler; inactive adds
    nothing and returns a no-op).
  - `e2e/helpers.ts`: `jpeg(n: number): Promise<Buffer>` (a distinct solid 800 × 600 JPEG per `n`, deterministic) and
    `composeBreakWithPhotos(page: Page, o: { title: string; photos: number; lineCount?: number; price?: string; intent?: "open" | "draft" }): Promise<string>`.

- [ ] **Step 1: Write the failing reducer tests**

`src/components/photos/strip-state.test.ts`, with these helpers at the top:

```ts
const src = (id: string): PhotoSrc => ({ src: `https://x.test/${id}-160.webp`, srcSet: `https://x.test/${id}-160.webp 160w`, width: 160, height: 120, alt: id });
const photo = (id: string, o: Partial<StripPhoto> = {}): StripPhoto => ({ photoId: id, src: src(id), slot: null, alt: `Alt ${id}`, ...o });
const files = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ key: `k${from + i}`, preview: `blob:${from + i}`, alt: "Strip break" }));
const run = (s: StripState, ...as: StripAction[]) => as.reduce(stripReducer, s);
const keys = (s: StripState) => s.tiles.map((t) => t.key);
const statuses = (s: StripState) => s.tiles.map((t) => t.status);
const ready3 = () => initStrip([photo("a"), photo("b"), photo("c")], 8);
```

```ts
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
    expect(run(base, { type: "lead", key: "k0" })).toBe(base);       // an unready tile cannot lead
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
    const t = run(s, { type: "remove", key: "a" });               // a second removal replaces the record
    expect(t.removal).toEqual({ tile: base.tiles[0], index: 0 });
    expect(run(t, { type: "removalDone", photoId: "b" }).removal).toEqual(t.removal);
  });
  it("removeFailed puts the tile back at its index and shows the error", () => {
    const base = ready3();
    const s = run(base, { type: "remove", key: "b" });
    const f = run(s, { type: "removeFailed", removal: s.removal!, error: "Couldn't remove the photo. Try again." });
    expect(keys(f)).toEqual(["a", "b", "c"]);
    expect(f.removal).toBeNull();
    expect(f.notice).toBe("Couldn't remove the photo. Try again.");
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
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec vitest run src/components/photos/strip-state.test.ts`
Expected: FAIL, `Failed to resolve import "./strip-state"`.

- [ ] **Step 3: Implement `strip-state.ts`** (signatures in Interfaces)

`pick` admits `max - tiles.length` files (every tile counts) and sets `notice` to `limitNotice(refused)` when any were
refused, else `null`. `done` sets `ready`, stores `photoId` and `src`, and moves the tile to just after the last ready
tile. `lead`/`move`/`drag` on an unready key, or a move past either end of the ready run, return `s`. `canAddPhotos`
reads the price as `parseComposer` does (strip `$`, `,` and spaces; a finite number from 0.01 to 10,000) and the
condition with `isItemCondition` from `@/domain/breaks/condition`.

- [ ] **Step 4: Run to verify pass**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec vitest run src/components/photos/strip-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing shrink tests**

`src/components/photos/shrink.test.ts`. A `setup(o)` helper stubs `createImageBitmap` (resolving `bitmap = { width:
o.w, height: o.h, close: vi.fn() }`) and `document` (`createElement("canvas")` returns `canvas = { width: 0, height:
0, getContext: () => ({ drawImage }), toBlob }`, where `toBlob = vi.fn((cb) => cb(o.blob === undefined ? new
Blob(["j"], { type: "image/jpeg" }) : o.blob))`) with `vi.stubGlobal`; `afterEach(() => vi.unstubAllGlobals())`.

```ts
it("fitWithin shrinks the long edge to 2048 and never upscales", () => {
  expect(fitWithin(4000, 3000)).toEqual({ width: 2048, height: 1536 });
  expect(fitWithin(3000, 4000)).toEqual({ width: 1536, height: 2048 });
  expect(fitWithin(1000, 500)).toEqual({ width: 1000, height: 500 });
  expect(fitWithin(10000, 1000)).toEqual({ width: 2048, height: 205 });
  expect(MAX_EDGE).toBe(2048); expect(JPEG_QUALITY).toBe(0.85);
});
it("decodes with the orientation applied, draws at the fitted size and encodes JPEG at 0.85", async () => {
  const { bitmap, canvas, drawImage, toBlob } = setup({ w: 4000, h: 3000 });
  const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
  const out = await shrinkForUpload(file);
  expect(createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: "from-image" });
  expect([canvas.width, canvas.height]).toEqual([2048, 1536]);
  expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2048, 1536);
  expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.85);
  expect(bitmap.close).toHaveBeenCalledTimes(1);
  expect(out.type).toBe("image/jpeg");
});
it("a small photo is drawn at its own size", async () => {
  const { drawImage, bitmap } = setup({ w: 1000, h: 500 });
  await shrinkForUpload(new File(["x"], "a.png", { type: "image/png" }));
  expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1000, 500);
});
it("an undecodable file throws CannotRead whose message is the spec's sentence", async () => {
  vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("x")));
  const p = shrinkForUpload(new File(["x"], "a.heic"));
  await expect(p).rejects.toThrow(CannotRead);
  await expect(shrinkForUpload(new File(["x"], "a.heic"))).rejects.toThrow("This photo can't be read here. Pick a JPEG or PNG.");
});
it("a canvas that yields no blob is also CannotRead, and the bitmap is still closed", async () => {
  const { bitmap } = setup({ w: 800, h: 600, blob: null });
  await expect(shrinkForUpload(new File(["x"], "a.jpg"))).rejects.toThrow(CannotRead);
  expect(bitmap.close).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 6: Run to verify failure**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec vitest run src/components/photos/shrink.test.ts`
Expected: FAIL, `Failed to resolve import "./shrink"`.

- [ ] **Step 7: Implement `shrink.ts`, then run**

`createImageBitmap(file, { imageOrientation: "from-image" })` (a rejection becomes `CannotRead`), a canvas element sized
`fitWithin(...)`, `drawImage`, `toBlob(cb, "image/jpeg", 0.85)` (a null blob becomes `CannotRead`), `bitmap.close()` in
a `finally`. `CannotRead`'s message is `UNREADABLE_NOTICE` (imported from `./strip-state`).
Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec vitest run src/components/photos/shrink.test.ts`
Expected: PASS.

- [ ] **Step 8: Write the failing upload-client tests**

`src/components/photos/upload-client.test.ts`, with a stubbed XHR (installed by `vi.stubGlobal("XMLHttpRequest",
FakeXHR)` and a stubbed `fetch` per test; the implementation listens with `addEventListener`, never `onload`):

```ts
class FakeXHR {
  static last: FakeXHR | undefined;
  upload = new EventTarget(); status = 0; method = ""; url = ""; headers: Record<string, string> = {}; body: unknown; aborted = false;
  private events = new EventTarget();
  constructor() { FakeXHR.last = this; }
  open(m: string, u: string) { this.method = m; this.url = u; }
  setRequestHeader(k: string, v: string) { this.headers[k] = v; }
  send(b: unknown) { this.body = b; }
  abort() { this.aborted = true; this.events.dispatchEvent(new Event("abort")); }
  addEventListener(t: string, f: EventListener) { this.events.addEventListener(t, f); }
  removeEventListener(t: string, f: EventListener) { this.events.removeEventListener(t, f); }
  progress(loaded: number, total: number) { this.upload.dispatchEvent(Object.assign(new Event("progress"), { loaded, total, lengthComputable: true })); }
  respond(status: number) { this.status = status; this.events.dispatchEvent(new Event("load")); }
  fail() { this.events.dispatchEvent(new Event("error")); }
}
const ticket = { ok: true as const, data: { ticketId: "t1", uploadUrl: "http://127.0.0.1:54321/storage/v1/object/upload/sign/incoming/n.jpg?token=abc", token: "abc" } };
const psrc: PhotoSrc = { src: "https://x.test/p-160.webp", srcSet: "https://x.test/p-160.webp 160w", width: 160, height: 120, alt: "A" };
const start = (o: Partial<Parameters<typeof uploadPhoto>[0]> = {}) => {
  const onProgress = vi.fn(); const onFinishing = vi.fn(); const ctrl = new AbortController();
  const p = uploadPhoto({ breakId: "b1", blob: new Blob(["j"], { type: "image/jpeg" }), slot: "s1", alt: "A", signal: ctrl.signal, request: vi.fn().mockResolvedValue(ticket), onProgress, onFinishing, ...o });
  return { p, onProgress, onFinishing, ctrl };
};
const xhr = async () => { await vi.waitFor(() => expect(FakeXHR.last).toBeDefined()); return FakeXHR.last!; };
beforeEach(() => { FakeXHR.last = undefined; vi.stubGlobal("XMLHttpRequest", FakeXHR); });
afterEach(() => vi.unstubAllGlobals());

it("isRetryableStatus: network, 408, 429 and 5xx retry; other 4xx are final", () => {
  for (const s of [0, 408, 429, 500, 502, 503, 504]) expect(isRetryableStatus(s)).toBe(true);
  for (const s of [400, 401, 403, 404, 409, 410, 413, 415, 422]) expect(isRetryableStatus(s)).toBe(false);
});
it("the happy path: PUT with progress, then finalise, then the photo", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ photoId: "p1", src: psrc }), { status: 200 })));
  const { p, onProgress, onFinishing } = start();
  const x = await xhr();
  expect([x.method, x.url]).toEqual(["PUT", ticket.data.uploadUrl]);
  expect(x.headers["x-upsert"]).toBe("false");
  expect((x.body as FormData).get("cacheControl")).toBe("3600");
  expect((x.body as FormData).get("")).toBeInstanceOf(Blob);
  x.progress(50, 100); expect(onProgress).toHaveBeenLastCalledWith(0.5);
  x.respond(200);
  await expect(p).resolves.toEqual({ photoId: "p1", src: psrc });
  expect(onFinishing).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("/api/photos/finalise", expect.objectContaining({ method: "POST", body: JSON.stringify({ ticketId: "t1", slot: "s1", alt: "A" }) }));
});
it.each([
  ["a network error", (x: FakeXHR) => x.fail()],
  ["500", (x: FakeXHR) => x.respond(500)],
  ["503", (x: FakeXHR) => x.respond(503)],
  ["408", (x: FakeXHR) => x.respond(408)],
  ["429", (x: FakeXHR) => x.respond(429)],
])("%s on the PUT is retryable, with the connection sentence", async (_, act) => {
  const { p } = start(); act(await xhr());
  await expect(p).rejects.toBeInstanceOf(UploadError);
  await expect(p).rejects.toMatchObject({ retryable: true, message: "The upload didn't finish. Check your connection." });
});
it.each([400, 403, 413])("%i on the PUT is final", async (status) => {
  const { p } = start(); (await xhr()).respond(status);
  await expect(p).rejects.toMatchObject({ retryable: false, message: "This photo couldn't be uploaded. Pick it again." });
});
it("finalise: a rejected fetch, a 502 and a 429 are retryable; a 410 is final with the server's sentence", async () => {
  const cases: [() => Promise<Response>, boolean, string][] = [
    [() => Promise.reject(new TypeError("Failed to fetch")), true, NETWORK_FAILED],
    [async () => new Response("{}", { status: 502 }), true, NETWORK_FAILED],
    [async () => new Response(JSON.stringify({ error: "Slow down" }), { status: 429 }), true, NETWORK_FAILED],
    [async () => new Response(JSON.stringify({ error: "This upload took too long. Try again." }), { status: 410 }), false, "This upload took too long. Try again."],
  ];
  for (const [res, retryable, message] of cases) {
    FakeXHR.last = undefined; vi.stubGlobal("fetch", vi.fn(res));
    const { p } = start(); (await xhr()).respond(200);
    await expect(p).rejects.toMatchObject({ retryable, message });
  }
});
it("a refused ticket is final with its message, and nothing is uploaded", async () => {
  const { p } = start({ request: vi.fn().mockResolvedValue({ ok: false, code: "NOT_FOUND", message: "This break could not be found." }) });
  await expect(p).rejects.toMatchObject({ retryable: false, message: "This break could not be found." });
  expect(FakeXHR.last).toBeUndefined();
});
it("a ticket request that throws (offline) is retryable", async () => {
  const { p } = start({ request: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) });
  await expect(p).rejects.toMatchObject({ retryable: true, message: NETWORK_FAILED });
});
it("Cancel aborts the PUT and rejects with AbortError, not UploadError", async () => {
  const { p, ctrl } = start(); const x = await xhr();
  ctrl.abort();
  await expect(p).rejects.toMatchObject({ name: "AbortError" });
  expect(x.aborted).toBe(true);
});
```

- [ ] **Step 9: Run to verify failure, implement `upload-client.ts`, run again**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec vitest run src/components/photos/upload-client.test.ts`
Expected: FAIL, `Failed to resolve import "./upload-client"`. Implement per ruling 7: `request(breakId)` (a throw is
`UploadError(NETWORK_FAILED, true)`, `ok: false` is `UploadError(message, false)`), the PUT through `XMLHttpRequest`
(`signal` aborts it), `onFinishing()` after a 2xx, then the finalise `fetch` (its `error` field is the message of a
final failure; a retryable status always reads `NETWORK_FAILED`). Run again. Expected: PASS.

- [ ] **Step 10: Write the failing removal-queue and unload-guard tests**

`src/components/photos/removal-queue.test.ts`:

```ts
beforeEach(() => vi.useFakeTimers()); afterEach(() => vi.useRealTimers());

it("schedules exactly 8 seconds", () => {
  const schedule = vi.fn<Schedule>(() => () => {});
  removalQueue(vi.fn(), schedule).remove("a");
  expect(UNDO_MS).toBe(8000);
  expect(schedule).toHaveBeenCalledWith(expect.any(Function), 8000);
});
it("the timer firing commits once", () => {
  const commit = vi.fn(); const q = removalQueue(commit, timers);
  q.remove("a");
  vi.advanceTimersByTime(7999); expect(commit).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(commit.mock.calls).toEqual([["a"]]);
  expect(q.pending()).toBeNull();
  vi.advanceTimersByTime(60_000); q.flush();
  expect(commit).toHaveBeenCalledTimes(1);
});
it("a second removal commits the first at once, then waits its own 8 seconds; the first never commits again", () => {
  const commit = vi.fn(); const q = removalQueue(commit, timers);
  q.remove("a"); vi.advanceTimersByTime(3000); q.remove("b");
  expect(commit.mock.calls).toEqual([["a"]]);
  expect(q.pending()).toBe("b");
  vi.advanceTimersByTime(8000);
  expect(commit.mock.calls).toEqual([["a"], ["b"]]);
  vi.advanceTimersByTime(8000);
  expect(commit).toHaveBeenCalledTimes(2);
});
it("unmount (flush) commits the pending removal once and cancels its timer", () => {
  const commit = vi.fn(); const q = removalQueue(commit, timers);
  q.remove("a"); q.flush(); q.flush(); vi.advanceTimersByTime(8000);
  expect(commit.mock.calls).toEqual([["a"]]);
});
it("undo returns the item, commits nothing and cancels the timer", () => {
  const commit = vi.fn(); const q = removalQueue(commit, timers);
  q.remove("a");
  expect(q.undo()).toBe("a");
  vi.advanceTimersByTime(8000); q.flush();
  expect(commit).not.toHaveBeenCalled();
  expect(q.undo()).toBeNull();
});
```

`src/components/photos/unload-guard.test.ts`:

```ts
const target = () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() });
it("adds one beforeunload handler while uploads are in flight, and the cleanup removes that same handler", () => {
  const t = target(); const stop = guardUnload(t, true);
  expect(t.addEventListener).toHaveBeenCalledTimes(1);
  const [type, handler] = t.addEventListener.mock.calls[0];
  expect(type).toBe("beforeunload");
  const e = { preventDefault: vi.fn(), returnValue: undefined as unknown };
  handler(e);
  expect(e.preventDefault).toHaveBeenCalledTimes(1); expect(e.returnValue).toBe("");
  stop();
  expect(t.removeEventListener).toHaveBeenCalledWith("beforeunload", handler);
});
it("adds nothing when nothing is in flight", () => {
  const t = target(); guardUnload(t, false)();
  expect(t.addEventListener).not.toHaveBeenCalled(); expect(t.removeEventListener).not.toHaveBeenCalled();
});
```

- [ ] **Step 11: Run to verify failure, implement both, run again**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec vitest run src/components/photos/removal-queue.test.ts src/components/photos/unload-guard.test.ts`
Expected: FAIL (modules missing). Implement: `removalQueue` holds one `{ item, cancel }`; `remove` commits and clears a
pending item first, then schedules; the scheduled run clears the slot before committing; `flush` cancels and commits;
`undo` cancels and returns. `timers = (run, ms) => { const t = setTimeout(run, ms); return () => clearTimeout(t); }`.
Run again. Expected: PASS.

- [ ] **Step 12: Write the failing `jpeg` test, then add the e2e helpers**

`tests/e2e-helpers/jpeg.test.ts` (vitest; `e2e/helpers.ts` imports Playwright types only, so it loads here):

```ts
import sharp from "sharp";
import { jpeg } from "../../e2e/helpers";

it("jpeg(n) is an 800 × 600 JPEG, the same for the same n and different across n", async () => {
  const a = await jpeg(1); const b = await jpeg(2);
  expect(await sharp(a).metadata()).toMatchObject({ format: "jpeg", width: 800, height: 600 });
  expect((await jpeg(1)).equals(a)).toBe(true);
  expect(a.equals(b)).toBe(false);
});
```

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec vitest run tests/e2e-helpers/jpeg.test.ts`
Expected: FAIL (`jpeg` is not exported). Then in `e2e/helpers.ts` add `jpeg(n)` (sharp `create` with a solid colour
derived from `n`, e.g. `{ r: (n * 53) % 256, g: (n * 97) % 256, b: (n * 151) % 256 }`, `.jpeg({ quality: 80 })`) and:

```ts
/** /host/new filled (title, top spot and its condition, handle, lines, price), `photos` JPEGs attached through the
 *  strip and waited for until ready, then Open break (or Save draft); returns the break's URL. */
export async function composeBreakWithPhotos(page: Page, o: { title: string; photos: number; lineCount?: number; price?: string; intent?: "open" | "draft" }): Promise<string>;
```

It fills the fields as `composeBreak` does, including `page.selectOption("select[name=prize1Condition]",
"new_in_box")` **before** attaching photos (ruling 5), then `setInputFiles` on `getByTestId("photo-input")` with
`{ name: \`p${i}.jpg\`, mimeType: "image/jpeg", buffer: await jpeg(i) }` for `i` in `1..photos`, waits until
`getByTestId("photo-tile").and(page.locator("[data-status=ready]"))` has count `photos`, clicks `composer-open` (or
`composer-draft`), and `waitForURL(/\/b\/[0-9a-f-]{36}$/)`. Run the vitest file again. Expected: PASS.
`composeBreakWithPhotos` needs the strip, so its behaviour is tested by Task 7b's first e2e test; here it is
type-checked only (`pnpm exec tsc --noEmit` covers `e2e/`).

- [ ] **Step 13: Gates and commit**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec tsc --noEmit && pnpm lint && pnpm test`
(sandbox off). Expected: all green, no warnings. The copy audit (`src/lib/copy-audit.test.ts`, run by `pnpm test`)
passes with the new strings.

```bash
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH
git add src/components/photos e2e/helpers.ts tests/e2e-helpers/jpeg.test.ts
git commit -m "feat(photos): strip state, client shrink, upload client and removal queue"
```

**Reviewer: Opus.** Focus: (a) Review Focus 4 holds in the reducer: 9 picks, 6 attached + 3, a full break, the same
file twice; (b) `canAddPhotos` matches `parseComposer` for price and lines and requires the top spot's name and
condition; (c) `removalQueue` commits each item exactly once across timer, second removal and flush; (d) retry
classification matches ruling 7 for the PUT and for finalise; (e) no `crypto`, DOM or React in `strip-state.ts`.

---

### Task 7b: Photo strip and composer wiring (model: Sonnet)

Spec §5.3 (tile states), §9 (the strip, its menu, the hints, the composer's id, the address change). Builds the
client strip on Task 7a's modules and puts it in the composer.

**Rulings for this task** (in addition to Task 7a's):
1. **The tile menu is an inline options panel**, not a dialog. Each tile has a 44 px "Options for photo N" button
   (`aria-expanded`) that opens one panel under the grid, labelled "Photo N options", with the spec §9 items "Make
   lead", "Tag", "Describe", "Move earlier", "Move later", "Remove". Reason: the strip also lives inside
   the "Edit photos" `Sheet` (Task 7c), and `Sheet` resets the page scroll lock when it closes, so a nested sheet would
   unlock the outer one.
2. **The draft** (panel ruling 22): the strip's break id is `initial.newBreakId ?? initial.breakId`, the server's id
   from Task 3b's `ComposerInitial`; no client `crypto.randomUUID`, so server and client render the same id (no
   hydration mismatch). For a new break the first photo calls `ensureDraft()` (once, memoised; a failure clears the
   memo so Retry tries again), which saves the form as a draft through `ensureDraftAction` and then calls Task 3b's
   `moveToEditAddress(id)`. Never `history.replaceState(null, …)`: the App Router keeps its entry in `history.state`.
   A Save pressed meanwhile, or a reload, lands on the same draft (Task 3a's idempotent `createDraft`).
3. **Upload states on the tile**: a progress ring (`role="progressbar"`, `aria-label="Uploading photo N"`,
   `aria-valuenow` 0–100), "Finishing…" (the ellipsis character), the failed state with its reason and "Retry" when
   retryable. Neither Save draft nor Open break is ever disabled by uploads.
4. **Uploads in flight**: `useEffect(() => guardUnload(window, inFlight > 0), [inFlight > 0])`, and the banner line
   "Photos are still uploading. Stay on this page until they finish." (`role="status"`) while `inFlight > 0`.
5. **Remove**: before a claim (`claimed: false`) through Task 7a's `removalQueue` (`timers`), whose commit calls
   `removePhotoAction` and dispatches `removalDone` or `removeFailed`; the Undo line reads "Photo removed." with "Undo"
   (`role="status"`, polite) and is cleared by `removalDone`; the queue is flushed on unmount. After a claim
   (`claimed: true`) the panel's Remove becomes the question "Buyers in this break will still see this photo, marked
   Removed." with "Remove photo" and "Keep photo"; "Remove photo" dispatches `remove` and commits at once, with no Undo
   line (ruling 24: a failure brings the tile back with "Couldn't remove the photo. Try again.").
6. **Drag**: pointer events on a grip (`data-testid="photo-grip"`, `aria-hidden`, `touch-action: none` on the grip
   only, so the page still scrolls), hit-testing tiles with `document.elementFromPoint`, committed on `pointerup` as one
   `drag` action and one `reorderPhotosAction`. Move earlier/later are the keyboard path and are `aria-disabled` at the
   ends. A failed reorder dispatches `order` with the last saved order and shows the error.

**Files:**
- Create: `src/components/photos/photo-strip.tsx`, `src/components/photos/strip-tile.tsx`,
  `src/components/photos/photo-strip.test.ts`
- Create: `src/photos/strip-data.ts`, `src/photos/strip-data.test.ts`
- Create: `src/app/host/new/ensure-draft.test.ts`
- Modify: `src/app/host/new/form.tsx` (title becomes controlled; the Photos fieldset; the no-photo line),
  `src/app/host/new/actions.ts` (`ensureDraftAction`), `src/app/host/new/initial.ts` (`photos`),
  `src/app/host/new/page.tsx`, `src/app/host/[id]/edit/page.tsx` (load photos; pass `MAX_PHOTOS`)
- Create: `e2e/photo-strip.spec.ts`

**Interfaces:**
- Consumes:
  - Task 7a: everything in its Produces block; `jpeg`, `composeBreakWithPhotos` (`e2e/helpers.ts`).
  - Task 6: `requestPhotoUpload`, `removePhotoAction`, `reorderPhotosAction`, `retagPhotoAction`,
    `describePhotoAction` (`src/app/photos/actions.ts`); `photoSrc(storage, v, size)`, `PhotoSrc`
    (`src/photos/urls.ts`); `photoStorage()`; the test harness of Task 6 (mocked `@/db/client`, `@/auth/session`,
    `next/cache`).
  - Task 5: `breakPhotos(tx, breakId, viewer)`, `PhotoView`, `MAX_PHOTOS` (passed in as the `max` prop by the server
    pages; client files import no domain values except the import-free `condition.ts`).
  - Task 3a: `createDraft(tx, caller, input, { breakId })` (idempotent for the same host).
  - Task 3b: `ComposerInitial.newBreakId`/`.breakId`; the `PrizeRow[]` state (`choices`) and `second` of
    `ComposerForm`; `moveToEditAddress(breakId)` (`src/app/host/new/draft-address.ts`); field names `newBreakId`,
    `prize1Slot`, `prize1Condition`, `prize2Slot`, `prize2Condition`.
  - `Button` (`src/components/button.tsx`), `ActionResult` (`src/lib/action-result.ts`), `action`
    (`src/lib/action.ts`).
- Produces:
  - `photo-strip.tsx`:
    ```ts
    export type StripPrize = { slot: string; label: string; itemName: string | null }; // label: typed name, else "Top spot" / "2nd place"
    export type EnsureDraft = () => Promise<{ ok: true } | { ok: false; message: string }>;
    export type PhotoStripProps = {
      breakId: string; initial: StripPhoto[]; prizes: StripPrize[]; title: string; max: number;
      canAdd: boolean;                 // composer: canAddPhotos(form); the sheet: true
      claimed: boolean;                // breaks.first_claimed_at is set
      ensureDraft?: EnsureDraft;       // composer, new break only
      onCount?: (live: number) => void;
      onChange?: () => void;           // any committed action (Task 7c refreshes on close)
    };
    export function PhotoStrip(p: PhotoStripProps): React.ReactElement;
    ```
  - `src/app/host/new/actions.ts`: `ensureDraftAction(form: FormData): Promise<ActionResult<{ breakId: string }>>`.
  - `src/photos/strip-data.ts`: `toStripPhotos(storage: PhotoStorage, live: readonly PhotoView[]): Promise<StripPhoto[]>`
    (160 px `photoSrc`; signed for draft photos).
  - `ComposerInitial.photos: StripPhoto[]` (empty for a new break); `ComposerForm` gains `maxPhotos: number`.
  - Test ids: `photo-strip`, `photo-input` (the hidden file input), `photo-add`, `photo-count`, `photo-notice`,
    `photo-tile` (with `data-status` and `data-photo-id`), `photo-grip`, `photo-options-<n>`, `photo-undo`,
    `photo-uploading-banner`.

- [ ] **Step 1: Write the failing strip render tests**

`src/components/photos/photo-strip.test.ts` (`renderToStaticMarkup(createElement(PhotoStrip, props))` as `html(p)`;
`ok`: 2 initial photos `a` and `b` with `alt` "Alt a"/"Alt b", `prizes: [{ slot: "s1", label: "Chronos 22g", itemName:
"Chronos 22g" }]`, `max: 8`, `canAdd: true`, `claimed: false`, `breakId: "b1"`, `title: "Strip break"`):

```ts
it("disables Add photos with the reason beside it until the draft can be saved", () => {
  const h = html({ ...ok, initial: [], canAdd: false });
  expect(h).toMatch(/<button[^>]*disabled[^>]*>Add photos<\/button>/);
  expect(h).toContain("Add a title, a price and the top spot first.");
});
it("enabled once valid: no reason text", () => {
  const h = html({ ...ok, initial: [], canAdd: true });
  expect(h).not.toMatch(/<button[^>]*disabled[^>]*>Add photos/);
  expect(h).not.toContain("Add a title, a price and the top spot first.");
});
it("carries the hint and the count", () => {
  expect(html(ok)).toContain("Photos of the items. Rules and specs go in the description.");
  expect(html(ok)).toMatch(/data-testid="photo-count"[^>]*>2 of 8 photos</);
});
it("tiles in order, the first marked Lead, each ready and with a named options button", () => {
  const h = html(ok);
  expect(h.match(/data-testid="photo-tile"/g)).toHaveLength(2);
  expect(h.match(/data-status="ready"/g)).toHaveLength(2);
  expect(h.indexOf('data-photo-id="a"')).toBeLessThan(h.indexOf('data-photo-id="b"'));
  expect(h.indexOf(">Lead<")).toBeLessThan(h.indexOf('aria-label="Options for photo 2"'));
  expect(h.match(/>Lead</g)).toHaveLength(1);
  expect(h).toContain('aria-label="Options for photo 1"');
  expect(h).toContain('alt="Alt a"');
});
it("the file input accepts JPEG, PNG, WebP and HEIC, multiple", () => {
  const input = html(ok).match(/<input[^>]*data-testid="photo-input"[^>]*>/)![0];
  expect(input).toContain('type="file"'); expect(input).toContain("multiple");
  for (const t of ["image/jpeg", "image/png", "image/webp", "image/heic"]) expect(input).toContain(t);
});
it("renders no uploading banner and no Undo line when nothing is pending", () => {
  const h = html(ok);
  expect(h).not.toContain("Photos are still uploading.");
  expect(h).not.toContain('data-testid="photo-undo"');
});
```

`src/photos/strip-data.test.ts` (with `createMemoryStorage()`):

```ts
it("a public photo gets plain URLs, a draft photo a signed one, in live order with slot and alt", async () => {
  const s = createMemoryStorage();
  const out = await toStripPhotos(s, [view({ id: "p1", location: "photos", slot: "s1", alt: "Lead" }), view({ id: "p2", location: "photos-draft" })]);
  expect(out.map((p) => [p.photoId, p.slot, p.alt])).toEqual([["p1", "s1", "Lead"], ["p2", null, "Darts"]]);
  expect(out[0].src.src).toMatch(/\/photos\/.*-160\.webp$/);
  expect(out[1].src.src).toMatch(/token=/);
});
```

(`view(o)` builds a `PhotoView` with a valid prefix, width 1600, height 1200, alt "Darts".)

- [ ] **Step 2: Write the failing `ensureDraftAction` test**

`src/app/host/new/ensure-draft.test.ts`, with Task 6's harness (mocked `@/db/client`, `@/auth/session` with a host
caller, `next/cache`) and `next/navigation`'s `redirect` mocked as `vi.fn()`. `form(o)` builds a valid composer
`FormData` (title, `prize1` "Chronos 22g", `prize1Slot` a fixed uuid, `prize1Condition` "new_in_box", `lineCount` 10,
`linePrice` "5", `newBreakId` `ID`) with **no** Venmo, PayPal or instructions and no `intent`:

```ts
it("saves a draft under newBreakId without a payment handle and without redirecting", async () => {
  const r = await ensureDraftAction(form());
  expect(r).toEqual({ ok: true, data: { breakId: ID } });
  expect(redirect).not.toHaveBeenCalled();
  const [b] = await tx.select().from(breaks).where(eq(breaks.id, ID));
  expect(b).toMatchObject({ status: "draft", title: "Strip break", hostId: caller.id });
});
it("a second call with the same id saves the latest form into the same draft", async () => {
  await ensureDraftAction(form());
  expect(await ensureDraftAction(form({ title: "Renamed" }))).toEqual({ ok: true, data: { breakId: ID } });
  const rows = await tx.select().from(breaks).where(eq(breaks.id, ID));
  expect(rows).toHaveLength(1); expect(rows[0].title).toBe("Renamed");
});
it("a form that cannot be saved answers the parser's sentence", async () => {
  expect(await ensureDraftAction(form({ prize1Condition: "" }))).toMatchObject({ ok: false, message: "Chronos 22g: choose its condition" });
});
it("a missing or malformed newBreakId is the stale-form error", async () => {
  expect(await ensureDraftAction(form({ newBreakId: "x" }))).toMatchObject({ ok: false, message: "This form is out of date. Reload the page and try again." });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec vitest run src/components/photos/photo-strip.test.ts src/photos/strip-data.test.ts src/app/host/new/ensure-draft.test.ts`
Expected: FAIL (modules and `ensureDraftAction` missing).

- [ ] **Step 4: Implement the strip, its tile, `toStripPhotos` and `ensureDraftAction`**

`photo-strip.tsx` owns `useReducer(stripReducer, initStrip(initial, max))`, an effect that starts `nextToStart(state)`
tiles, and the side effects the reducer does not do. Per started tile: `await ensureDraft?.()` (a failure fails every
queued tile with its message, `retryable: true`), `shrinkForUpload` (`CannotRead` dispatches `unreadable`), then
`uploadPhoto({ …, request: requestPhotoUpload })` feeding `progress`/`finishing`/`done`/`fail`; an `AbortController`
per tile for Cancel. A `window` `online` listener dispatches `online`. Rulings 4 to 6 for unload, Remove and drag.
Tag calls `retagPhotoAction` and, when the tile's alt was never edited, `describePhotoAction` with
`defaultAlt({ itemName: prize.itemName, title })`; Describe validates 1–120 characters before `describePhotoAction`.
Every committed action calls `onChange`; `onCount` receives the number of ready tiles. Picked files get keys from a
counter ref and `URL.createObjectURL` previews (revoked when the tile is ready or dropped), and the alt
`defaultAlt({ itemName: null, title })`.
Tile (`strip-tile.tsx`): a `data-testid="photo-tile"` square with `data-status` and `data-photo-id` (about 114 px at
390 in a 3-column grid, `border-wire-strong`, no mat), the image with `alt={tile.alt}`, "Lead" on the first, the grip,
ruling 3's states, and the options button.
`toStripPhotos` maps `photoSrc(storage, v, 160)` over `live` in parallel.
`ensureDraftAction` (in `actions.ts`): copy the form, `set("intent", "draft")` (a draft needs no payment handle),
`parseComposer`; `newBreakId` must be a uuid (else the stale-form sentence); `action((tx, c) => createDraft(tx, c,
parsed.input, { breakId }))`; `revalidatePath("/host")`; return `{ ok: true, data: { breakId } }`; no redirect.
Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec vitest run src/components/photos src/photos src/app/host/new`
Expected: PASS.

- [ ] **Step 5: Wire the composer**

In `form.tsx`: `title` becomes controlled state; `const breakId = initial.newBreakId ?? initial.breakId` (throw if both
are null: Task 3b's `ComposerInitial` always sets one); a "Photos" `fieldset` (legend `text-headline font-semibold`,
like its neighbours) placed after the fieldset holding Lines and Price per line, rendering
`<PhotoStrip breakId={breakId} initial={initial.photos} prizes={stripPrizes(choices, second)} title={title}
max={maxPhotos} canAdd={canAddPhotos({ title, lineCount, price, maxLines, topSpot: choices[0] ?? null })}
claimed={false} ensureDraft={initial.newBreakId === null ? undefined : ensureDraft} onCount={setPhotoCount} />`.
`stripPrizes` (local) gives one `StripPrize` per named prize row: its `slotKey`, its typed name as `label` and
`itemName`, else "Top spot" or "2nd place" with `itemName: null`. The strip dispatches `slots` itself when `prizes`
changes. `ensureDraft` is memoised in a ref: it posts `new FormData(formRef.current)` to `ensureDraftAction`, calls
`moveToEditAddress(r.data.breakId)` on success, clears the ref on failure, and returns `{ ok }` or `{ ok: false,
message }`. Above Open break, when `photoCount === 0`, one quiet `<p className="text-small text-ink-2">Buyers see the
lead photo first in the feed.</p>`. `initial.ts` gains `photos` (empty for a new break; the edit page passes
`toStripPhotos(photoStorage(), (await breakPhotos(tx, id, hostViewer)).live)`), and both pages pass `MAX_PHOTOS`.

- [ ] **Step 6: Write the e2e**

`e2e/photo-strip.spec.ts` (serial; one host `ps${run}@e2e.test`; sandbox off, Storage up). Helpers in the file:
`fillDraftable(page, title)` fills title, `prize1` "Chronos 22g", selects `prize1Condition` "new_in_box", `lineCount`
"4", `linePrice` "5"; `readyTiles(page)` = `page.getByTestId("photo-tile").and(page.locator("[data-status=ready]"))`;
`order(page)` = the `data-photo-id` of every tile in DOM order.

```ts
test("composeBreakWithPhotos opens a break with two published photos (Task 7a's helper)", async ({ page }) => {
  await loginAs(page, `ps${run}@e2e.test`, "host");
  const url = await composeBreakWithPhotos(page, { title: `Strip helper ${run}`, photos: 2 });
  expect(url).toMatch(/\/b\/[0-9a-f-]{36}$/);
  const id = url.split("/").pop()!;
  const rows = await withDb((sql) => sql`select bucket from break_photos where break_id = ${id} and removed_at is null and hidden_at is null`);
  expect(rows.map((r) => r.bucket)).toEqual(["photos", "photos"]);
});
test("Add photos waits for the title, the price and the top spot with its condition", async ({ page }) => {
  await loginAs(page, `ps${run}@e2e.test`, "host");
  await gotoReady(page, "/host/new");
  await page.fill("input[name=title]", ""); await page.fill("input[name=linePrice]", ""); await page.fill("input[name=prize1]", "");
  const add = page.getByTestId("photo-add");
  await expect(add).toBeDisabled();
  await expect(page.getByText("Add a title, a price and the top spot first.")).toBeVisible();
  await page.fill("input[name=title]", "Strip break"); await expect(add).toBeDisabled();
  await page.fill("input[name=linePrice]", "5"); await expect(add).toBeDisabled();
  await page.fill("input[name=prize1]", "Chronos 22g"); await expect(add).toBeDisabled();
  await page.selectOption("select[name=prize1Condition]", "new_in_box");
  await expect(add).toBeEnabled();
  await expect(page.getByText("Add a title, a price and the top spot first.")).toHaveCount(0);
});
test("nine picks: eight tiles and the reason for the ninth, before any network call", async ({ page }) => {
  await loginAs(page, `ps${run}@e2e.test`, "host");
  await gotoReady(page, "/host/new"); await fillDraftable(page, "Nine picks");
  const calls: string[] = []; const held: Route[] = []; let release = false;
  await page.route("**/*", (route) => {
    const r = route.request();
    if (r.method() === "GET" || release) return route.fallback();
    calls.push(`${r.method()} ${new URL(r.url()).pathname}`); held.push(route); // hold every POST and PUT
  });
  const before = calls.length;
  await page.getByTestId("photo-input").setInputFiles(await Promise.all(Array.from({ length: 9 }, async (_, i) => ({ name: `n${i}.jpg`, mimeType: "image/jpeg", buffer: await jpeg(i + 1) }))));
  await expect(page.getByTestId("photo-notice")).toHaveText("Photos are limited to 8 per break. 1 photo was not added.");
  await expect(page.getByTestId("photo-tile")).toHaveCount(8);
  expect(before).toBe(0);
  expect(calls.filter((c) => c.startsWith("PUT ") || c.includes("/api/photos/finalise"))).toEqual([]); // nothing uploaded yet
  expect(calls.length).toBeLessThanOrEqual(1);                                                           // at most the held draft save
  release = true; for (const r of held.splice(0)) await r.fallback();
  await expect(readyTiles(page)).toHaveCount(8, { timeout: 60_000 });
});
test("the same file picked twice uploads twice", async ({ page }) => {
  await loginAs(page, `ps${run}@e2e.test`, "host");
  await gotoReady(page, "/host/new"); await fillDraftable(page, "Twice");
  const puts: string[] = []; page.on("request", (r) => { if (r.method() === "PUT" && r.url().includes("/storage/v1/object/upload/sign/")) puts.push(r.url()); });
  const buffer = await jpeg(5);
  await page.getByTestId("photo-input").setInputFiles([{ name: "same.jpg", mimeType: "image/jpeg", buffer }, { name: "same.jpg", mimeType: "image/jpeg", buffer }]);
  await expect(readyTiles(page)).toHaveCount(2);
  expect(puts).toHaveLength(2);
  expect(new Set(await order(page)).size).toBe(2);
});
test("an unreadable file is refused on the spot and the others go on", async ({ page }) => {
  await loginAs(page, `ps${run}@e2e.test`, "host");
  await gotoReady(page, "/host/new"); await fillDraftable(page, "Unreadable");
  await page.getByTestId("photo-input").setInputFiles([{ name: "a.jpg", mimeType: "image/jpeg", buffer: await jpeg(1) }, { name: "x.heic", mimeType: "image/heic", buffer: Buffer.from("not an image") }]);
  await expect(page.getByTestId("photo-notice")).toHaveText("This photo can't be read here. Pick a JPEG or PNG.");
  await expect(page.getByTestId("photo-tile")).toHaveCount(1);
  await expect(readyTiles(page)).toHaveCount(1);
});
test("the first photo makes the draft and moves the address; Save draft keeps the photo and its tag; no hydration error", async ({ page }) => {
  const errors: string[] = []; page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await loginAs(page, `ps${run}@e2e.test`, "host");
  await gotoReady(page, "/host/new"); await fillDraftable(page, "First photo");
  const id = await page.locator("input[name=newBreakId]").inputValue();
  await page.getByTestId("photo-input").setInputFiles([{ name: "a.jpg", mimeType: "image/jpeg", buffer: await jpeg(1) }]);
  await expect(readyTiles(page)).toHaveCount(1);
  await expect(page).toHaveURL(`/host/${id}/edit`);
  await page.getByTestId("photo-options-1").click();
  await page.getByRole("button", { name: "Tag" }).click();
  await page.getByRole("radio", { name: "Chronos 22g" }).check();
  await page.getByTestId("composer-draft").click();
  await page.waitForURL(`/b/${id}`);
  await gotoReady(page, `/host/${id}/edit`);
  await expect(readyTiles(page)).toHaveCount(1);
  await page.getByTestId("photo-options-1").click(); await page.getByRole("button", { name: "Tag" }).click();
  await expect(page.getByRole("radio", { name: "Chronos 22g" })).toBeChecked();
  expect(errors.filter((e) => /hydrat/i.test(e))).toEqual([]);
});
test("while an upload is in flight the banner shows and Save and Open stay enabled", async ({ page }) => {
  await loginAs(page, `ps${run}@e2e.test`, "host");
  await gotoReady(page, "/host/new"); await fillDraftable(page, "In flight");
  let hold: Route | null = null;
  await page.route("**/storage/v1/object/upload/sign/**", (route) => { hold = route; });
  await page.getByTestId("photo-input").setInputFiles([{ name: "a.jpg", mimeType: "image/jpeg", buffer: await jpeg(1) }]);
  await expect(page.getByTestId("photo-uploading-banner")).toHaveText("Photos are still uploading. Stay on this page until they finish.");
  await expect(page.getByTestId("composer-draft")).toBeEnabled(); await expect(page.getByTestId("composer-open")).toBeEnabled();
  await expect.poll(() => hold !== null).toBe(true);
  await page.unroute("**/storage/v1/object/upload/sign/**"); await hold!.fallback();
  await expect(readyTiles(page)).toHaveCount(1);
  await expect(page.getByTestId("photo-uploading-banner")).toHaveCount(0);
});
test("drag the third tile onto the first: it becomes the lead, and the order survives a reload", async ({ page }) => {
  await loginAs(page, `ps${run}@e2e.test`, "host");
  await gotoReady(page, "/host/new"); await fillDraftable(page, "Drag");
  await page.getByTestId("photo-input").setInputFiles(await Promise.all([1, 2, 3].map(async (i) => ({ name: `d${i}.jpg`, mimeType: "image/jpeg", buffer: await jpeg(i) }))));
  await expect(readyTiles(page)).toHaveCount(3);
  const [a, b, c] = await order(page);
  const grip = (await page.getByTestId("photo-grip").nth(2).boundingBox())!;
  const first = (await page.getByTestId("photo-tile").first().boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down();
  await page.mouse.move(first.x + 10, first.y + 10, { steps: 8 }); await page.mouse.up();
  await expect.poll(() => order(page)).toEqual([c, a, b]);
  await expect(page.getByTestId("photo-tile").first()).toContainText("Lead");
  await page.reload(); await expect(readyTiles(page)).toHaveCount(3);
  expect(await order(page)).toEqual([c, a, b]);
});
test("Move earlier is the keyboard path, and is aria-disabled on the lead", async ({ page }) => {
  await loginAs(page, `ps${run}@e2e.test`, "host");
  await gotoReady(page, "/host/new"); await fillDraftable(page, "Keys");
  await page.getByTestId("photo-input").setInputFiles(await Promise.all([1, 2].map(async (i) => ({ name: `k${i}.jpg`, mimeType: "image/jpeg", buffer: await jpeg(i) }))));
  await expect(readyTiles(page)).toHaveCount(2);
  const [a, b] = await order(page);
  await page.getByTestId("photo-options-1").click();
  await expect(page.getByRole("button", { name: "Move earlier" })).toHaveAttribute("aria-disabled", "true");
  await page.getByTestId("photo-options-2").click();
  await page.getByRole("button", { name: "Move earlier" }).click();
  await expect.poll(() => order(page)).toEqual([b, a]);
});
test("Remove shows Undo for 8 seconds; Undo restores the tile; a removal left alone commits", async ({ page }) => {
  await loginAs(page, `ps${run}@e2e.test`, "host");
  await gotoReady(page, "/host/new"); await fillDraftable(page, "Undo");
  await page.getByTestId("photo-input").setInputFiles([{ name: "a.jpg", mimeType: "image/jpeg", buffer: await jpeg(1) }]);
  await expect(readyTiles(page)).toHaveCount(1);
  await page.getByTestId("photo-options-1").click(); await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Photo removed.")).toBeVisible(); await expect(page.getByTestId("photo-tile")).toHaveCount(0);
  await page.getByTestId("photo-undo").click();
  await expect(page.getByTestId("photo-tile")).toHaveCount(1);
  await page.getByTestId("photo-options-1").click(); await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByTestId("photo-undo")).toHaveCount(0, { timeout: 10_000 }); // the 8 seconds ran out
  await page.reload(); await expect(page.getByTestId("photo-strip")).toBeVisible();
  await expect(page.getByTestId("photo-tile")).toHaveCount(0);
});
```

(`Route` is imported from `@playwright/test`; `withDb` from `./db`; the Tag panel lists the prizes as radios named by
their `label`, plus "No tag".)

- [ ] **Step 7: Run the e2e**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && /usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm exec playwright test e2e/photo-strip.spec.ts` (sandbox off)
Expected: PASS.

- [ ] **Step 8: Gates and commit**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec tsc --noEmit && pnpm lint && pnpm test`, then
the full e2e on `breaks_e2e` (`/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test:e2e`, sandbox off).
Expected: all green, no warnings; the copy audit passes with the new strings.

```bash
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH
git add src/components/photos src/photos/strip-data.ts src/photos/strip-data.test.ts src/app/host e2e/photo-strip.spec.ts
git commit -m "feat(photos): composer photo strip with upload states and a draft made by the first photo"
```

**Reviewer: Opus.** Focus: (a) the id is the server's and the address change is `moveToEditAddress` (no client uuid,
no `replaceState(null, …)`, no hydration warning); (b) nothing in the strip blocks Save or Open; (c) `beforeunload` is
registered only while uploads are in flight and removed after and on unmount; (d) the removal queue is the only path
that commits a pre-claim removal, and it is flushed on unmount; (e) `ensureDraftAction` saves a draft without a
payment handle and never redirects.

---

### Task 7c: Edit photos sheet (model: Sonnet)

Spec §6 (the host's confirm after the first claim; "Edit photos"), §9. Gives the host the strip on an open or filled
break, inside a `Sheet`, from the break page's host row.

**Rulings for this task:**
1. **Where "Edit photos" goes**: a secondary `Button` beside "Host tools" in the break page's host row, shown to the
   host while the break is `open` or `filled` (a draft has "Edit draft"). The sheet title is "Edit photos"; closing it
   calls `router.refresh()` if the strip reported any change (`onChange`).
2. **The host's photos load** joins the break page's one transaction: `loadBreak` (`src/app/b/[id]/load.ts`) also
   returns `photos: BreakPhotos | null`, read with `breakPhotos(tx, breakId, viewer)` right after `readBreakView`. In
   this task only the host gets a load (`{ id, isHost: true, isHolder: false, isAdmin: caller.role === "admin" }`);
   everyone else gets `null`. Task 8a widens it to every viewer through `photoViewer`.
3. **After a claim** the strip runs with `claimed={b.firstClaimedAt !== null}`, so Remove asks first (Task 7b
   ruling 5).

**Files:**
- Create: `src/components/photos/edit-photos-sheet.tsx`, `src/components/photos/edit-photos-sheet.test.ts`
- Modify: `src/app/b/[id]/load.ts` (`photos`), `src/app/b/[id]/page.tsx` (the host row)
- Modify: `src/photos/strip-data.ts`, `src/photos/strip-data.test.ts` (`prizeStripPrizes`)
- Modify: `e2e/photo-strip.spec.ts` (two tests appended)

**Interfaces:**
- Consumes: Task 7b's `PhotoStrip`, `PhotoStripProps`, `StripPrize`, `toStripPhotos`; Task 5's `breakPhotos`,
  `BreakPhotos`, `MAX_PHOTOS`; `Sheet` (`src/components/sheet.tsx`), `Button`; `HostTools` (existing, the row it joins).
- Produces:
  - `edit-photos-sheet.tsx`: `EditPhotosSheet(p: Omit<PhotoStripProps, "canAdd" | "ensureDraft" | "onCount" | "onChange">): React.ReactElement`
    (the "Edit photos" button, `data-testid="edit-photos"`, plus the `Sheet` holding `<PhotoStrip canAdd … />`).
  - `loadBreak(id)` returns `{ view, caller, now, photos: BreakPhotos | null }` (Task 8a reuses this load; do not
    load twice).
  - `prizeStripPrizes(page: BreakPage): StripPrize[]` in `src/photos/strip-data.ts`: one per prize row in rank
    order, `slot` its `slotKey`, `label` and `itemName` its item's name.

- [ ] **Step 1: Write the failing sheet and prize-list tests**

`src/components/photos/edit-photos-sheet.test.ts` (`renderToStaticMarkup`; the sheet starts closed):

```ts
it("renders the Edit photos button and no open sheet", () => {
  const h = html(createElement(EditPhotosSheet, { breakId: "b1", initial: [], prizes: [], title: "T", max: 8, claimed: false }));
  expect(h).toMatch(/<button[^>]*data-testid="edit-photos"[^>]*>Edit photos<\/button>/);
  expect(h).not.toContain('data-testid="photo-strip"');
});
```

`src/photos/strip-data.test.ts` gains:

```ts
it("prizeStripPrizes lists every prize by slot in rank order with its item's name", () => {
  expect(prizeStripPrizes(page({ prizes: [{ rank: 2, slotKey: "s3", itemId: "i3" }, { rank: 1, slotKey: "s1", itemId: "i1" }],
    items: [{ id: "i1", name: "Chronos 22g" }, { id: "i3", name: "Flight pack" }] }))).toEqual([
    { slot: "s1", label: "Chronos 22g", itemName: "Chronos 22g" },
    { slot: "s3", label: "Flight pack", itemName: "Flight pack" },
  ]);
});
```

(`page(o)` builds a minimal `BreakPage` from the given prize and item rows.)

- [ ] **Step 2: Run to verify failure**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec vitest run src/components/photos/edit-photos-sheet.test.ts src/photos/strip-data.test.ts`
Expected: FAIL (module and `prizeStripPrizes` missing).

- [ ] **Step 3: Implement the sheet, the load and the host row**

`EditPhotosSheet` (client): `<Button variant="secondary" data-testid="edit-photos">Edit photos</Button>` and
`<Sheet title="Edit photos" …>` holding `<PhotoStrip {...p} canAdd onChange={() => (changed.current = true)} />`;
closing calls `router.refresh()` when `changed.current`. `loadBreak` gains the photos read (ruling 2). In
`src/app/b/[id]/page.tsx`, when `grid.hostView && (status === "open" || status === "filled")` and `photos`, render
`<EditPhotosSheet breakId={id} initial={await toStripPhotos(photoStorage(), photos.live)} prizes={prizeStripPrizes(page)}
title={b.title} max={MAX_PHOTOS} claimed={b.firstClaimedAt !== null} />` next to `HostTools`.
Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec vitest run src/components/photos src/photos`
Expected: PASS.

- [ ] **Step 4: Append the e2e**

To `e2e/photo-strip.spec.ts` (the drag and the post-claim confirm are covered here, in e2e, because both need a real
pointer and a real claim):

```ts
test("Edit photos: the host adds a photo to an open break; a stranger has no button", async ({ page, browser }) => {
  await loginAs(page, `ps${run}@e2e.test`, "host");
  const url = await composeBreakWithPhotos(page, { title: `Sheet ${run}`, photos: 1 });
  await gotoReady(page, url);
  await page.getByTestId("edit-photos").click();
  await expect(page.getByRole("dialog", { name: "Edit photos" })).toBeVisible();
  await expect(page.getByTestId("photo-add")).toBeEnabled();
  await page.getByTestId("photo-input").setInputFiles([{ name: "b.jpg", mimeType: "image/jpeg", buffer: await jpeg(2) }]);
  await expect(readyTiles(page)).toHaveCount(2);
  await page.keyboard.press("Escape");
  await page.getByTestId("edit-photos").click();
  await expect(readyTiles(page)).toHaveCount(2);
  const stranger = await (await browser.newContext()).newPage();
  await gotoReady(stranger, url);
  await expect(stranger.getByTestId("edit-photos")).toHaveCount(0);
});
test("after a claim, Remove asks first; Keep keeps it, Remove photo removes at once with no Undo", async ({ page, browser }) => {
  await loginAs(page, `ps${run}@e2e.test`, "host");
  const url = await composeBreakWithPhotos(page, { title: `Claimed ${run}`, photos: 2 });
  const buyer = await (await browser.newContext()).newPage();
  await loginAs(buyer, `pb${run}@e2e.test`);
  await gotoReady(buyer, url);
  await buyer.getByTestId("cell-1").click(); await buyer.getByTestId("claim-submit").click();
  await expect(buyer.getByTestId("owed")).toBeVisible();
  await gotoReady(page, url);
  await page.getByTestId("edit-photos").click();
  const [first, second] = await order(page);
  await page.getByTestId("photo-options-1").click(); await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Buyers in this break will still see this photo, marked Removed.")).toBeVisible();
  await page.getByRole("button", { name: "Keep photo" }).click();
  expect(await order(page)).toEqual([first, second]);
  await page.getByTestId("photo-options-1").click(); await page.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Remove photo" }).click();
  await expect.poll(() => order(page)).toEqual([second]);
  await expect(page.getByTestId("photo-undo")).toHaveCount(0);
  await expect.poll(() => withDb((sql) => sql`select count(*)::int as n from break_photos where id = ${first} and removed_at is not null`).then((r) => r[0].n)).toBe(1);
});
```

- [ ] **Step 5: Run the e2e**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && /usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm exec playwright test e2e/photo-strip.spec.ts` (sandbox off)
Expected: PASS.

- [ ] **Step 6: Gates and commit**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec tsc --noEmit && pnpm lint && pnpm test`, then
the full e2e on `breaks_e2e` (`/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test:e2e`, sandbox off).
Expected: all green, no warnings.

```bash
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH
git add src/components/photos src/photos "src/app/b/[id]/load.ts" "src/app/b/[id]/page.tsx" e2e/photo-strip.spec.ts
git commit -m "feat(photos): Edit photos sheet on the break page with the confirm after a claim"
```

**Reviewer: Opus.** Focus: (a) the button shows only to the host of an open or filled break; (b) the photos load runs
inside `loadBreak`'s one transaction and only for the host in this task; (c) after a claim Remove always asks, and a
confirmed removal has no Undo; (d) `router.refresh()` runs on close only after a committed change; (e) every new string
passes the copy audit and none implies the platform verified a photo.

---
### Task 8a: Plate, Prizes block, page photos, layout (model: Sonnet)

Spec §6 (the notice, "Removed Oct 21"), §8.0 (the plate), §8.2 (break page); Mosaic §8 table (the 390 × 664 budget)
and §11. Review Focus 1 and 2 live here. This task puts the photos on the break page as plain, non-interactive plates;
Task 8b makes them open the viewer.

**Rulings for Tasks 8a and 8b:**
1. **Plate geometry**: `size` (40, 48, 64 or 96) is the image box. On a board surface the outer box is `size + 8`
   (3 px mat + 1 px keyline each side): 40 → 48, 48 → 56, 64 → 72, 96 → 104 (never 44.75). On a paper surface the
   outer box is `size + 2` (keyline only). The `<img>` has explicit `width` and `height` equal to `size`,
   `object-fit: cover`, and carries the `--board-wall-2` placeholder as its own background, so a transparent PNG shows
   the mat colour. The plate never rotates, filters or tints. The root carries `data-testid="plate"`,
   `data-size={size}` and `data-surface={surface}` (panel ruling 36).
2. **Title band**: with a lead photo the title row is `flex items-start gap-3` with `h1` (`mt-3`, `min-w-0 flex-1`,
   still `line-clamp-2`) and the lead plate's wrapper (`mt-1`, `shrink-0`, `data-testid="photo-plate"`): the band is
   `max(12 + 64, 4 + 72)` = 76 px, so Mosaic's budget table (Title, two lines: 12 + 64) is unchanged and nothing below
   moves. The media row stays a full-width `<p>` under the band. A break with no photo keeps today's markup exactly
   (`<section className="mt-3">`).
3. **Count and "Updated"** sit on the plate as text on a solid 16 px strip inside the mat (`bg-board-wall-2`,
   `text-[11px]`, `--board-text`), never a tint of the image. "Updated" replaces the count for a holder with `unseen`
   and a notice. The lead image is decorative (`alt=""`); its name comes from the button Task 8b wraps it in.
4. **Prizes block is a paper card** like Details (`rounded-card border border-wire bg-card`), so its plates use
   `surface="paper"`. It sits after the board's children and before `DetailsFold`, always open, and **replaces the prize
   lines in `DetailsFold`** (the `prizes` prop is removed). `PrizesBlock` has no `frozen` prop (panel ruling 35): the
   result page (Task 9) renders the same component, and audience filtering happens in `pagePhotos`.
5. **Places**: one row per prize in rank order. Word: "Top spot" for the first rank-1 prize, "Or" for the other rank-1
   prizes, "2nd place", "3rd place" from the existing `ordinal` helper in `frame-copy.ts` (export it if private). Row
   text: word, item name, then the condition label (`CONDITION_LABEL`, omitted when the item has none), then variants as
   `key: a or b` pairs joined with "; " (`orList` from `frame-copy.ts`). At most three 64 px plates of the photos tagged
   with that prize's `slot_key`; tagged photos past three stay reachable in the viewer. "Also in the photos" lists
   untagged photos. A place with no tagged photo shows text only.
6. **Notice**: the sentence plus `LocalTime`, rendered as "<text> on <date and time>." (`LocalTime` kind `datetime`, so
   "Lead photo replaced on Oct 21, 2026 at 3:05 PM."). Holders see it at the top of the block (under "Prizes");
   everyone else at the foot, for the rest of the break's life. "Updated" on the plate needs `unseen`; the sentence
   stays regardless.
7. **Removed photos** (holders and the host only; `breakPhotos` already withholds them, and `pagePhotos` drops them
   again for any other audience): a 64 px paper plate with the mark "Removed Oct 21" (`LocalTime` kind `date`, fallback
   in the viewer's zone), signed 10-minute URL through `photoSrc`; once the archive dropped the image (`prefix: null`)
   the mark stays on an empty `--board-wall-2` box. Removed plates never open the viewer.
8. **`markPhotoNoticeSeenAction(breakId)`** is fired by a client `NoticeSeen` after the page renders for a holder with
   `unseen`, once per page view per break (a module-level `Set` guards React's double effect); never from a server
   render; the result is ignored.
9. **Who sees what** is decided once, by `photoViewer` (`src/photos/viewer.ts`, shared with Task 9's result page):
   anonymous → `null`; otherwise `{ id, isHost: id === hostId, isHolder: holderIds.has(id), isAdmin: role === "admin" }`.
   `audience` for `pagePhotos` is `"host"` for the host, `"holder"` for a holder, else `"other"`.

**Files:**
- Create: `src/components/photos/plate.tsx`, `src/components/photos/plate.test.ts`
- Create: `src/components/photos/viewer-model.ts`, `src/components/photos/viewer-model.test.ts`
- Create: `src/components/photos/prizes-model.ts`, `src/components/photos/prizes-model.test.ts`,
  `src/components/photos/prizes-block.tsx`, `src/components/photos/prizes-block.test.ts`
- Create: `src/components/photos/notice-seen.tsx`, `src/components/photos/notice-seen-logic.ts`,
  `src/components/photos/notice-seen-logic.test.ts`
- Create: `src/photos/page-photos.ts`, `src/photos/page-photos.test.ts`, `src/photos/viewer.ts`,
  `src/photos/viewer.test.ts`
- Modify: `src/app/b/[id]/load.ts` (the photos load for every viewer), `src/app/b/[id]/page.tsx` (title band,
  `NoticeSeen`, `PrizesBlock`), `src/components/break/details-fold.tsx` (drop `prizes`),
  `src/components/local-time.tsx` and `src/lib/time.ts` (+ `src/lib/time.test.ts`): a `date` kind
- Modify: `e2e/layout.spec.ts`

**Interfaces:**
- Consumes:
  - Task 5: `breakPhotos(tx, breakId, viewer): Promise<BreakPhotos>` and its types (`PhotoView`, `RemovedPhotoView`,
    `notice: { text; at } | null`, `unseen`); `CONDITION_LABEL`, `ItemCondition` (Task 3a's `condition.ts`, re-exported).
    Task 3a: `prizes.slotKey` and `break_items.condition` on `page.prizes` and `page.items`;
    `break_items.variantSchema: Record<string, string[]> | null` (exists).
  - Task 6: `photoSrc(storage, v, size): Promise<PhotoSrc>`; `markPhotoNoticeSeenAction(breakId)`; `photoStorage()`.
  - Task 7a: `composeBreakWithPhotos`, `jpeg` (`e2e/helpers.ts`). Task 7c: `loadBreak`'s `photos` (host only so far;
    this task widens it; do not load twice).
  - `LocalTime` (`src/components/local-time.tsx`), `orList`/`ordinal` (`frame-copy.ts`), `formatDateTime`
    (`src/lib/time.ts`).
- Produces:
  ```ts
  // plate.tsx (server-safe, no hooks)
  export type PlateSize = 40 | 48 | 64 | 96;
  export function Plate(p: { photo: PhotoSrc; size: PlateSize; surface: "board" | "paper"; decorative?: boolean }): React.ReactElement;
  // viewer-model.ts (pure)
  export type ViewerPhoto = PhotoSrc & { caption: string | null };      // caption: "Top spot: Taylor Chronos 24g" or null when untagged
  export const positionText = (index: number, count: number): string;  // "Photo 2 of 5"
  export const viewerCaption = (tag: string | null, index: number, count: number): string; // "Top spot: Taylor Chronos 24g. Photo 2 of 5."
  export const neighbours = (index: number, count: number): { prev: number | null; next: number | null };
  export const countText = (n: number): string;                          // "1 photo", "5 photos"
  export const plateButtonName = (n: number, updated: boolean): string;  // "Prize photos, 5" | "Prize photos, 5, updated"
  // prizes-model.ts (pure)
  export type PlateData = { id: string; index: number; photo: PhotoSrc }; // index: position in `live`, the viewer's index
  export type PrizePlace = { key: string; word: string; captionWord: string; name: string; condition: string | null; variants: string | null; plates: PlateData[] };
  export type RemovedPlate = { id: string; photo: PhotoSrc | null; alt: string; removedIso: string; removedFallback: string };
  export type PrizesBlockNotice = { text: string; iso: string; fallback: string };
  export function variantText(schema: Record<string, string[]> | null): string | null;
  export function placeRows(prizes: readonly { rank: number; itemId: string | null; slotKey: string }[], items: readonly { id: string; name: string; condition: ItemCondition | null; variantSchema: Record<string, string[]> | null }[]): Omit<PrizePlace, "plates">[];
  export function attachPlates(rows: ReturnType<typeof placeRows>, live: readonly { id: string; slot: string | null; photo: PhotoSrc }[]): { places: PrizePlace[]; untagged: PlateData[] }; // up to 3 per place
  // prizes-block.tsx (server; no data access; no `frozen` prop)
  export type PrizesBlockProps = { places: PrizePlace[]; untagged: PlateData[]; removed: RemovedPlate[]; notice: PrizesBlockNotice | null; noticeFirst: boolean; count: number };
  export function PrizesBlock(p: PrizesBlockProps): React.ReactElement;
  // page-photos.ts (server)
  export type PhotoAudience = "holder" | "host" | "other";
  export type PagePhotos = { count: number; lead: PhotoSrc | null; viewer: ViewerPhoto[]; updated: boolean; unseen: boolean; places: PrizePlace[]; untagged: PlateData[]; removed: RemovedPlate[]; notice: PrizesBlockNotice | null };
  export async function pagePhotos(storage: PhotoStorage, photos: BreakPhotos, rows: ReturnType<typeof placeRows>, o: { audience: PhotoAudience; tz: string }): Promise<PagePhotos>;
  // viewer.ts (server, shared with Task 9)
  export function photoViewer(caller: Caller | null, ctx: { hostId: string; holderIds: ReadonlySet<string> }): { id: string; isHost: boolean; isHolder: boolean; isAdmin: boolean } | null;
  export function photoAudience(v: ReturnType<typeof photoViewer>): PhotoAudience;
  // notice-seen-logic.ts
  export async function markSeenOnce(breakId: string, unseen: boolean, call: (breakId: string) => Promise<unknown>, fired?: Set<string>): Promise<void>;
  // src/lib/time.ts
  export function formatShortDate(d: Date, tz: string): string;           // "Oct 21"
  ```
  `LocalTime` gains `kind: "date"`. `loadBreak(id)` returns `photos: BreakPhotos | null` for every viewer of a visible
  break (null only when `view` is null). Test ids: `plate` (every plate root), `photo-plate` (the lead's wrapper),
  `prizes-block`, `prize-place`, `photo-notice-line`, `removed-plate`.

- [ ] **Step 1: Write the failing plate tests**

`src/components/photos/plate.test.ts`:

```ts
const photo = (o: Partial<PhotoSrc> = {}): PhotoSrc => ({
  src: "https://x.test/photos/a-160.webp",
  srcSet: "https://x.test/photos/a-160.webp 160w, https://x.test/photos/a-640.webp 640w",
  width: 640, height: 480, alt: "Chronos 24g", ...o,
});
const plate = (o: Partial<ComponentProps<typeof Plate>> = {}) => html(createElement(Plate, { photo: photo(), size: 64, surface: "board", ...o }));
const root = (h: string) => h.match(/^<[^>]+>/)![0];

it("the root carries data-testid, data-size and data-surface", () => {
  expect(root(plate())).toContain('data-testid="plate"');
  expect(root(plate())).toContain('data-size="64"'); expect(root(plate())).toContain('data-surface="board"');
  expect(root(plate({ size: 96, surface: "paper" }))).toContain('data-size="96"');
  expect(root(plate({ size: 96, surface: "paper" }))).toContain('data-surface="paper"');
});
it("board: a 64 px image in a 3 px mat and a 1 px steel keyline, 72 px outside", () => {
  const h = plate();
  expect(h).toContain('width="64"'); expect(h).toContain('height="64"');
  expect(root(h)).toContain("width:72px;height:72px");
  expect(h).toContain("p-[3px]"); expect(h).toContain("bg-board-wall-2"); expect(h).toContain("border-board-steel");
});
it("paper: no mat, a wire-strong keyline, 42 px outside a 40 px image", () => {
  const h = plate({ size: 40, surface: "paper" });
  expect(root(h)).toContain("width:42px;height:42px"); expect(h).toContain("border-wire-strong");
  expect(h).not.toContain("p-[3px]"); expect(h).not.toContain("border-board-steel");
});
it("every size has its outer box and never a board pitch", () => {
  for (const [size, board, paper] of [[40, 48, 42], [48, 56, 50], [64, 72, 66], [96, 104, 98]] as const) {
    expect(root(plate({ size }))).toContain(`width:${board}px;height:${board}px`);
    expect(root(plate({ size, surface: "paper" }))).toContain(`width:${paper}px;height:${paper}px`);
    expect(plate({ size })).toContain(`width="${size}"`);
  }
  expect(plate()).not.toContain("44.75");
});
it("decorative plates carry alt=\"\"; others the photo's alt", () => {
  expect(plate({ decorative: true })).toContain('alt=""');
  expect(plate()).toContain('alt="Chronos 24g"');
});
it("crops, never stretches: a 10:1 panorama still sits in a square box", () => {
  const h = plate({ photo: photo({ width: 1600, height: 160 }) });
  expect(h).toContain("object-cover"); expect(h).toContain('width="64"'); expect(h).toContain('height="64"');
  expect(h).not.toContain("object-fill"); expect(h).not.toContain('width="1600"');
});
it("a 100 px source keeps the box and passes its srcset through untouched", () => {
  const h = plate({ photo: photo({ width: 100, height: 100, srcSet: "https://x.test/photos/a-160.webp 100w" }) });
  expect(h).toContain('srcSet="https://x.test/photos/a-160.webp 100w"'); expect(h).toContain('sizes="64px"');
});
it("a transparent PNG shows the mat colour: the image itself carries the placeholder, with no filter or tint", () => {
  const img = plate().match(/<img[^>]*>/)![0];
  expect(img).toContain("bg-board-wall-2");
  expect(img).not.toMatch(/grayscale|sepia|opacity|mix-blend|rotate/);
});
it("loads lazily and decodes off the main thread", () => {
  expect(plate()).toContain('loading="lazy"'); expect(plate()).toContain('decoding="async"');
});
```

- [ ] **Step 2: Run to verify failure, then implement `Plate`**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec vitest run src/components/photos/plate.test.ts`
Expected: FAIL, `Failed to resolve import "./plate"`. Implement `Plate` per ruling 1 (outer `<span>` with the data
attributes and inline `width`/`height` style, inner `<img>`).

- [ ] **Step 3: Run to verify pass**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec vitest run src/components/photos/plate.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing model, viewer, notice-seen and time tests**

`viewer-model.test.ts`:

```ts
it("position, caption, neighbours, count and the plate's name", () => {
  expect(positionText(1, 5)).toBe("Photo 2 of 5");
  expect(viewerCaption("Top spot: Taylor Chronos 24g", 1, 5)).toBe("Top spot: Taylor Chronos 24g. Photo 2 of 5.");
  expect(viewerCaption(null, 0, 1)).toBe("Photo 1 of 1.");
  expect(neighbours(0, 5)).toEqual({ prev: null, next: 1 });
  expect(neighbours(2, 5)).toEqual({ prev: 1, next: 3 });
  expect(neighbours(4, 5)).toEqual({ prev: 3, next: null });
  expect(neighbours(0, 1)).toEqual({ prev: null, next: null });
  expect(countText(1)).toBe("1 photo"); expect(countText(5)).toBe("5 photos");
  expect(plateButtonName(5, false)).toBe("Prize photos, 5");
  expect(plateButtonName(5, true)).toBe("Prize photos, 5, updated");
});
```

`prizes-model.test.ts` (`ps(id)` builds a `PhotoSrc` whose `alt` is `id`; `rows` comes from `placeRows` over prizes
`[{ rank: 1, itemId: "i1", slotKey: "A" }, { rank: 1, itemId: "i2", slotKey: "B" }, { rank: 2, itemId: "i3", slotKey:
"C" }]` and items Taylor Chronos 24g (`new_in_box`), Phantom 24g (`used`), Flight pack (no condition)):

```ts
it("variantText joins keys with '; ' and values with 'or'", () => {
  expect(variantText({ weight: ["18g", "20g"], tip: ["soft", "steel"] })).toBe("weight: 18g or 20g; tip: soft or steel");
  expect(variantText(null)).toBeNull(); expect(variantText({})).toBeNull();
});
it("placeRows: Top spot, Or, 2nd place in rank order, with condition labels", () => {
  expect(rows.map((r) => [r.key, r.word, r.captionWord, r.name, r.condition])).toEqual([
    ["A", "Top spot", "Top spot", "Taylor Chronos 24g", "New in box"],
    ["B", "Or", "Top spot", "Phantom 24g", "Used"],
    ["C", "2nd place", "2nd place", "Flight pack", null],
  ]);
});
it("attachPlates: at most three plates per place, in live order, with their viewer index; untagged go to 'Also in the photos'", () => {
  const live = ["p0", "p1", "p2", "p3", "p4"].map((id) => ({ id, slot: "A", photo: ps(id) })).concat({ id: "u5", slot: null, photo: ps("u5") });
  const { places, untagged } = attachPlates(rows, live);
  expect(places[0].plates.map((p) => [p.id, p.index])).toEqual([["p0", 0], ["p1", 1], ["p2", 2]]);
  expect(untagged.map((p) => [p.id, p.index])).toEqual([["u5", 5]]);
});
it("a place with no tagged photo has no plates", () => {
  const { places } = attachPlates(rows, [{ id: "p0", slot: "A", photo: ps("p0") }]);
  expect(places[1].plates).toEqual([]); expect(places[2].plates).toEqual([]);
});
it("a photo tagged to a slot no place has (a stale tag) falls into untagged", () => {
  const { places, untagged } = attachPlates(rows, [{ id: "p0", slot: "Z", photo: ps("p0") }]);
  expect(places.every((p) => p.plates.length === 0)).toBe(true);
  expect(untagged.map((p) => p.id)).toEqual(["p0"]);
});
```

`notice-seen-logic.test.ts`:

```ts
it("calls once for an unseen notice, and only once per break per page view", async () => {
  const call = vi.fn().mockResolvedValue(undefined); const fired = new Set<string>();
  await markSeenOnce("b1", true, call, fired); await markSeenOnce("b1", true, call, fired);
  expect(call).toHaveBeenCalledTimes(1); expect(call).toHaveBeenCalledWith("b1");
  await markSeenOnce("b2", true, call, fired);
  expect(call).toHaveBeenCalledTimes(2);
});
it("never calls when there is nothing unseen", async () => {
  const call = vi.fn(); await markSeenOnce("b1", false, call, new Set());
  expect(call).not.toHaveBeenCalled();
});
it("a rejected call is swallowed", async () => {
  const call = vi.fn().mockRejectedValue(new Error("offline"));
  await expect(markSeenOnce("b1", true, call, new Set())).resolves.toBeUndefined();
  expect(call).toHaveBeenCalledTimes(1);
});
```

`src/photos/viewer.test.ts`:

```ts
const ctx = { hostId: "h", holderIds: new Set(["u1"]) };
it("anonymous is null; host, holder, admin and others are told apart", () => {
  expect(photoViewer(null, ctx)).toBeNull();
  expect(photoViewer({ id: "h", role: "host" } as Caller, ctx)).toEqual({ id: "h", isHost: true, isHolder: false, isAdmin: false });
  expect(photoViewer({ id: "u1", role: "member" } as Caller, ctx)).toEqual({ id: "u1", isHost: false, isHolder: true, isAdmin: false });
  expect(photoViewer({ id: "a", role: "admin" } as Caller, ctx)).toEqual({ id: "a", isHost: false, isHolder: false, isAdmin: true });
});
it("photoAudience: host wins over holder; anonymous and others are 'other'", () => {
  expect(photoAudience(null)).toBe("other");
  expect(photoAudience({ id: "h", isHost: true, isHolder: true, isAdmin: false })).toBe("host");
  expect(photoAudience({ id: "u1", isHost: false, isHolder: true, isAdmin: false })).toBe("holder");
  expect(photoAudience({ id: "a", isHost: false, isHolder: false, isAdmin: true })).toBe("other");
});
```

`time.test.ts` gains:

```ts
it("formatShortDate gives the month and day in the viewer's zone", () => {
  expect(formatShortDate(new Date("2026-10-21T15:05:00Z"), "America/New_York")).toBe("Oct 21");
  expect(formatShortDate(new Date("2026-10-22T02:00:00Z"), "America/New_York")).toBe("Oct 21");
});
```

- [ ] **Step 5: Run to verify failure, then implement**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec vitest run src/components/photos src/photos/viewer.test.ts src/lib/time.test.ts`
Expected: FAIL (modules missing). Implement `viewer-model.ts`, `prizes-model.ts`, `notice-seen-logic.ts`,
`src/photos/viewer.ts`, `formatShortDate(d: Date, tz: string): string` in `src/lib/time.ts` and the `date` kind in
`LocalTime` (`kind: "deadline" | "datetime" | "date"`; `browserText` calls `formatShortDate`). Run again.
Expected: PASS.

- [ ] **Step 6: Write the failing Prizes block and page-photos tests**

`prizes-block.test.ts` (fixture: three places, the first with two plates, the second with none, the third with one;
one untagged; `count: 4`; helper `block(o)` merging overrides into the fixture):

```ts
it("one row per place in order: word, item name, condition, variants", () => {
  const h = block();
  expect(h.match(/data-testid="prize-place"/g)).toHaveLength(3);
  expect(h.indexOf("Top spot")).toBeLessThan(h.indexOf(">Or<"));
  expect(h.indexOf(">Or<")).toBeLessThan(h.indexOf("2nd place"));
  expect(h.indexOf("Taylor Chronos 24g")).toBeLessThan(h.indexOf("New in box"));
  expect(h).toContain("weight: 18g or 20g");
});
it("a place with no tagged photo shows its name only", () => {
  const row = block().split('data-testid="prize-place"')[2];            // the second place
  expect(row).toContain("Phantom 24g"); expect(row).not.toContain("<img");
});
it("the plates it is given, as 64 px paper plates", () => {
  const first = block().split('data-testid="prize-place"')[1];
  expect(first.match(/<img/g)).toHaveLength(2);
  expect(first.match(/data-size="64"/g)).toHaveLength(2);
  expect(first).toContain('data-surface="paper"');
});
it("'Also in the photos' only when untagged photos exist", () => {
  expect(block()).toContain("Also in the photos"); expect(block({ untagged: [] })).not.toContain("Also in the photos");
});
it("removed photos appear marked 'Removed Oct 21' and are not buttons; none given, no 'Removed'", () => {
  const h = block({ removed: [{ id: "r1", photo: photoSrc, alt: "Old lead", removedIso: "2026-10-21T15:05:00Z", removedFallback: "Oct 21" }] });
  expect(h).toContain("Removed"); expect(h).toContain("Oct 21");
  expect(h.split('data-testid="removed-plate"')[1]).not.toContain("<button");
  expect(block({ removed: [] })).not.toContain("Removed");
});
it("a removed photo whose archive copy is gone keeps its mark with no image", () => {
  const h = block({ removed: [{ id: "r1", photo: null, alt: "", removedIso: "2026-10-21T15:05:00Z", removedFallback: "Oct 21" }] });
  expect(h).toContain("Removed"); expect(h.split('data-testid="removed-plate"')[1]).not.toContain("<img");
});
it("the notice sentence with its time; holders read it first, everyone else last", () => {
  const n: PrizesBlockNotice = { text: "Lead photo replaced", iso: "2026-10-21T15:05:00Z", fallback: "Oct 21, 2026 at 3:05 PM" };
  const holder = block({ notice: n, noticeFirst: true }); const other = block({ notice: n, noticeFirst: false });
  expect(holder).toContain("Lead photo replaced on"); expect(holder).toContain('dateTime="2026-10-21T15:05:00Z"');
  expect(holder.indexOf("Lead photo replaced")).toBeLessThan(holder.indexOf("Top spot"));
  expect(other.indexOf("Lead photo replaced")).toBeGreaterThan(other.indexOf("2nd place"));
  expect(block({ notice: null })).not.toContain("photo-notice-line");
});
it("the block is headed Prizes and is not a <details> fold", () => {
  expect(block()).toContain(">Prizes<"); expect(block()).not.toContain("<details");
});
```

`page-photos.test.ts` (with `createMemoryStorage()` from Task 1; hand-built `BreakPhotos`: `live` = a lead `L` tagged
`A` and an untagged `U`, both in `photos`; `removed` = one `R` with a prefix in `photo-archive`; `notice` = `{ text:
"Lead photo replaced", at: new Date("2026-10-21T15:05:00Z") }`; `unseen: true`; `rows` from the prizes-model fixture).
Audience filtering is tested here and nowhere else (panel ruling 35):

```ts
it("a stranger never gets removed photos or a signed URL, even if breakPhotos returned them", async () => {
  const p = await pagePhotos(storage, withRemoved, rows, { audience: "other", tz: "America/New_York" });
  expect(p.removed).toEqual([]);
  expect(JSON.stringify(p)).not.toMatch(/token=|photo-archive|photos-draft/);
  expect(p.updated).toBe(false);
});
it("a holder gets them with a signed URL and the local-date fallback 'Oct 21'", async () => {
  const p = await pagePhotos(storage, withRemoved, rows, { audience: "holder", tz: "America/New_York" });
  expect(p.removed).toHaveLength(1);
  expect(p.removed[0]).toMatchObject({ id: "R", removedIso: "2026-10-21T15:05:00.000Z", removedFallback: "Oct 21" });
  expect(p.removed[0].photo!.src).toMatch(/token=/);
});
it("the host gets removed photos too; a removed photo the archive dropped has no image", async () => {
  const gone = { ...withRemoved, removed: [{ ...withRemoved.removed[0], prefix: null }] };
  const p = await pagePhotos(storage, gone, rows, { audience: "host", tz: "America/New_York" });
  expect(p.removed[0].photo).toBeNull();
});
it("'updated' needs a holder, a notice and unseen", async () => {
  const at = (audience: PhotoAudience, o: Partial<BreakPhotos> = {}) => pagePhotos(storage, { ...withRemoved, ...o }, rows, { audience, tz: "UTC" });
  expect((await at("host")).updated).toBe(false);
  expect((await at("holder", { unseen: false })).updated).toBe(false);
  expect((await at("holder", { notice: null })).updated).toBe(false);
  expect((await at("holder")).updated).toBe(true);
  expect((await at("holder")).unseen).toBe(true);
});
it("the notice reaches every audience with its time and fallback", async () => {
  for (const audience of ["holder", "host", "other"] as const)
    expect((await pagePhotos(storage, withRemoved, rows, { audience, tz: "America/New_York" })).notice)
      .toEqual({ text: "Lead photo replaced", iso: "2026-10-21T15:05:00.000Z", fallback: "Oct 21, 2026 at 11:05 AM" });
});
it("count, lead and viewer follow live order; the lead is the 160 variant, viewer photos the 1600", async () => {
  const p = await pagePhotos(storage, withRemoved, rows, { audience: "other", tz: "UTC" });
  expect(p.count).toBe(2);
  expect(p.lead!.src).toMatch(/-160\.webp$/);
  expect(p.viewer.map((v) => v.src)).toEqual([expect.stringMatching(/L.*-1600\.webp$/), expect.stringMatching(/U.*-1600\.webp$/)]);
});
it("the last photo removed: count 0, no lead, no viewer photos, the removal sentence kept", async () => {
  const last = { ...withRemoved, live: [], notice: { text: "Top-spot photo removed", at: new Date("2026-10-21T15:05:00Z") } };
  const p = await pagePhotos(storage, last, rows, { audience: "holder", tz: "UTC" });
  expect(p).toMatchObject({ count: 0, lead: null, viewer: [], untagged: [] });
  expect(p.notice!.text).toBe("Top-spot photo removed");   // Review Focus 2
  expect(p.removed).toHaveLength(1);
});
it("the viewer's caption is the tagged place word and item name; untagged photos have none", async () => {
  const p = await pagePhotos(storage, withRemoved, rows, { audience: "other", tz: "UTC" });
  expect(p.viewer.map((v) => v.caption)).toEqual(["Top spot: Taylor Chronos 24g", null]);
});
```

(The expected `notice.fallback` is `formatDateTime`'s output for that instant in New York; if the existing helper words
it differently, the test copies the helper's exact output.)

- [ ] **Step 7: Run to verify failure, then implement the server side**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec vitest run src/components/photos src/photos`
Expected: FAIL. Implement `PrizesBlock` (rulings 4 to 7; headed `<h2>Prizes</h2>`, `data-testid="prizes-block"`; each
place `data-testid="prize-place"`; live plates are plain `<Plate size={64} surface="paper" />` wrapped in
`<span data-viewer-index={k}>` until Task 8b), `pagePhotos` (resolves `photoSrc` in parallel: the lead at 160, viewer
photos at 1600, prize plates at 160, removed at 160; drops `removed` unless the audience is `holder` or `host`; `count`
= live length; `notice.fallback` from `formatDateTime(at, tz)`, removed fallback from `formatShortDate`). Run again.
Expected: PASS.

- [ ] **Step 8: Wire the break page**

- `load.ts`: replace Task 7c's host-only viewer with `photoViewer(caller, { hostId: page.break.hostId, holderIds: new
  Set(page.lines.flatMap((l) => (l.ownerId ? [l.ownerId] : []))) })`, so every viewer of a visible break gets
  `photos`.
- `page.tsx`: `const audience = photoAudience(viewer)`; `const pp = await pagePhotos(photoStorage(), photos,
  placeRows(page.prizes, page.items), { audience, tz: zone.tz })`.
- Title band per ruling 2. With `pp.lead`: `<section>` containing `<div className="flex items-start gap-3">` with the
  `h1` (`mt-3 min-w-0 flex-1`, same classes otherwise) and `<span className="relative mt-1 shrink-0"
  data-testid="photo-plate">` holding `<Plate photo={pp.lead} size={64} surface="board" decorative />` and the count
  strip (`pp.updated ? "Updated" : countText(pp.count)`); then the media row `<p>` unchanged. No lead: today's markup.
- Render `<NoticeSeen breakId={id} unseen={pp.unseen} />` when `audience === "holder"` (it calls
  `markSeenOnce(breakId, unseen, markPhotoNoticeSeenAction)` in an effect and renders null).
- Place `<PrizesBlock places={pp.places} untagged={pp.untagged} removed={pp.removed} notice={pp.notice}
  noticeFirst={audience === "holder"} count={pp.count} />` after the share/host row and before `DetailsFold`; remove
  `prizes={prizeLines(...)}` from `DetailsFold` and its `prizes` prop and list (`prizeLines` stays in `frame-copy.ts`
  while other callers exist).

- [ ] **Step 9: Write the layout tests**

In `e2e/layout.spec.ts`, a second `describe` with its own `beforeAll` creates, with one host whose handle is the
longest allowed and a title of the longest allowed length:

```ts
const longHandleEmail = `${"h".repeat(7)}${run}@e2e.test`;               // 7 + 13 digits: a 20-character handle
const longTitle = "Taylor Chronos 24g ".repeat(7).slice(0, 120);        // 120 characters, the composer's maximum
expect(longHandleEmail.split("@")[0]).toHaveLength(20);
expect(longTitle).toHaveLength(120);
```

`plainLong` (a 50-line break, no photo, via `composeBreak(host, { title: longTitle, lineCount: 50 })`) and `photoLong`
(`composeBreakWithPhotos(host, { title: longTitle, photos: 1, lineCount: 50 })`); the existing buyer claims lines 3
and 9 in `photoLong`.

```ts
test("the plate sits in the title's 76 px band and never wraps the media row (390 and 360)", async ({ browser }) => {
  for (const [w, h] of [[390, 664], [360, 640]] as const) {
    const withPlate = await anonymous(browser, w, h); await withPlate.goto(photoLong);
    const plain = await anonymous(browser, w, h); await plain.goto(plainLong);
    const plate = (await withPlate.getByTestId("photo-plate").boundingBox())!;
    const title = (await withPlate.locator("h1").boundingBox())!;
    const media = (await withPlate.getByTestId("media-row").boundingBox())!;
    expect(plate.width).toBeCloseTo(72, 0); expect(plate.height).toBeCloseTo(72, 0);
    expect(plate.x + plate.width).toBeLessThanOrEqual(w - 16 + 0.5);
    expect(title.x + title.width).toBeLessThanOrEqual(plate.x);                // the title never runs under the plate
    expect(media.y).toBeGreaterThanOrEqual(plate.y + plate.height - 0.5);      // the media row is below the plate, full width
    const mediaPlain = (await plain.getByTestId("media-row").boundingBox())!;
    expect(media.height).toBeCloseTo(mediaPlain.height, 0);                    // the plate did not make it wrap
    expect(media.y).toBeCloseTo(mediaPlain.y, 0);                              // the band is the same 76 px: nothing moved down
    const legendA = (await withPlate.getByTestId("legend").boundingBox())!; const legendB = (await plain.getByTestId("legend").boundingBox())!;
    expect(legendA.y).toBeCloseTo(legendB.y, 0);
  }
});
test("the board, legend and 'You have …' line stay above the bar at 390 × 664 with a plate (holder)", async ({ browser }) => {
  const page = await signedInMobile(browser, `${buyerHandle}@e2e.test`, 390, 664); await page.goto(photoLong);
  const legend = (await page.getByRole("list", { name: "What the cells mean" }).boundingBox())!;
  const line = (await page.getByTestId("you-have").boundingBox())!; const bar = (await page.locator("[data-sticky-bar]").boundingBox())!;
  expect(legend.y + legend.height).toBeLessThanOrEqual(bar.y);
  expect(line.y + line.height).toBeLessThanOrEqual(bar.y);
  const grid = (await page.locator("[data-grid-rows]").first().boundingBox())!;
  expect(grid.y + grid.height).toBeLessThanOrEqual(legend.y);
});
test("at 360 × 640 the legend sits at the fold with a plate, as without one", async ({ browser }) => {
  const page = await anonymous(browser, 360, 640); await page.goto(photoLong);
  expect((await page.getByTestId("legend").boundingBox())!.y).toBeLessThanOrEqual(640);
});
test("a stranger reads the count on the plate, and the Prizes block replaces the prize list in Details", async ({ browser }) => {
  const page = await anonymous(browser, 390, 664); await page.goto(photoLong);
  await expect(page.getByTestId("photo-plate")).toContainText("1 photo");
  await expect(page.getByTestId("photo-plate")).not.toContainText("Updated");
  await expect(page.getByTestId("prizes-block").getByRole("heading", { name: "Prizes" })).toBeVisible();
  await expect(page.getByTestId("prize-place")).toHaveCount(1);
  await expect(page.getByTestId("removed-plate")).toHaveCount(0);
});
test("a break with no photo has no plate and no empty Prizes plates", async ({ browser }) => {
  const page = await anonymous(browser, 390, 664); await page.goto(plainLong);
  await expect(page.getByTestId("photo-plate")).toHaveCount(0);
  await expect(page.getByTestId("prizes-block").getByTestId("plate")).toHaveCount(0);
});
```

(`signedInMobile` is a local helper like the existing "You have" test's context setup. "Updated" for a holder is
pinned by `page-photos.test.ts` and Task 12b's journey. If 390 × 664 does not hold with a plate by a pixel or two, the
plate geometry changes, not the budget: report the measured numbers.)

- [ ] **Step 10: Run the layout e2e**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && /usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm exec playwright test e2e/layout.spec.ts` (sandbox off)
Expected: PASS.

- [ ] **Step 11: Gates and commit**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec tsc --noEmit && pnpm lint && pnpm test`, then
the full e2e on `breaks_e2e` (`/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test:e2e`, sandbox off).
Expected: all green, no warnings; the copy audit passes ("Updated", "Removed", the notice sentences, "Also in the
photos").

```bash
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH
git add src/components/photos src/photos src/lib/time.ts src/lib/time.test.ts src/components/local-time.tsx src/components/break/details-fold.tsx "src/app/b/[id]/load.ts" "src/app/b/[id]/page.tsx" e2e/layout.spec.ts
git commit -m "feat(photos): break page plate and Prizes block"
```

**Reviewer: Opus.** Focus: (a) no photo, no change: a break without photos renders the title section it does today,
and `DetailsFold` loses only the prize list; (b) a stranger, the feed and anonymous viewers get no removed photo, no
archive path and no signed URL in the HTML or the RSC payload (view-source check on a break with a removed photo);
(c) the 390 × 664 budget numbers are unchanged with the plate (the band is 76 px); (d) `Plate`'s sizes and data
attributes match panel ruling 36; (e) every new string passes the copy audit and "Updated" never reads as a
verification claim.

---

### Task 8b: Photo viewer (model: Sonnet)

Spec §8.3 (viewer); Mosaic §11. Review Focus 5 lives here.

**Decision: how the viewer opens (spec §8.3 offers "invoker commands where supported, falling back to a dynamic
import").** This plan uses **one path: a client button that does a dynamic import on the first tap**, and preloads
the chunk on `pointerenter`, `focus` and `touchstart`. Reason: an invoker button (`command="show-modal" commandfor=…`)
needs a `<dialog>` already in the page, and the dialog's behaviour (arrows, announcement, focus return, the strip) is
client code; so the invoker path still needs the dynamic import to bring the code in, and would add a second path (no
Safari before 26, no Firefox before 144 at the time of writing) with a dialog shell in every `/b/[id]` response for
nothing. One path keeps the first load free of the viewer, which is the goal the sentence serves, and is what the e2e
below checks (no extra script before the tap, no 1600 px request before the tap).

**Rulings for this task:**
1. **Plates open the viewer**: every live plate (lead, prize plates, "Also in the photos") is a `ViewerButton` for
   that photo's index in `live` order. The lead's name is `plateButtonName(count, updated)`; the others are
   `Photo K of N`. Removed plates are not buttons. `ViewerButton` takes a `testId` prop rendered as `data-testid`
   (panel ruling 36); it has no padding or border of its own, so the 72 px plate box is unchanged.
2. **The viewer's `<dialog>`** carries `data-testid="photo-viewer"` and the marker attribute `data-photo-viewer-root`.
   No other module contains the string `data-photo-viewer-root` (Task 12a's budget check scans first-load chunks for it).

**Files:**
- Create: `src/components/photos/viewer-root.tsx` (client: `ViewerRoot`, `ViewerButton`),
  `src/components/photos/viewer-root.test.ts`, `src/components/photos/photo-viewer.tsx` (client, loaded only by dynamic
  import)
- Modify: `src/components/photos/prizes-block.tsx`, `src/components/photos/prizes-block.test.ts` (live plates become
  `ViewerButton`s), `src/app/b/[id]/page.tsx` (`ViewerRoot`, the lead button)
- Create: `e2e/photos.spec.ts` (the viewer tests; Task 12b appends the journeys to it)

**Interfaces:**
- Consumes: Task 8a's `Plate`, `ViewerPhoto`, `positionText`, `viewerCaption`, `neighbours`, `countText`,
  `plateButtonName`, `PagePhotos`, `PrizesBlock`; Task 7a's `composeBreakWithPhotos`; `gotoReady`, `loginAs`
  (`e2e/helpers.ts`); `AxeBuilder` (`@axe-core/playwright`); the scroll lock and `onCancel` pattern of
  `src/components/sheet.tsx`.
- Produces:
  ```ts
  // viewer-root.tsx (client; ViewerButton renders a plain button outside a ViewerRoot)
  export function ViewerRoot(p: { photos: ViewerPhoto[]; children: React.ReactNode }): React.ReactElement;
  export function ViewerButton(p: { index: number; name: string; testId?: string; className?: string; children: React.ReactNode }): React.ReactElement;
  // photo-viewer.tsx (client, loaded via next/dynamic, ssr: false)
  export function PhotoViewer(p: { photos: ViewerPhoto[]; index: number; onIndex(i: number): void; onClose(): void; opener: HTMLElement | null }): React.ReactElement;
  ```
  Test ids: `photo-plate` (now the lead button), `photo-viewer`, `viewer-strip`, `viewer-prev`, `viewer-next`,
  `viewer-announce`.

- [ ] **Step 1: Write the failing viewer-root and Prizes block button tests**

`viewer-root.test.ts`:

```ts
const photo: PhotoSrc = { src: "https://x.test/photos/a-160.webp", srcSet: "https://x.test/photos/a-160.webp 160w", width: 640, height: 480, alt: "Chronos" };
it("the lead plate is a button named 'Prize photos, 5' that shows '5 photos' and holds a decorative image", () => {
  const h = html(createElement(ViewerButton, { index: 0, name: plateButtonName(5, false), testId: "photo-plate" },
    createElement(Plate, { photo, size: 64, surface: "board", decorative: true }), createElement("span", null, countText(5))));
  expect(h).toContain('aria-label="Prize photos, 5"'); expect(h).toContain('type="button"');
  expect(h).toContain('data-testid="photo-plate"'); expect(h).toContain("5 photos"); expect(h).toContain('alt=""');
});
it("a holder with an unseen change gets 'Prize photos, 5, updated'", () => {
  expect(html(createElement(ViewerButton, { index: 0, name: plateButtonName(5, true) }, "Updated"))).toContain('aria-label="Prize photos, 5, updated"');
});
it("without a testId the button carries no data-testid", () => {
  expect(html(createElement(ViewerButton, { index: 1, name: "Photo 2 of 5" }, "x"))).not.toContain("data-testid");
});
it("the first render ships no viewer: no dialog", () => {
  const h = html(createElement(ViewerRoot, { photos: [{ ...photo, caption: null }] }, createElement(ViewerButton, { index: 0, name: "Prize photos, 1" }, "x")));
  expect(h).not.toContain("<dialog"); // the marker string itself lives only in photo-viewer.tsx (ruling 2)
});
```

`prizes-block.test.ts` gains:

```ts
it("live plates are buttons named 'Photo K of N'; removed plates are not", () => {
  const h = block({ removed: [{ id: "r1", photo: photoSrc, alt: "Old lead", removedIso: "2026-10-21T15:05:00Z", removedFallback: "Oct 21" }] });
  expect(h).toContain('aria-label="Photo 1 of 4"'); expect(h).toContain('aria-label="Photo 4 of 4"');
  expect(h.match(/aria-label="Photo \d of 4"/g)).toHaveLength(4);
  expect(h.split('data-testid="removed-plate"')[1]).not.toContain("<button");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec vitest run src/components/photos`
Expected: FAIL (`viewer-root` missing; no buttons in the block).

- [ ] **Step 3: Implement `ViewerRoot`, `ViewerButton` and the block's buttons**

`ViewerRoot` holds `{ open, index, opener }` in context and renders the viewer through `next/dynamic(() =>
import("./photo-viewer").then((m) => m.PhotoViewer), { ssr: false })` only once opened. `ViewerButton` renders
`<button type="button" aria-label={name} data-testid={testId}>`; it calls the same `import()` on `pointerenter`,
`focus` and `touchstart` to warm the chunk, and sets `aria-busy` between the tap and the chunk; outside a root it
renders the plain button. In `prizes-block.tsx` each live plate's `<span data-viewer-index>` becomes `<ViewerButton
index={k} name={\`Photo ${k + 1} of ${count}\`}>`. Run again. Expected: PASS.

- [ ] **Step 4: Implement the viewer (`photo-viewer.tsx`, client)**

A native `<dialog data-testid="photo-viewer" data-photo-viewer-root>` opened with `showModal()` in an effect (the
pattern of `src/components/sheet.tsx`: `onCancel` prevents default and calls `onClose`; the page's scroll lock set and
released). Content: a header with the "Close" button (44 px) and the visible caption (`viewerCaption(photo.caption,
index, count)`); a horizontal scroll-snap strip (`data-testid="viewer-strip"`, `snap-x snap-mandatory
overflow-x-auto`, one slide per photo, `w-full shrink-0 snap-center`, `object-contain`, `max-h` of the dialog so a
320 px width and a landscape phone fit with no sideways page scroll; `motion-safe:scroll-smooth` only); `Previous
photo` and `Next photo` buttons (`viewer-prev`, `viewer-next`), 44 × 44 px minimum, **not rendered** where
`neighbours` gives null (focus moves to the remaining button when the focused one disappears); ArrowLeft and
ArrowRight on the dialog; a visually hidden `role="status"` `aria-live="polite"` (`data-testid="viewer-announce"`)
that reads `positionText` on every change, whether by button, key or swipe (an `IntersectionObserver`, threshold 0.6,
drives `onIndex` for swipes). Images: the current photo and its two neighbours load eagerly, the rest
`loading="lazy"`, `srcSet` from each `ViewerPhoto`, `sizes="100vw"`. On open the strip scrolls to `index` (no
animation); on close, focus returns to `opener`. Reduced motion: no smooth scrolling and no zoom (there is none).
Then check the marker's single home:

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && grep -rl "data-photo-viewer-root" src`
Expected: exactly `src/components/photos/photo-viewer.tsx`.

- [ ] **Step 5: Wire the break page**

In `src/app/b/[id]/page.tsx`: wrap the page's content in `<ViewerRoot photos={pp.viewer}>` when `pp.count > 0`, and
replace Task 8a's `<span data-testid="photo-plate">` with `<ViewerButton index={0} name={plateButtonName(pp.count,
pp.updated)} testId="photo-plate" className="relative mt-1 shrink-0">` around the same `Plate` and count strip.

- [ ] **Step 6: Write the viewer e2e (Review Focus 5)**

`e2e/photos.spec.ts` (new; serial; `beforeAll` logs in one host `pv${run}@e2e.test` and composes `viewer3` with 3
photos and `viewer1` with 1 through `composeBreakWithPhotos`; `open(page, n)` clicks the button named `Prize photos, n`
and waits for `photo-viewer` to be visible):

```ts
test("nothing of the viewer loads before the tap: no extra script, no 1600 px image", async ({ page }) => {
  const images: string[] = []; page.on("request", (r) => { if (/-1600\.webp/.test(r.url())) images.push(r.url()); });
  await gotoReady(page, viewer3);
  const scripts = () => page.evaluate(() => performance.getEntriesByType("resource").filter((e) => (e as PerformanceResourceTiming).initiatorType === "script" || e.name.endsWith(".js")).length);
  const before = await scripts(); expect(images).toEqual([]);
  expect(await page.locator("[data-photo-viewer-root]").count()).toBe(0);
  await page.getByRole("button", { name: "Prize photos, 3" }).click();
  await expect(page.getByTestId("photo-viewer")).toBeVisible();
  await expect(page.locator("[data-photo-viewer-root]")).toHaveCount(1);
  expect(await scripts()).toBeGreaterThan(before);
  await expect.poll(() => images.length).toBeGreaterThan(0);
});
test("by keyboard: open, arrows, ends hide Previous and Next, Escape returns focus to the plate", async ({ page }) => {
  await gotoReady(page, viewer3);
  const plate = page.getByRole("button", { name: "Prize photos, 3" }); await plate.focus(); await page.keyboard.press("Enter");
  await expect(page.getByTestId("viewer-announce")).toHaveText("Photo 1 of 3");
  await expect(page.getByTestId("viewer-prev")).toHaveCount(0);
  await page.keyboard.press("ArrowRight"); await expect(page.getByTestId("viewer-announce")).toHaveText("Photo 2 of 3");
  await expect(page.getByTestId("viewer-prev")).toBeVisible();
  await page.keyboard.press("ArrowRight"); await expect(page.getByTestId("viewer-next")).toHaveCount(0);
  await page.keyboard.press("Escape"); await expect(page.getByTestId("photo-viewer")).toBeHidden(); await expect(plate).toBeFocused();
});
test("one photo: no Previous or Next; Close and Escape both close", async ({ page }) => {
  await gotoReady(page, viewer1);
  const plate = page.getByRole("button", { name: "Prize photos, 1" });
  await open(page, 1);
  await expect(page.getByTestId("viewer-announce")).toHaveText("Photo 1 of 1");
  await expect(page.getByTestId("viewer-prev")).toHaveCount(0); await expect(page.getByTestId("viewer-next")).toHaveCount(0);
  await page.getByRole("button", { name: "Close" }).click(); await expect(page.getByTestId("photo-viewer")).toBeHidden();
  await open(page, 1); await page.keyboard.press("Escape");
  await expect(page.getByTestId("photo-viewer")).toBeHidden(); await expect(plate).toBeFocused();
});
test("Previous, Next and Close are at least 44 px", async ({ page }) => {
  await gotoReady(page, viewer3); await open(page, 3); await page.keyboard.press("ArrowRight");
  for (const b of [page.getByTestId("viewer-prev"), page.getByTestId("viewer-next"), page.getByRole("button", { name: "Close" })]) {
    const box = (await b.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
test("a Prizes plate opens the viewer at its own photo", async ({ page }) => {
  await gotoReady(page, viewer3);
  await page.getByTestId("prizes-block").getByRole("button", { name: "Photo 2 of 3" }).click();
  await expect(page.getByTestId("viewer-announce")).toHaveText("Photo 2 of 3");
});
for (const [w, h] of [[320, 568], [667, 375]] as const) {
  test(`the photo fits at ${w} × ${h} with no sideways scroll`, async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true })).newPage();
    await gotoReady(page, viewer3); await open(page, 3);
    const img = page.getByTestId("viewer-strip").locator("img").first();
    await expect(img).toBeVisible();
    const m = await page.evaluate(() => {
      const d = document.querySelector("[data-testid=photo-viewer]")!;
      return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, dsw: d.scrollWidth, dcw: d.clientWidth };
    });
    expect(m.sw).toBeLessThanOrEqual(m.iw); expect(m.dsw).toBeLessThanOrEqual(m.dcw);
    const box = (await img.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(-0.5); expect(box.y).toBeGreaterThanOrEqual(-0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(w + 0.5); expect(box.y + box.height).toBeLessThanOrEqual(h + 0.5);
  });
}
test("reduced motion: the strip does not scroll smoothly; without it, it does", async ({ browser }) => {
  const behaviour = async (reducedMotion: "reduce" | "no-preference") => {
    const page = await (await browser.newContext({ reducedMotion })).newPage();
    await gotoReady(page, viewer3); await open(page, 3);
    return page.getByTestId("viewer-strip").evaluate((e) => getComputedStyle(e).scrollBehavior);
  };
  expect(await behaviour("reduce")).toBe("auto");
  expect(await behaviour("no-preference")).toBe("smooth");
});
test("axe is clean on a break page with photos, with the viewer closed and open", async ({ page }) => {
  const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
  await gotoReady(page, viewer3);
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  await open(page, 3);
  expect((await new AxeBuilder({ page }).withTags(tags).include("[data-testid=photo-viewer]").analyze()).violations).toEqual([]);
});
```

- [ ] **Step 7: Run the e2e**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && /usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm exec playwright test e2e/layout.spec.ts e2e/photos.spec.ts` (sandbox off)
Expected: PASS (the layout tests still pass with the plate now a button).

- [ ] **Step 8: Gates, the first-load check and commit**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec tsc --noEmit && pnpm lint && pnpm test`, the
full e2e on `breaks_e2e` (`/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test:e2e`, sandbox off), then
`pnpm build` and confirm the viewer is not in `/b/[id]`'s first load: `grep -l "data-photo-viewer-root"
.next/static/chunks/*.js` lists a chunk, and that chunk's file name is absent from the page's HTML for a break with
photos. Task 12a restores the numeric measurement and holds the allowance.
Expected: all green, no warnings; the copy audit passes ("Prize photos, N", "Previous photo", "Next photo").

```bash
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH
git add src/components/photos "src/app/b/[id]/page.tsx" e2e/photos.spec.ts
git commit -m "feat(photos): a lazily loaded photo viewer opened from every plate"
```

**Reviewer: Opus.** Focus: (a) the viewer's code and the 1600 px images load only after the first tap, and
`data-photo-viewer-root` lives in `photo-viewer.tsx` alone; (b) Escape and Close return focus to the opener; (c) the
buttons vanish at the ends and focus moves to the remaining one; (d) 320 px and a landscape phone fit with no sideways
scroll; (e) wrapping the lead plate in `ViewerButton` changed no layout number.

---
### Task 9: Other surfaces (model: Sonnet; Reviewer: Opus)

Spec §8.1 (feed card and host profile cards), §8.4 (pay sheet, result page, /me, /host), §6 (the /me notice sentence),
§8.0 (plate rules), decision 6 (the card still shows fill). A break without a photo renders exactly as today on every
surface. Photos on these surfaces are decorative (`alt=""`): each sits beside the break's title in text. The result
page is the exception that is not decorative: it shows the same Prizes block as the break page, inside the same
`ViewerRoot`, so its plates open the viewer (ruling 35).

**Files:**
- Create: `src/photos/lead-srcs.ts` (one helper: lead photos to `PhotoSrc`, shared by the feed, landing, profile and /host)
- Create: `src/components/host/host-break-row.tsx` (the /host row, extracted so it can be render-tested)
- Create: `src/components/break/pay-break-header.tsx` (plate and title at the top of the pay sheet)
- Modify: `src/components/break-card.tsx`, `src/app/breaks/page.tsx`, `src/app/page.tsx`, `src/app/h/[handle]/page.tsx`
- Modify: `src/components/me/my-break-card.tsx`, `src/components/me/me-copy.ts` (`MyBreakCardProps`), `src/app/me/card-props.ts`, `src/app/me/page.tsx`
- Modify: `src/app/host/page.tsx`
- Modify: `src/components/break/pay-sheet.tsx`, `src/components/break/break-interactive.tsx`, `src/app/b/[id]/page.tsx` (one line: pass `lead`)
- Modify: `src/app/b/[id]/result/page.tsx` (Prizes block and `ViewerRoot`), `src/photos/viewer.ts` (adds `photoAudience`)
- Test: `src/photos/lead-srcs.test.ts`, `src/components/break-card.test.ts` (new), `src/components/me/my-break-card.test.ts`, `src/app/me/card-props.test.ts`, `src/components/host/host-break-row.test.ts`, `src/components/break/pay-break-header.test.ts`, `src/photos/page-photos.test.ts` (Task 8a's file; this task appends the result page's audience cases)

`PrizesBlock` itself is not modified: it has no `frozen` prop (ruling 35). It renders whatever `pagePhotos` resolved, so
who sees what is decided, and tested, in `pagePhotos` and `photoViewer`.

**Interfaces:**
- Consumes:
  - Task 5: `leadPhotos(tx, breakIds): Promise<Map<string, PhotoView>>` (public locations only) and
    `breakPhotos(tx, breakId, viewer): Promise<BreakPhotos>`.
  - Task 6: `photoSrc(storage, view, size): Promise<PhotoSrc>`. Task 1: `photoStorage(): PhotoStorage`, `createMemoryStorage()`.
  - Task 8a (ruling 36): `Plate({ photo, size: 40 | 48 | 64 | 96, surface, decorative? })`, whose root carries
    `data-testid="plate"`, `data-size` and `data-surface` (each pinned by `plate.test.ts`) and whose `<img>` has
    `alt=""` when `decorative`. Size 96 is Task 8a's; this task only uses it.
  - Task 8a: `PrizesBlock({ places, untagged, removed, notice, noticeFirst })` (no `frozen` prop),
    `pagePhotos(storage, photos, rows, { audience, tz })`, `placeRows(prizes, items)`, and
    `photoViewer(caller: Caller | null, ctx: { hostId: string; holderIds: ReadonlySet<string> }): { id: string; isHost: boolean; isHolder: boolean; isAdmin: boolean } | null`
    in `src/photos/viewer.ts` (ruling 19), used by the break page.
  - Task 8b: `ViewerRoot({ photos: ViewerPhoto[]; children })`, the lazily loaded viewer behind it.
  - Existing: `KitThumb({ cells, kit, heat, size })` and `kitThumbCells`; `formatDateTime`, `LocalTime` (as the result page uses them).
- Produces:
  - `leadSrcs(storage: PhotoStorage, leads: ReadonlyMap<string, PhotoView>, size: VariantWidth): Promise<Map<string, PhotoSrc>>`
    in `src/photos/lead-srcs.ts`. Throws if any view's `location` is not `"photos"`: a surface that is public by
    construction must never be handed a draft or archive path.
  - `photoAudience(v: ReturnType<typeof photoViewer>): "host" | "holder" | "other"` in `src/photos/viewer.ts` (`host`
    when `isHost`, else `holder` when `isHolder`, else `other`; `null` is `other`). If Task 8a already exports an
    equivalent, use it and skip the export; the break page and the result page use the same one either way.
  - `BreakCard({ b, cells, photo? }: { b: FeedBreak; cells: ThumbCell[]; photo?: PhotoSrc | null })`. Test ids: `card-media`
    (the 108 px slot, with or without a photo), `thumb` (existing, now 96 px alone or 48 px in the corner), `plate`.
  - `MyBreakCardProps` gains `photo: PhotoSrc | null` and `photoNotice: { text: string; iso: string; fallback: string } | null`.
    `toCardProps(g, now, zone, flight, photos?: { photo: PhotoSrc | null; notice: { text: string; at: Date } | null })`.
    Test id `my-photo-notice`.
  - `HostBreakRow({ b, photo }: { b: HostBreakRow-shaped row of listHostBreaks; photo: PhotoSrc | null })` (a server component, the `<li>` of today's /host list).
  - `PayBreakHeader({ title, photo }: { title: string; photo: PhotoSrc | null })`: renders `null` without a photo; test id `pay-break`.
  - `PaySheet` gains `breakTitle: string; photo?: PhotoSrc | null`; `BreakInteractiveProps` gains `lead: PhotoSrc | null`.

- [ ] **Step 1: Write the failing test for `leadSrcs`**

`src/photos/lead-srcs.test.ts`, using `createMemoryStorage()` (Task 1) and a `view(id, location, prefix)` builder for
`PhotoView`. Every prefix is a valid `PREFIX_PATTERN` prefix: a uuid break id and a 22-character random part.

```ts
const B = "00000000-0000-4000-8000-0000000000b1";
const P = `${B}/Zq3_x-9KpL2mN8vR4tY7wA`; // 22 url-safe characters after the slash
it("prefix fixture is valid (guards the tests below)", () => expect(PREFIX_PATTERN.test(P)).toBe(true));
it("maps each break id to public srcset URLs without touching Storage", async () => {
  const storage = createMemoryStorage();
  const spy = vi.spyOn(storage, "signedReadUrl");
  const m = await leadSrcs(storage, new Map([[B, view("p1", "photos", P)]]), 160);
  expect([...m.keys()]).toEqual([B]);
  expect(m.get(B)!.src).toBe(publicVariantUrl(P, 160));
  expect(m.get(B)!.src).toMatch(/\/storage\/v1\/object\/public\/photos\/00000000-0000-4000-8000-0000000000b1\/Zq3_x-9KpL2mN8vR4tY7wA-160\.webp$/);
  expect(m.get(B)!.srcSet).toContain("-640.webp 640w");
  expect(JSON.stringify([...m])).not.toMatch(/token=|sign/);
  expect(spy).not.toHaveBeenCalled();
});
it("refuses a lead that is not in the public bucket", async () => {
  for (const loc of ["photos-draft", "photo-archive"] as const)
    await expect(leadSrcs(createMemoryStorage(), new Map([[B, view("p1", loc, P)]]), 160)).rejects.toThrow(/public/);
});
it("returns an empty map for no leads", async () => expect((await leadSrcs(createMemoryStorage(), new Map(), 160)).size).toBe(0));
```

- [ ] **Step 2: Run it to see it fail**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/photos/lead-srcs.test.ts`
Expected: FAIL, `leadSrcs` is not defined (the prefix-fixture test passes: it guards the fixture, not the code).

- [ ] **Step 3: Implement `leadSrcs` in `src/photos/lead-srcs.ts`**

Loop over the entries, throw `new Error("lead photos are public only")` on a non-`photos` location, else `photoSrc(storage, v, size)`.

- [ ] **Step 4: Run it to see it pass, then commit**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/photos/lead-srcs.test.ts`
Expected: PASS.

```bash
git add src/photos/lead-srcs.ts src/photos/lead-srcs.test.ts
git commit -m "feat(photos): resolve lead photos to public srcsets for card surfaces"
```

- [ ] **Step 5: Write the failing render tests for the feed card**

`src/components/break-card.test.ts` (`renderToStaticMarkup(createElement(BreakCard, …))`, as `kit-thumb.test.ts` renders). Fixtures: a `FeedBreak` with id `b1`, title "Chronos 22g", `open` 12, `linePriceCents` 500, host `@jim`, kit `{ dark: "blue", light: "yellow" }`, `heat: 0`; `cells` of 50 `ThumbCell`s (10 paid, 28 taken, 12 open, in number order); `photo: PhotoSrc` with `alt: "Chronos 22g"`. The plate's size and data attributes are Task 8a's (ruling 36); these tests read them, they do not define them.

```ts
describe("BreakCard (spec §8.1)", () => {
  // Regression pin: passes before this task (no photo prop yet) and must keep passing.
  it("without a photo is exactly today's card: one 96 px kit thumbnail, no plate", () => {
    const h = card({ photo: null });
    expect(h).not.toContain('data-testid="plate"');
    expect(h).toContain('data-testid="thumb"');
    expect(h).toContain("width:108px");            // size 96 + the 6 px frame on each side
    expect(h).toBe(card({}));                      // photo undefined and photo null render the same
  });
  it("with a photo leads with a decorative 96 px board-surface plate in the thumbnail's slot", () => {
    const h = card({ photo });
    expect(h).toMatch(/data-testid="plate"[^>]*data-size="96"/);
    expect(h).toContain('data-surface="board"');
    expect(h).toContain('alt=""');
    expect(h).not.toContain('alt="Chronos 22g"');  // the caption names the break
    expect(h).toContain('data-testid="card-media"');
  });
  it("still shows how full the break is: a 48 px kit board in the corner with every cell, and N to go in the caption", () => {
    const h = card({ photo });
    expect(h.match(/data-testid="thumb"/g)).toHaveLength(1);
    expect(h).toContain("width:60px");             // size 48 + 12
    expect(h.match(/data-tone="paid"/g)).toHaveLength(10);
    expect(h.match(/data-tone="taken"/g)).toHaveLength(28);
    expect(h.match(/data-tone="open"/g)).toHaveLength(12);
    expect(h).not.toContain("data-place");         // the feed lists open breaks, so no won cell reaches a card thumbnail
    expect(h).toContain("12 to go");
  });
  it("keeps the board's language off the photo: the plate carries no kit variable, lamp or flight", () => {
    const plate = card({ photo }).match(/<span[^>]*data-testid="plate"[\s\S]*?<\/span>/)![0];
    expect(plate).not.toMatch(/--kit-|board-lamp|data-flight|--fc/);
  });
  // Regression pin: the card link exists today; the photo must not take it over.
  it("still links the whole card to the break", () => expect(card({ photo })).toContain('href="/b/b1"'));
});
```

- [ ] **Step 6: Run them to see them fail**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/components/break-card.test.ts`
Expected: FAIL on the three photo tests (no `photo` prop; no `plate`); the two regression pins pass.

- [ ] **Step 7: Implement the card in `src/components/break-card.tsx`**

New optional prop `photo?: PhotoSrc | null`. Without it, render today's `<KitThumb … size={96} />` untouched. With it, replace
that element by `<span data-testid="card-media" className="relative block shrink-0">` of the same 108 px width and height
holding `<Plate photo={photo} size={96} surface="board" decorative />` and, positioned at the bottom-right corner, `<KitThumb
cells={kitThumbCells(cells)} kit={b.kit} heat={b.heat} size={48} />`. The corner board covers the plate's corner and nothing
else: it sits inside the slot (so the caption never moves between cards with and without a photo). The exact offset is the
builder's (spec §12); the e2e in Task 12b measures that the two boxes intersect and that the board covers at most a third of the
plate's area.

- [ ] **Step 8: Feed, landing and profile pages pass the photo**

In each of `src/app/breaks/page.tsx`, `src/app/page.tsx` (the "Open now" cards only; the hero is unchanged) and
`src/app/h/[handle]/page.tsx` (inside `loadProfile`'s transaction, the profile's `open` cards): add
`leads: await leadPhotos(tx, rows.map((r) => r.id))` to the transaction's result, and after it
`const srcs = await leadSrcs(photoStorage(), leads, 160)`; render `<BreakCard … photo={srcs.get(b.id) ?? null} />`. The
hero's `KitThumb` and the profile's record board stay as they are.

- [ ] **Step 9: Run the card tests and the existing feed tests**

Run (sandbox off: the feed test uses the database): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/components/break-card.test.ts src/domain/breaks/feed.test.ts src/components/kit-thumb.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/components/break-card.tsx src/components/break-card.test.ts src/app/breaks/page.tsx src/app/page.tsx "src/app/h/[handle]/page.tsx"
git commit -m "feat(ui): lead photo on feed and profile cards with a corner kit board"
```

- [ ] **Step 11: Write the failing tests for /me**

In `src/app/me/card-props.test.ts`:

```ts
it("carries the lead photo and no notice when none is pending", () => {
  const p = toCardProps(group, now, zone, flight, { photo, notice: null });
  expect(p.photo).toBe(photo);
  expect(p.photoNotice).toBeNull();
});
it("turns a pending notice into a sentence with the viewer's local time", () => {
  const at = new Date("2026-10-21T18:40:00Z");
  const p = toCardProps(group, now, zone, flight, { photo, notice: { text: "Lead photo replaced", at } });
  expect(p.photoNotice).toEqual({ text: "Lead photo replaced", iso: at.toISOString(), fallback: formatDateTime(at, zone.tz, zone.labelled) });
});
it("sets both photo fields to null for a break with no photos", () => {
  const p = toCardProps(group, now, zone, flight);
  expect([p.photo, p.photoNotice]).toEqual([null, null]);
});
```

In `src/components/me/my-break-card.test.ts` (same `html()` helper; `owing` gains `photo: null, photoNotice: null`):

```ts
// Regression pin: the card has no plate or notice today; null props must keep it that way.
it("without a photo shows no plate and no notice", () => {
  const h = html(owing);
  expect(h).not.toContain('data-testid="plate"');
  expect(h).not.toContain('data-testid="my-photo-notice"');
});
it("with a photo shows a decorative 40 px paper-surface plate beside the title", () => {
  const h = html({ ...owing, photo });
  expect(h).toMatch(/data-testid="plate"[^>]*data-size="40"/);
  expect(h).toContain('data-surface="paper"');
  expect(h).toContain('alt=""');
});
it("shows the notice sentence with its time until the holder has seen it, as a polite status", () => {
  const h = html({ ...owing, photo, photoNotice: { text: "Lead photo replaced", iso: "2026-10-21T18:40:00.000Z", fallback: "2:40 pm today" } });
  expect(h).toMatch(/data-testid="my-photo-notice"[^>]*role="status"|role="status"[^>]*data-testid="my-photo-notice"/);
  expect(h).toMatch(/data-testid="my-photo-notice"[^>]*>[^<]*Lead photo replaced/);
  expect(h).toContain("2:40 pm today");
});
it("shows the notice even when the last photo was removed (no plate, the sentence stays)", () => {
  const h = html({ ...owing, photo: null, photoNotice: { text: "Top-spot photo removed", iso: "2026-10-21T18:40:00.000Z", fallback: "2:40 pm today" } });
  expect(h).not.toContain('data-testid="plate"');
  expect(h).toContain("Top-spot photo removed");
});
```

- [ ] **Step 12: Run them to see them fail**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/app/me/card-props.test.ts src/components/me/my-break-card.test.ts`
Expected: FAIL on every new test except the labelled regression pin.

- [ ] **Step 13: Implement /me**

- `me-copy.ts`: add the two fields to `MyBreakCardProps` (above).
- `card-props.ts`: `toCardProps` takes the optional fifth argument and sets `photo` and `photoNotice` (`null` when absent).
- `my-break-card.tsx`: the title row becomes `<div flex items-start gap-3>` with `<Plate photo={p.photo} size={40} surface="paper" decorative />` first when `p.photo` is set, then the title link and pill as now. The notice is `<p data-testid="my-photo-notice" role="status" className="text-small">{text}, <LocalTime iso fallback kind="datetime" />.</p>` placed directly under the title row, before the cells. Pass `breakTitle={p.title} photo={p.photo}` to its `PaySheet`.
- `me/page.tsx`: for each current (not `earlier`) group, in the same transaction, `breakPhotos(tx, g.breakId, { id: caller.id, isHost: false, isHolder: true, isAdmin: false })`; the plate is `live[0]` resolved with `photoSrc(photoStorage(), live[0], 160)` (a holder's lead is public once the break is open, so this is a public URL), the notice is `notice` only while `unseen`. `/me` never writes `photo_notices_seen`: the break page does, when the holder opens it.

- [ ] **Step 14: Run the /me tests, then commit**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/app/me src/components/me`
Expected: PASS.

```bash
git add src/app/me src/components/me
git commit -m "feat(me): lead photo plate and the unseen photo notice on each card"
```

- [ ] **Step 15: Write the failing tests for /host and the pay sheet**

`src/components/host/host-break-row.test.ts` (the component is new, so every test fails until it exists):

```ts
it("is today's row without a photo", () => {
  const h = row({ photo: null });
  expect(h).not.toContain('data-testid="plate"');
  expect(h).toContain('href="/b/b1"');
});
it("shows a 40 px paper plate beside the title with a photo", () => {
  const h = row({ photo });
  expect(h).toMatch(/data-testid="plate"[^>]*data-size="40"/);
  expect(h).toContain('data-surface="paper"');
  expect(h).toContain('alt=""');
});
it("sends a draft to its editor and a live break to its page, with or without a photo", () => {
  expect(row({ status: "draft", photo })).toContain('href="/host/b1/edit"');
  expect(row({ status: "open", photo })).toContain('href="/b/b1"');
});
```

`src/components/break/pay-break-header.test.ts`:

```ts
it("renders nothing without a photo: the pay sheet is unchanged", () => expect(render({ title: "Chronos", photo: null })).toBe(""));
it("shows a 40 px paper plate beside the break's title", () => {
  const h = render({ title: "Chronos", photo });
  expect(h).toContain('data-testid="pay-break"');
  expect(h).toContain("Chronos");
  expect(h).toMatch(/data-testid="plate"[^>]*data-size="40"/);
  expect(h).toContain('alt=""');
});
```

- [ ] **Step 16: Run them to see them fail**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/components/host src/components/break/pay-break-header.test.ts`
Expected: FAIL (the modules do not exist).

- [ ] **Step 17: Implement /host and the pay sheet**

- `host-break-row.tsx`: move the `<li>` block of `src/app/host/page.tsx` into it unchanged and add the plate (`40`, `paper`, `decorative`) to the left of the title line when `photo` is set, so the link's content is `flex gap-3`. `host/page.tsx` loads `leadPhotos(tx, rows.map((r) => r.id))` in its transaction and `leadSrcs(photoStorage(), …, 160)` after it; a draft's photos are in the private bucket, so a draft row shows no plate (the draft editor has the strip).
- `pay-break-header.tsx`: `<div data-testid="pay-break" className="flex items-center gap-3">` with the plate and the title (`font-semibold`, `min-w-0`, two lines at most), null without a photo.
- `pay-sheet.tsx`: props `breakTitle: string; photo?: PhotoSrc | null`; render `<PayBreakHeader title={p.breakTitle} photo={p.photo ?? null} />` as the first child of the body's `space-y-4` div. `break-interactive.tsx`: prop `lead: PhotoSrc | null`, passed as `photo={p.lead}` with `breakTitle={p.title}`; `src/app/b/[id]/page.tsx` passes the lead Task 8a already resolved for the plate (`pp.lead`, the same `PhotoSrc`, 160 variant).

- [ ] **Step 18: Run them, then commit**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/components/host src/components/break`
Expected: PASS.

```bash
git add src/components/host src/components/break src/app/host/page.tsx "src/app/b/[id]/page.tsx"
git commit -m "feat(ui): lead photo plate on the host dashboard rows and the pay sheet"
```

- [ ] **Step 19: Write the failing audience tests for the result page**

The result page reuses Task 8a's `photoViewer` and `pagePhotos`; what it adds is who counts as a holder of a drawn
break (the distinct `ownerId`s of `res.entries`) and the mapping from that viewer to an audience. Append to
`src/photos/page-photos.test.ts`, reusing that file's `storage`, `withRemoved` (two live photos and one removed photo,
removed on 2026-10-21) and `rows` fixtures:

```ts
describe("the result page's audience (Task 9; spec §8.4)", () => {
  const HOST: Caller = { id: "00000000-0000-4000-8000-0000000000a1", role: "host", onboarded: true, banned: false };
  const HOLDER: Caller = { id: "00000000-0000-4000-8000-0000000000a2", role: "member", onboarded: true, banned: false };
  const STRANGER: Caller = { id: "00000000-0000-4000-8000-0000000000a3", role: "member", onboarded: true, banned: false };
  const ctx = { hostId: HOST.id, holderIds: new Set([HOLDER.id]) }; // the distinct ownerIds of res.entries
  const tz = "America/New_York";

  it("maps viewers to audiences: host, holder, everyone else", () => {
    expect(photoAudience(photoViewer(HOST, ctx))).toBe("host");
    expect(photoAudience(photoViewer(HOLDER, ctx))).toBe("holder");
    expect(photoAudience(photoViewer(STRANGER, ctx))).toBe("other");
    expect(photoAudience(photoViewer(null, ctx))).toBe("other");
  });
  it("a holder of the drawn break sees the removed photo, dated, through a signed URL", async () => {
    const p = await pagePhotos(storage, withRemoved, rows, { audience: photoAudience(photoViewer(HOLDER, ctx)), tz });
    expect(p.removed).toHaveLength(1);
    expect(p.removed[0].removedFallback).toBe("Oct 21");
    expect(p.removed[0].photo!.src).toContain("token=");
    expect(p.count).toBe(2);
  });
  it("a stranger, signed in or not, sees the live photos and nothing removed", async () => {
    for (const caller of [STRANGER, null]) {
      const p = await pagePhotos(storage, withRemoved, rows, { audience: photoAudience(photoViewer(caller, ctx)), tz });
      expect(p.removed).toEqual([]);
      expect(p.count).toBe(2);
      expect(p.viewer).toHaveLength(2);
      expect(JSON.stringify(p)).not.toMatch(/token=|photo-archive|Removed/);
    }
  });
});
```

- [ ] **Step 20: Run them to see them fail**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/photos/page-photos.test.ts`
Expected: FAIL: `photoAudience` is not exported (if Task 8a already exports an equivalent under another name, use that
name in the tests; they then pass at once and are labelled a regression pin in a comment above the `describe`).

- [ ] **Step 21: Implement `photoAudience` and wire the result page**

`photoAudience` in `src/photos/viewer.ts` as in Interfaces; the break page switches to it if it computed the audience
inline.

In `src/app/b/[id]/result/page.tsx`, inside the existing `db.transaction` that loads `res` and `page`:
`viewer = photoViewer(caller, { hostId: page.break.hostId, holderIds: new Set(res.entries.map((e) => e.ownerId)) })`
and `photos = await breakPhotos(tx, id, viewer)`. After the transaction (no Storage call inside it):
`pp = await pagePhotos(photoStorage(), photos, placeRows(page.prizes, page.items), { audience: photoAudience(viewer), tz: zone.tz })`.
Render `<PrizesBlock places={pp.places} untagged={pp.untagged} removed={pp.removed} notice={pp.notice} noticeFirst={photoAudience(viewer) === "holder"} />`
inside the `after` fragment directly below the `full-order` list, with the same `h2` weight as "Full order", and wrap
the page's content in `<ViewerRoot photos={pp.viewer}>` when `pp.count > 0`, exactly as the break page does, so the
result page's plates open the same viewer. The board, the reveal, the caller banner, Replay, Share and Technical details
do not change, and no plate appears in the banner or the reveal. A break with no photos renders today's result page
plus the Prizes block's place names.

- [ ] **Step 22: Run the tests**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/photos src/components/photos`
Expected: PASS.

- [ ] **Step 23: Gates**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: all clean and green.
Then the existing e2e, which must pass unchanged because no break in it has a photo:
`export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; /usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test:e2e`
Expected: PASS on `breaks_e2e`.

- [ ] **Step 24: Commit**

```bash
git add "src/app/b/[id]/result/page.tsx" "src/app/b/[id]/page.tsx" src/photos/viewer.ts src/photos/page-photos.test.ts
git commit -m "feat(result): the Prizes block below the full order, its plates opening the viewer"
```

**Reviewer: Opus.** Focus: (a) a break without photos renders every surface as today; (b) `leadSrcs` is the only path
from `leadPhotos` to the card surfaces and refuses any non-public location; (c) the result page shows a removed photo to
the host and holders only, and no signed URL or archive path reaches a stranger's HTML or RSC payload; (d) no plate in
the caller banner or the reveal.

---
### Task 10: Link preview photo (model: Opus)

Spec §8.4 "Link preview", Mosaic §6 (the preview shapes for no viewer and carries no holder, handle or flight). The lead
photo joins the preview as a plate: beside the board and the caption, the board unchanged on the left. On a ran break
the board with its bulls stays the hero and the plate is smaller. The route never lets the renderer fetch anything: it
builds the one URL it may fetch from `SUPABASE_URL` and the `photos` bucket, checks the prefix, fetches with a timeout
and a byte cap, and passes a data URI. Any failure renders the preview without the photo; it never fails the preview,
and that includes a failure of the `leadPhotos` read itself (ruling 31): it falls back to no photo, never a 404.

**WebP in the renderer (rulings 15 and 31, applied here with no BLOCKED stop).** Satori may not decode WebP. Step 9's
probe test settles it once: if a WebP data URI draws, `OG_PHOTO_FORMAT` is `"webp"`; if it does not (an error from
`ImageResponse`, or no red box while the plate's `<img>` is in the tree), `OG_PHOTO_FORMAT` is `"png"` and
`leadPhotoDataUri` transcodes the fetched 640 variant to PNG with sharp before building the data URI
(`sharp(buf, { limitInputPixels: 12_000_000, failOn: "error" }).timeout({ seconds: 8 }).png()`). No new stored variant,
no bucket type change. The PNG path is tested whichever format is chosen. sharp then loads in the preview route, so
Task 6's "sharp bundled only with finalise" check names `/b/[id]/og` too (ruling 31); the route runs on Node
(`export const runtime = "nodejs"`, explicit).

Layout values (my call within §8.0 and §8.4; the plate is the paper plate ×2, like the frame):
- The plate sits at the top of the text column, above the title, left-aligned. Image square, `objectFit: "cover"`,
  inside a 6 px `--board-wall-2` mat (`TOKENS.boardWall2`) and a 2 px `--board-steel` keyline (`TOKENS.boardSteel`).
- Image side: `OG_PLATE_PX = 200` for every status except `drawn`, `OG_PLATE_RAN_PX = 120` for `drawn`.
- While a plate shows, the column gap drops from 28 to 20 px and the title stops at two lines (same 60/44 px sizes).
- Nothing in the board column changes; the plate never enters it (x ≥ `GRID_PX + 2 * PAD` = 628).

**Files:**
- Modify: `src/domain/breaks/og.ts`, `src/domain/breaks/og.test.ts`
- Create: `src/app/b/[id]/og/photo.ts`, `src/app/b/[id]/og/photo.test.ts`
- Modify: `src/app/b/[id]/og/route.tsx`, `src/app/b/[id]/og/route-failure.test.ts`, `src/app/b/[id]/og/route.test.ts`
- Modify: `src/app/b/[id]/og/image.tsx`, `src/app/b/[id]/og/image.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `PREFIX_PATTERN`, `publicVariantUrl(prefix, 640)`, `VariantWidth`.
  - Task 4: `sharp` (tests, to make fixtures and read pixels back; and `photo.ts`'s PNG transcode, loaded by a dynamic
    `import("sharp")` only on that path).
  - Task 6: the bundling check that lists which routes may bundle sharp (ruling 31 adds the preview route).
  - Task 5: `leadPhotos(tx, breakIds): Promise<Map<string, PhotoView>>`, `PhotoView`, `issueUploadTicket`,
    `recordProcessedPhoto`, `removePhoto`, `hidePhoto`; `SYSTEM` from `src/domain/types.ts`.
  - Task 2: `claimLines` sets `breaks.first_claimed_at`.
- Produces:
  - `src/domain/breaks/og.ts`:
    - `type OgPhoto = { id: string; prefix: string }`;
    - `OgModel` gains `photo: OgPhoto | null`;
    - `OgPage` gains `lead?: Pick<PhotoView, "id" | "prefix" | "location"> | null`;
    - `ogModel` sets `photo` to `{ id, prefix }` only when `lead.location === "photos"`, else `null`.
  - `src/app/b/[id]/og/photo.ts`:
    - `OG_PHOTO_TIMEOUT_MS = 2000`, `OG_PHOTO_MAX_BYTES = 512 * 1024`;
    - `OG_PHOTO_FORMAT: "webp" | "png"` (set in Step 11 from the probe; see above);
    - `toPngDataUri(webp: Buffer): Promise<string | null>`: the sharp transcode (`limitInputPixels: 12_000_000`,
      `failOn: "error"`, `.timeout({ seconds: 8 })`), null on any error. Never throws;
    - `leadPhotoDataUri(breakId: string, prefix: string, opts?: { fetcher?: typeof fetch; timeoutMs?: number; format?: "webp" | "png" }): Promise<string | null>`
      (`format` defaults to `OG_PHOTO_FORMAT`). Never throws.
  - `src/app/b/[id]/og/image.tsx`: `OG_PLATE_PX = 200`, `OG_PLATE_RAN_PX = 120`, `ogImage(m: OgModel, photo: string | null = null)` (the data URI; `m.photo` alone draws nothing).
  - `GET /b/{id}/og`: contract unchanged (1200 × 630 PNG, `public, max-age=300, s-maxage=300`, 404 for drafts, no session);
    a failed lead read or photo fetch still answers the PNG without the photo.

- [ ] **Step 1: Write the failing model tests**

In `src/domain/breaks/og.test.ts`:

1. Every expected key list `["caption", "cells", "columns", "heat", "hostedBy", "kit", "title"]` (the tests "has no
   flight key" and "carries only what a stranger may see") becomes
   `["caption", "cells", "columns", "heat", "hostedBy", "kit", "photo", "title"]`. The `toEqual` of "draws the grid as an
   anonymous viewer sees it" gains `photo: null`.

2. Add, pure (no database):

```ts
describe("the lead photo (photos spec §8.4)", () => {
  const P = "00000000-0000-4000-8000-0000000000b1/AAAAAAAAAAAAAAAAAAAAAA";
  const lead = (location: PhotoLocation) => ({ id: "00000000-0000-4000-8000-0000000000c1", prefix: P, location });
  it("carries a published lead as its id and prefix only", () => {
    const m = ogModel({ ...page(lines), lead: lead("photos") }, now)!;
    expect(m.photo).toEqual({ id: "00000000-0000-4000-8000-0000000000c1", prefix: P });
    expect(Object.keys(m.photo!).sort()).toEqual(["id", "prefix"]);
  });
  it("is null for a draft or an archived location, and with no lead", () => {
    expect(ogModel({ ...page(lines), lead: lead("photos-draft") }, now)!.photo).toBeNull();
    expect(ogModel({ ...page(lines), lead: lead("photo-archive") }, now)!.photo).toBeNull();
    expect(ogModel({ ...page(lines), lead: null }, now)!.photo).toBeNull();
    expect(ogModel(page(lines), now)!.photo).toBeNull();
  });
  // Regression pin: true before this task; the photo must not bring a holder, handle or flight in.
  it("still has no holder, handle or flight anywhere, photo or not", () => {
    const text = JSON.stringify(ogModel({ ...page(lines), lead: lead("photos") }, now));
    expect(text).not.toMatch(/alice|pink|slim|flight|holder|owner|handle/);
    expect(text).not.toContain(ALICE);
  });
});
```

3. Add, against the database (`withTx`, `makeUser`, `openBreakWithLines`, `makeBreak`, `claimLines` from the existing
   helpers). Callers are built as Task 5's tests build them: `const as = (id: string, role: Caller["role"] = "host"): Caller => ({ id, role, onboarded: true, banned: false })`.
   A local helper `addPhoto(tx, host, breakId, location)` calls `issueUploadTicket` then `recordProcessedPhoto` with
   `prefix = \`${breakId}/${randomBytes(16).toString("base64url")}\``, `location` (`"photos"` for an open break,
   `"photos-draft"` for a draft: the database refuses a location that does not match the break's status, ruling 7),
   `width: 1600, height: 1200, slot: null, alt: "Darts"`, and returns `{ photoId }`.
   `preview(tx, breakId)` is `ogModel({ ...(await getBreakPage(tx, breakId))!, lead: (await leadPhotos(tx, [breakId])).get(breakId) ?? null }, now)`.

```ts
describe("the lead photo as the preview reads it (photos spec §8.4: hidden, removed, draft)", () => {
  it("shows the live lead of an open break", async () => withTx(async (tx) => {
    const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const { photoId } = await addPhoto(tx, host, b.id, "photos");
    expect((await preview(tx, b.id))!.photo?.id).toBe(photoId);
  }));
  it("drops a hidden lead, and the next live photo leads", async () => withTx(async (tx) => {
    const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const first = await addPhoto(tx, host, b.id, "photos");
    const second = await addPhoto(tx, host, b.id, "photos");
    await hidePhoto(tx, SYSTEM, { photoId: first.photoId, reason: "test", now });
    expect((await preview(tx, b.id))!.photo?.id).toBe(second.photoId);
    await hidePhoto(tx, SYSTEM, { photoId: second.photoId, reason: "test", now });
    expect((await preview(tx, b.id))!.photo).toBeNull();
  }));
  it("drops a lead the host removed, before and after the first claim", async () => withTx(async (tx) => {
    const host = await makeUser(tx, { role: "host" });
    const buyer = await makeUser(tx);
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const early = await addPhoto(tx, host, b.id, "photos");
    expect((await removePhoto(tx, as(host.id), { photoId: early.photoId, now })).archive).toBe(false);
    expect((await preview(tx, b.id))!.photo).toBeNull();
    await claimLines(tx, as(buyer.id, "member"), { breakId: b.id, numbers: [1], batchId: randomUUID() });
    const late = await addPhoto(tx, host, b.id, "photos");
    expect((await preview(tx, b.id))!.photo?.id).toBe(late.photoId);
    expect((await removePhoto(tx, as(host.id), { photoId: late.photoId, now })).archive).toBe(true);
    expect((await preview(tx, b.id))!.photo).toBeNull();
  }));
  it("has no preview at all for a draft, whose photos are in photos-draft", async () => withTx(async (tx) => {
    const host = await makeUser(tx, { role: "host" });
    const b = await makeBreak(tx, { hostId: host.id, status: "draft" });
    await addPhoto(tx, host, b.id, "photos-draft");
    expect((await leadPhotos(tx, [b.id])).has(b.id)).toBe(false);
    expect(await preview(tx, b.id)).toBeNull();
  }));
});
```

- [ ] **Step 2: Run them to see them fail**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/domain/breaks/og.test.ts`
Expected: FAIL: the key lists lack `photo`, `OgPage` has no `lead`.

- [ ] **Step 3: Add `photo` to the model**

In `src/domain/breaks/og.ts`, add `OgPhoto`, `OgPage.lead`, `OgModel.photo` as in Interfaces. `ogModel` copies only
`id` and `prefix`, and only when `lead?.location === "photos"`; the location never leaves the function. Update the
`OgModel` doc comment: the photo is a published file's id and prefix, nothing else.

- [ ] **Step 4: Run the model tests**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/domain/breaks/og.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing fetch tests**

`src/app/b/[id]/og/photo.test.ts`, no database. `B` is a uuid, `P = \`${B}/${"A".repeat(22)}\``, `URL640 = publicVariantUrl(P, 640)`.
`webp` is a real 640 × 480 WebP made with `sharp({ create: { width: 640, height: 480, channels: 3, background: "#ff0000" } }).webp().toBuffer()`.
`fetcher` is a `vi.fn` returning `new Response(body, { headers })`.

```ts
describe("leadPhotoDataUri (photos spec §8.4)", () => {
  it("fetches the 640 variant from the photos bucket under SUPABASE_URL, without redirects, and returns a WebP data URI", async () => {
    const f = vi.fn(async () => new Response(webp, { headers: { "content-type": "image/webp" } }));
    const uri = await leadPhotoDataUri(B, P, { fetcher: f, format: "webp" });
    expect(uri).toBe(`data:image/webp;base64,${webp.toString("base64")}`);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`${env().SUPABASE_URL}/storage/v1/object/public/photos/${P}-640.webp`);
    expect(init).toMatchObject({ redirect: "error" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([
    ["traversal", `${B}/../../photo-archive/x`],
    ["another break's photo", `${randomUUID()}/${"A".repeat(22)}`],
    ["21 characters", `${B}/${"A".repeat(21)}`],
    ["an encoded slash", `${B}/AAAAAAAAAAAAAAAAAAA%2F`],
    ["a full URL", "https://evil.example/x.webp"],
    ["empty", ""],
  ])("refuses a malformed prefix (%s) without fetching", async (_, prefix) => {
    const f = vi.fn();
    expect(await leadPhotoDataUri(B, prefix, { fetcher: f })).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it("gives up after the timeout", async () => {
    const hang = vi.fn((_: unknown, init: RequestInit) => new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason))));
    const t0 = Date.now();
    expect(await leadPhotoDataUri(B, P, { fetcher: hang, timeoutMs: 50 })).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
  });
  it("refuses a body past the byte cap, by header and by stream", async () => {
    const big = Buffer.alloc(OG_PHOTO_MAX_BYTES + 1, 1);
    expect(await leadPhotoDataUri(B, P, { fetcher: async () => new Response(big, { headers: { "content-type": "image/webp", "content-length": String(big.length) } }) })).toBeNull();
    // No content-length: the stream is cut at the cap (a ReadableStream body, so no length header is set).
    const stream = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(64 * 1024)); } });
    expect(await leadPhotoDataUri(B, P, { fetcher: async () => new Response(stream, { headers: { "content-type": "image/webp" } }) })).toBeNull();
  });
  it("refuses a failed status, a network error and bytes that are not WebP", async () => {
    expect(await leadPhotoDataUri(B, P, { fetcher: async () => new Response("no", { status: 404 }) })).toBeNull();
    expect(await leadPhotoDataUri(B, P, { fetcher: async () => { throw new TypeError("fetch failed"); } })).toBeNull();
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } }).png().toBuffer();
    expect(await leadPhotoDataUri(B, P, { fetcher: async () => new Response(png, { headers: { "content-type": "image/webp" } }) })).toBeNull();
  });
});

describe("the PNG fallback (rulings 15 and 31): tested whichever OG_PHOTO_FORMAT the probe chose", () => {
  it("with format png, returns a PNG data URI of the same picture", async () => {
    const f = vi.fn(async () => new Response(webp, { headers: { "content-type": "image/webp" } }));
    const uri = (await leadPhotoDataUri(B, P, { fetcher: f, format: "png" }))!;
    expect(uri.startsWith("data:image/png;base64,")).toBe(true);
    const meta = await sharp(Buffer.from(uri.split(",")[1], "base64")).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 640, 480]);
    const { data } = await sharp(Buffer.from(uri.split(",")[1], "base64")).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([255, 0, 0]);
  });
  it("still checks the WebP magic before transcoding", async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } }).png().toBuffer();
    expect(await leadPhotoDataUri(B, P, { fetcher: async () => new Response(png, { headers: { "content-type": "image/webp" } }), format: "png" })).toBeNull();
  });
  it("refuses a WebP past 12 megapixels (limitInputPixels) and a corrupt one, without throwing", async () => {
    const huge = await sharp({ create: { width: 4000, height: 4000, channels: 3, background: "#ff0000" } }).webp().toBuffer();
    expect(huge.length).toBeLessThan(OG_PHOTO_MAX_BYTES); // so it is the pixel limit that refuses it, not the byte cap
    expect(await toPngDataUri(huge)).toBeNull();
    const corrupt = Buffer.concat([webp.subarray(0, 64), Buffer.alloc(64)]);
    expect(await toPngDataUri(corrupt)).toBeNull();
  });
  it("with format webp, never loads the transcode (the data URI is the fetched bytes)", async () => {
    const f = vi.fn(async () => new Response(webp, { headers: { "content-type": "image/webp" } }));
    expect(await leadPhotoDataUri(B, P, { fetcher: f, format: "webp" })).toBe(`data:image/webp;base64,${webp.toString("base64")}`);
  });
});
```

The first test of the first `describe` passes `format: "webp"` explicitly, so it holds whichever default Step 11 picks.

- [ ] **Step 6: Run them to see them fail**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test 'src/app/b/\[id\]/og/photo.test.ts'`
Expected: FAIL: `./photo` does not exist.

- [ ] **Step 7: Implement `leadPhotoDataUri` in `src/app/b/[id]/og/photo.ts`**

Order: `PREFIX_PATTERN.test(prefix)` and `prefix.startsWith(\`${breakId}/\`)`, else null; `url = publicVariantUrl(prefix, 640)`
and assert it starts with `` `${env().SUPABASE_URL}/storage/v1/object/public/photos/` `` (belt over Task 1); fetch with
`{ signal: AbortSignal.timeout(timeoutMs), redirect: "error", cache: "no-store" }`; require `ok`; refuse a
`content-length` over the cap before reading; read `body` chunk by chunk and cancel the reader once the total passes
`OG_PHOTO_MAX_BYTES`; require the WebP magic (`RIFF` at 0, `WEBP` at 8); then, for `format` `"webp"`, return the base64
WebP data URI, and for `"png"`, return `toPngDataUri(bytes)`. `toPngDataUri` does `const { default: sharp } = await import("sharp")`
and `sharp(buf, { limitInputPixels: 12_000_000, failOn: "error" }).timeout({ seconds: 8 }).png().toBuffer()` in its own
`try/catch`. One `try/catch` around the whole of `leadPhotoDataUri` returns null on anything thrown. No logging of the
URL. Start with `export const OG_PHOTO_FORMAT = "webp" as const`; Step 11 may change it.

- [ ] **Step 8: Run the fetch tests**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test 'src/app/b/\[id\]/og/photo.test.ts'`
Expected: PASS.

- [ ] **Step 9: Write the failing image tests**

In `src/app/b/[id]/og/image.test.ts` (the existing `model()` helper gains `photo: null` in its defaults). `RED` is a
`data:image/webp;base64,` URI of a 640 × 480 pure red WebP (sharp, as Step 5); `RED_PNG` the same picture as a
`data:image/png;base64,` URI; `REDS = { webp: RED, png: RED_PNG }`, and `PLATE = REDS[OG_PHOTO_FORMAT]` is what the
geometry tests draw, so they hold whichever format Step 11 picks. `redBox(png)` decodes the PNG with
`sharp(png).raw()` and returns the bounding box `{ x0, y0, x1, y1 }` of pixels with `r > 240 && g < 20 && b < 20`, or null.

```ts
describe("the lead photo plate (photos spec §8.0, §8.4)", () => {
  const render = async (o: Partial<OgModel>, photo: string | null) =>
    Buffer.from(await new ImageResponse(ogImage(model(o), photo), { ...OG_SIZE, fonts: ogFonts() }).arrayBuffer());
  it("draws the format leadPhotoDataUri hands it (OG_PHOTO_FORMAT), with no fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await redBox(await render({ photo: { id: "x", prefix: "y" } }, PLATE))).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("draws a PNG data URI (the fallback path)", async () => {
    expect(await redBox(await render({ photo: { id: "x", prefix: "y" } }, RED_PNG))).not.toBeNull();
  });
  it("is a 200 px square beside the board on an open break, never in the board column", async () => {
    const box = (await redBox(await render({ ...STATUSES.open, photo: { id: "x", prefix: "y" } }, PLATE)))!;
    expect([box.x1 - box.x0 + 1, box.y1 - box.y0 + 1]).toEqual([OG_PLATE_PX, OG_PLATE_PX]);
    expect(box.x0).toBeGreaterThanOrEqual(GRID_PX + 2 * 64 + 8); // past the column, mat and keyline included
  });
  it("is smaller on a ran break, where the board and its bulls stay in front", async () => {
    const box = (await redBox(await render({ ...STATUSES.ran, photo: { id: "x", prefix: "y" } }, PLATE)))!;
    expect(box.x1 - box.x0 + 1).toBe(OG_PLATE_RAN_PX);
    expect(box.x0).toBeGreaterThanOrEqual(GRID_PX + 2 * 64 + 8);
  });
  it("draws no plate without a data URI, even when the model names a photo", async () => {
    expect(await redBox(await render({ photo: { id: "x", prefix: "y" } }, null))).toBeNull();
  });
  it("keeps the title to two lines while a plate shows", () => {
    const T = "x".repeat(80); // over 40 characters, so 44 px
    const titleNode = (photo: string | null) =>
      find(expand(ogImage(model({ title: T, photo: { id: "x", prefix: "y" } }), photo)), (e) => e.props.children === T)[0];
    expect(titleNode(PLATE).props.style.maxHeight).toBe(Math.ceil(44 * 1.1 * 2));
    expect(titleNode(null).props.style.maxHeight).toBe(Math.ceil(44 * 1.1 * 3));
  });
});
```

The existing per-status and kit PNG loop also renders each status once with `PLATE` (and writes
`${status}-${kitName}-photo.png` under `OG_PREVIEW=1` for the by-eye check; never committed).

- [ ] **Step 10: Run them to see them fail**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test 'src/app/b/\[id\]/og/image.test.ts'`
Expected: FAIL: `ogImage` ignores a second argument, `OG_PLATE_PX` is not exported.

- [ ] **Step 11: Draw the plate in `ogImage(m, photo)`, then settle the format**

Values from the layout list above. The plate renders only when both `m.photo` and `photo` are set. The `<img>` has
`width`/`height` equal to the plate side and `style.objectFit = "cover"`; no tint, no filter, no border radius.

Then run the image tests with `OG_PHOTO_FORMAT = "webp"`. If the probe test ("draws the format leadPhotoDataUri hands it")
fails while "draws a PNG data URI" passes, Satori cannot draw WebP: set `OG_PHOTO_FORMAT = "png"` in `photo.ts` (ruling 15,
no BLOCKED stop), add a one-line comment above it saying why, and say so in the task report. If both fail, the plate
itself is wrong: fix the plate, not the format.

- [ ] **Step 12: Run the image tests**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test 'src/app/b/\[id\]/og/image.test.ts' 'src/app/b/\[id\]/og/photo.test.ts'`
Expected: PASS (the image tests and, with the chosen format, the fetch tests). Then
`export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && OG_PREVIEW=1 pnpm test 'src/app/b/\[id\]/og/image.test.ts'` and look at the `-photo.png` files in
`.superpowers/og-preview/`: the plate clear of the frame, the caption unclipped, the ran board unchanged.

- [ ] **Step 13: Write the failing route tests**

In `src/app/b/[id]/og/route-failure.test.ts` (no database; mocks as today), with these changes to the mocks:
- The fonts mock gains a third mode, `"real"`, the default for the new `describe` (`beforeEach(() => { fonts = "real"; })`):
  it returns `(await vi.importActual<typeof import("./fonts")>("./fonts")).ogFonts()`, read once at the top of the file.
  Today's `"ok"` mode returns bytes that are not a font, so nothing renders a 200 under it; the two existing tests keep
  their modes and their 404 expectations.
- `@/domain/photos/queries` is mocked with `leadPhotos: vi.fn(async (_tx, ids: string[]) => new Map([[ids[0], { id: "p1", prefix: \`${ids[0]}/${"A".repeat(22)}\`, location: "photos" }]]))`.
- The `ogModel` mock reflects the lead it is given, as the real one does:
  `ogModel: (page: OgPage): OgModel => ({ …today's fields, photo: page.lead ? { id: page.lead.id, prefix: prefixOverride ?? page.lead.prefix } : null })`,
  with a `let prefixOverride: string | null = null` the malformed-prefix case sets.
- `fetch` is stubbed with `vi.stubGlobal`; `afterEach(() => { vi.unstubAllGlobals(); prefixOverride = null; })`.

```ts
describe("GET /b/{id}/og when the lead photo cannot be had (photos spec §8.4)", () => {
  it("answers the PNG without the photo when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const r = await get(ID);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(r.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
  });
  it("answers the PNG without the photo when the body is past the cap", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Buffer.alloc(OG_PHOTO_MAX_BYTES + 1), { headers: { "content-type": "image/webp" } })));
    expect((await get(ID)).status).toBe(200);
  });
  it("fetches nothing for a malformed prefix, and still answers the PNG", async () => {
    prefixOverride = "../photo-archive/x";
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    expect((await get(ID)).status).toBe(200);
    expect(f).not.toHaveBeenCalled();
  });
  it("makes exactly one fetch, to the 640 variant, when the photo is fine", async () => {
    const f = vi.fn(async () => new Response(webp, { headers: { "content-type": "image/webp" } })); vi.stubGlobal("fetch", f);
    expect((await get(ID)).status).toBe(200);
    expect(f.mock.calls.map((c) => String(c[0]))).toEqual([publicVariantUrl(`${ID}/${"A".repeat(22)}`, 640)]);
  });
  it("answers the PNG without the photo when the lead read itself fails (ruling 31), and fetches nothing", async () => {
    vi.mocked(leadPhotos).mockRejectedValueOnce(new Error("connection reset"));
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    const r = await get(ID);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(f).not.toHaveBeenCalled();
  });
});
```

In `src/app/b/[id]/og/route.test.ts`, add two tests (a local `addPhoto` copied from Step 1, with its `location`; `breakPhotos` from `@/db/schema`, `eq` from `drizzle-orm`):

```ts
it("draws an open break's live lead: one fetch, to its 640 variant", async () => withTx(async (tx) => {
  current = tx;
  const host = await makeUser(tx, { role: "host" });
  const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
  const { photoId } = await addPhoto(tx, host, b.id, "photos");
  const [{ path }] = await tx.select({ path: breakPhotos.path }).from(breakPhotos).where(eq(breakPhotos.id, photoId));
  const f = vi.fn(async () => new Response(webp, { headers: { "content-type": "image/webp" } })); vi.stubGlobal("fetch", f);
  const r = await get(b.id);
  expect(r.status).toBe(200);
  expect(f.mock.calls.map((c) => String(c[0]))).toEqual([publicVariantUrl(path!, 640)]);
}));
// Regression pin: drafts already answer 404; the photo must not change that.
it("still answers 404 for a draft with a photo, and fetches nothing", async () => withTx(async (tx) => {
  current = tx;
  const host = await makeUser(tx, { role: "host" });
  const b = await makeBreak(tx, { hostId: host.id, status: "draft" });
  await addPhoto(tx, host, b.id, "photos-draft");
  const f = vi.fn(); vi.stubGlobal("fetch", f);
  expect((await get(b.id)).status).toBe(404);
  expect(f).not.toHaveBeenCalled();
}));
```

`afterEach(() => vi.unstubAllGlobals())`.

- [ ] **Step 14: Run them to see them fail**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test 'src/app/b/\[id\]/og/'`
Expected: FAIL: the route reads no lead and never fetches.

- [ ] **Step 15: Wire the route**

In `route.tsx`, after the existing transaction has found the page and before `ogModel`, read the lead in a transaction
of its own, wrapped so a failure is no photo (ruling 31): a failed statement inside the page's transaction would abort
it, and the existing catch would answer 404.

```ts
const lead = found ? await db.transaction((tx) => leadPhotos(tx, [id])).then((m) => m.get(id) ?? null, () => null) : null;
const m = found ? ogModel({ ...found.page, lead }, new Date(), found.draw) : null;
```

After `ogModel`: `photo = m.photo ? await leadPhotoDataUri(id, m.photo.prefix) : null`, outside any transaction, then
`ogImage(m, photo)`. Add `export const runtime = "nodejs"`. The doc comment gains: the only network call is the lead's
640 variant on the project's own Storage host; the renderer gets a data URI; a failed lead read or fetch draws the
preview without the photo.

- [ ] **Step 16: Run the OG suite and the gates**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test 'src/app/b/\[id\]/og/' src/domain/breaks/og.test.ts && pnpm exec tsc --noEmit && pnpm lint`
Expected: PASS, no type errors, no lint warnings. If `OG_PHOTO_FORMAT` is `"png"`, also run Task 6's sharp bundling
check (`pnpm build`, then the check as Task 6 wrote it) and confirm it lists `/b/[id]/og` beside the finalise route.

- [ ] **Step 17: Commit**

```bash
git add src/domain/breaks/og.ts src/domain/breaks/og.test.ts 'src/app/b/[id]/og/'
git commit -m "feat(og): show the lead photo as a plate in the link preview"
```

---

### Task 11: Cleanup cron and the hide script (model: Opus)

Spec §5.6 (cleanup), §10 (hiding, purge, cache window, response target, revoking a host). A daily route runs
`runPhotoCleanup`. It never runs storage calls inside a transaction: each batch reads in one short transaction, calls
Storage with none open, then writes in another short one. The job's lock is a transaction-scoped advisory lock held by
a holder transaction that does nothing else while the work runs on other connections. A session lock would not hold:
`src/db/client.ts` runs through a transaction-mode pooler with no session state. Every rule is idempotent: removing a
missing file is not an error, and a crash between a row update and its file removal is finished by the next run (the
files are then orphans that rule 2 removes).

**Cleanup never deletes the last copy (ruling 25).** A row *relies on* a prefix `P` when its `path = P` and it is live
(`removed_at` and `hidden_at` null) or its bucket is `photo-archive` (removed after a claim, or hidden). A row removed
before any claim relies on nothing: nobody may see it, and its files are due to go. Every deletion, in every rule, goes
through one gate, `deleteIfSafe`:
1. Before deleting any object under `P`, re-read **in a fresh transaction** (a new `run`, never the batch's read) every
   `break_photos` row naming `P`, in any state.
2. For each row relying on `P`, with its own bucket `B`: if `B` lacks a variant that another bucket holds, copy it into
   `B` first (`PhotoStorage.copy`, which re-puts an existing destination so its age is fresh), and delete nothing under
   `P` in this run; the next run finds `B` complete.
3. Never delete from a bucket that is the only one holding a prefix some row relies on, and never delete from a row's
   own bucket while it relies on `P`.
Write transactions lock each break first: `lockBreak(tx, id)` for each break the batch touches, in ascending id order,
before touching its rows. A deleted draft, which `lockBreak` treats as not found (ruling 12), is locked with
`select id from breaks where id = $1 for update` instead (only its tickets remain). Every write that changes a photo row
calls `allowPhotoModeration(tx)` first (ruling 10): the break may be frozen (drawing, drawn, cancelled).

The rules, in order (each a loop of batches of `batchSize`, default 100):
1. **Incoming**: `incoming` objects with `createdAt < now − 24 h`; `photo_uploads` rows with `consumed_at is null` and
   `expires_at < now − 24 h` are deleted. Consumed tickets stay (history).
2. **Orphans** in `photos`, `photos-draft` and `photo-archive`, objects older than 24 h. An object's prefix comes from
   its name (`^(.+)-(160|640|1600)\.webp$`); a name that does not match is an orphan too. It is kept only when:
   - `photos/P`: a live row (`removed_at` and `hidden_at` null) has `path = P` and bucket `photos` **or `photos-draft`**.
     The draft case keeps the copy a failed open made, so a retried open never races the sweep (spec §5.4).
   - `photos-draft/P`: a live row has `path = P` and bucket `photos-draft`. After an open, the draft copies go here.
   - `photo-archive/P`: a row (any state) has `path = P` and bucket `photo-archive`. This catches copies left by a crash
     before a hide or remove committed.
   The row lookup filters by `break_id = any(<the prefixes' break ids>)` first, so it uses the existing index.
   **Deleted drafts** (`deleteDraft` removes the rows) fall under this rule: their files have no row. A candidate that
   the batch's read marks as an orphan still goes through `deleteIfSafe`, so a row that started relying on it since the
   read (a retried open, a late finalise) keeps it.
3. **Archive retention**: rows in `photo-archive` with `path` set and `coalesce(hidden_at, removed_at) < now − 180 days`,
   whose break is not under hold. The row goes first, the files after: in one write transaction (breaks locked,
   `allowPhotoModeration(tx)`), `dropPhotoFiles` (path → null; the Removed mark stays with no image, spec §6); then, with
   no transaction open, the three variants go through `deleteIfSafe` (no row relies on `P` any more). A crash between
   the two leaves orphans that rule 2 removes on the next run.
4. **Cancelled breaks** (ruling 26): breaks with status `cancelled` whose latest `break.cancelled` event is older than
   180 days, not under hold. In one write transaction (the break locked, `allowPhotoModeration(tx)`): every row of the
   break with `path` set, live ones included, gets `bucket = 'photo-archive', path = null` (`expirePhotos`), and one
   audit-only `photo.expired` event is written for the break with payload `{ photoIds, reason: "retention" }` and
   `processed_at` set. Task 2's `break_photos_gone_chk` (`path is not null or bucket = 'photo-archive'`) allows exactly
   this. Then the prefixes' variants in every bucket go through `deleteIfSafe`. A cancelled break with no
   `break.cancelled` event is left alone, since there is no date to count from (no cancel command exists yet;
   `src/domain/lines/queries.ts` dates cancellations the same way).

**Holds** (the reports plan plugs in here): `src/domain/photos/holds.ts` exports
`breaksUnderHold(tx: Tx): Promise<ReadonlySet<string>>`. It always returns an empty set today, with a doc comment
saying the reports plan replaces its body with "break ids with an open report on the break or on anything in it"
(platform spec §12). Rules 3 and 4 skip those breaks. `runPhotoCleanup` takes it through `deps.holds` so tests can
supply one. Account anonymisation (spec §5.6, last line) is the admin runbook's (Step 13) and is not in this job.

Response target and cache values for the runbook (spec §10; the target is my call, for the owner to confirm): act on a
photo report **within 24 hours**, and **as soon as it is seen** for apparently illegal content or someone's personal data.

**Files:**
- Modify: `src/db/client.ts` (adds `TxRunner`, `inTransaction`)
- Create: `src/jobs/job-lock.ts`, `src/jobs/photo-cleanup.ts`, `src/jobs/photo-cleanup.test.ts`
- Create: `src/domain/photos/holds.ts`, `src/domain/photos/retention.ts`
- Create: `src/lib/cron-auth.ts`, `src/lib/cron-auth.test.ts`; Modify: `src/app/api/tick/route.ts` (uses it)
- Create: `src/app/api/photos/cleanup/route.ts`, `src/app/api/photos/cleanup/route.test.ts`
- Modify: `vercel.json`
- Create: `src/photos/hide.ts`, `src/photos/hide.test.ts`, `scripts/hide-photo.ts`
- Create: `docs/runbooks/photos.md`; Modify: `README.md` (Scripts table and Deploy line)

**Interfaces:**
- Consumes:
  - Task 1: `PhotoStorage` (`list`, `remove`, `copy`; `copy` onto an existing destination re-puts it, fresh age),
    `photoStorage()`, `BUCKETS`, `VARIANT_WIDTHS`, `variantPath`, `createMemoryStorage(clock?)` (ruling 11).
  - Task 2: `break_photos` (`path` nullable; `break_photos_gone_chk` is `path is not null or bucket = 'photo-archive'`,
    ruling 26), `photo_uploads`, `events`; `allowPhotoModeration(tx: Tx): Promise<void>` in `src/db/photo-moderation.ts`
    (ruling 10: called before `dropPhotoFiles`, `expirePhotos` and the purge); the audit-only `photo.expired` type.
  - Existing: `lockBreak(tx, breakId)` (`src/auth/authz.ts`), `appendEvent(tx, e, { processedAt })` (Task 5).
  - Task 6: `vercel.json`'s `functions` entry for the finalise route (kept as is).
  - Task 3: `deleteDraft`. Task 5: `issueUploadTicket`, `recordProcessedPhoto`, `removePhoto`, `hidePhoto`,
    `breakPhotos`, `leadPhotos`. `SYSTEM` from `src/domain/types.ts`.
- Produces:
  - `src/db/client.ts`: `type TxRunner = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>`; `inTransaction: TxRunner` (`db.transaction`).
  - `src/jobs/job-lock.ts`: `withHeldJobLock<T>(name: string, work: () => Promise<T>): Promise<T | "locked">`
    (key `hashtext('job:' || name)`, the same key scheme as `withJobLock` in `tick.ts`).
  - `src/domain/photos/holds.ts`: `breaksUnderHold(tx: Tx): Promise<ReadonlySet<string>>`.
  - `src/domain/photos/retention.ts`: `dropPhotoFiles(tx: Tx, photoIds: readonly string[]): Promise<void>` (sets
    `path = null` on rows already in `photo-archive`; used by rule 3 and the purge) and
    `expirePhotos(tx: Tx, breakId: string, now: Date): Promise<{ photoIds: string[]; prefixes: string[] }>` (rule 4:
    `bucket = 'photo-archive', path = null` on every row of the break with a path, and the `photo.expired` event; returns
    what it changed, so the caller deletes those prefixes). Both expect the caller to have locked the break and called
    `allowPhotoModeration(tx)`.
  - `src/jobs/photo-cleanup.ts`:
    - `type PhotoCleanupResult = { incoming: number; tickets: number; orphans: number; archive: number; cancelled: number; done: boolean }` (files removed per rule, tickets deleted; `done` false when the time budget ran out);
    - `type PhotoCleanupDeps = { run?: TxRunner; holds?: (tx: Tx) => Promise<ReadonlySet<string>>; batchSize?: number; budgetMs?: number; afterRead?: (rule: "incoming" | "orphans" | "archive" | "cancelled") => Promise<void> }` (defaults `inTransaction`, `breaksUnderHold`, 100, 240 000, none). `afterRead` is a test seam: called once per batch, with the rule's name, after the batch's read and before `deleteIfSafe`'s re-read, so a test can commit a row in that window; production passes nothing;
    - `runPhotoCleanup(storage: PhotoStorage, now: Date, deps?: PhotoCleanupDeps): Promise<PhotoCleanupResult | "locked">`.
  - `src/lib/cron-auth.ts`: `cronAuthorized(req: Request): boolean` (the tick route's timing-safe Bearer check, moved).
  - `GET /api/photos/cleanup`: 401 `{ error: "unauthorized" }` without the secret; else 200 with the result JSON.
    `maxDuration = 300`, `dynamic = "force-dynamic"`, Node runtime. Logs one line
    `{"job":"photo-cleanup","ms":…,"result":…}`.
  - `vercel.json` (ruling 39: every existing key kept, including Task 6's `functions`; only the cron is added):
    `{ "functions": { "src/app/api/photos/finalise/route.ts": { "maxDuration": 30 } }, "crons": [{ "path": "/api/tick", "schedule": "* * * * *" }, { "path": "/api/photos/cleanup", "schedule": "17 9 * * *" }] }`.
  - `src/photos/hide.ts`:
    - `parseHideArgs(argv: readonly string[]): { photoId: string; reason: string; purge: boolean } | { error: string }`;
    - `type HideOutcome = { status: "hidden" | "already-hidden" | "purged"; breakId: string }`;
    - `hidePhotoAndFiles(storage: PhotoStorage, p: { photoId: string; reason: string; purge: boolean; now: Date }, run?: TxRunner): Promise<HideOutcome>`. Throws `NotFound` for an unknown id.
  - `scripts/hide-photo.ts <photo id> <reason> [--purge]`: exit 0 and one line (`hidden <id>`, `already hidden <id>`,
    `purged <id>`), exit 2 and the usage on bad arguments, exit 1 on any failure.
  - Event `photo.purged` (audit-only, inserted with `processed_at` set): payload `{ photoId, reason, buckets }`. The hide itself is Task 5's `photo.hidden`. Rule 4 writes Task 2's `photo.expired`.

- [ ] **Step 1: Write the failing cleanup tests**

`src/jobs/photo-cleanup.test.ts`. Each test runs in `withTx` and passes `run: (fn) => fn(tx)`, so the job's reads and
writes see the test's rows and roll back with them; the lock still goes through `db`. Helpers in the file:

```ts
const T0 = new Date("2026-10-21T09:17:00Z");
const hoursAgo = (h: number) => new Date(T0.getTime() - h * 3_600_000);
const daysAgo = (d: number) => hoursAgo(d * 24);
let clock = T0; // the memory storage's clock: set it back before a put to make an old file
beforeEach(() => { clock = T0; });
const store = () => createMemoryStorage(() => clock);
const as = (id: string, role: Caller["role"] = "host"): Caller => ({ id, role, onboarded: true, banned: false });
const prefixOf = (breakId: string) => `${breakId}/${randomBytes(16).toString("base64url")}`;
async function variants(s: PhotoStorage, bucket: BucketName, prefix: string, ageHours = 25) {
  clock = hoursAgo(ageHours);
  for (const w of VARIANT_WIDTHS) await s.put(bucket, variantPath(prefix, w), Buffer.from("x"), "image/webp");
  clock = T0;
}
const has = (s: MemoryStorage, bucket: BucketName, path: string) => s.files.has(`${bucket}/${path}`);
const hasAll = (s: MemoryStorage, bucket: BucketName, prefix: string) => VARIANT_WIDTHS.every((w) => has(s, bucket, variantPath(prefix, w)));
const hasNone = (s: MemoryStorage, bucket: BucketName, prefix: string) => VARIANT_WIDTHS.every((w) => !has(s, bucket, variantPath(prefix, w)));
const job = (s: PhotoStorage, tx: Tx, o: PhotoCleanupDeps = {}) => runPhotoCleanup(s, T0, { run: (fn) => fn(tx), ...o }) as Promise<PhotoCleanupResult>;
/** issueUploadTicket + recordProcessedPhoto at `location` (must match the break's status), then its files, 25 h old. */
async function addPhoto(tx: Tx, s: PhotoStorage, host: { id: string }, breakId: string, location: "photos" | "photos-draft") {
  const { ticketId } = await issueUploadTicket(tx, as(host.id), { breakId, now: T0 });
  const prefix = prefixOf(breakId);
  const { photoId } = await recordProcessedPhoto(tx, as(host.id), { ticketId, prefix, location, width: 1600, height: 1200, slot: null, alt: "Darts", now: T0 });
  await variants(s, location, prefix);
  return { photoId, prefix };
}
/** An open break with line 1 claimed, so removals archive. */
async function claimedBreak(tx: Tx, host: { id: string }, buyer: { id: string }) {
  const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
  await claimLines(tx, as(buyer.id, "member"), { breakId: b.id, numbers: [1], batchId: randomUUID() });
  return b;
}
/** A photo removed after the first claim, its archive copy made (as Task 6 does), removed_at backdated. */
async function archived(tx: Tx, s: PhotoStorage, host: { id: string }, breakId: string, removedDaysAgo: number) {
  const p = await addPhoto(tx, s, host, breakId, "photos");
  await variants(s, BUCKETS.archive, p.prefix);
  await removePhoto(tx, as(host.id), { photoId: p.photoId, now: T0 });
  await tx.execute(sql`update break_photos set removed_at = ${daysAgo(removedDaysAgo)} where id = ${p.photoId}`);
  return p;
}
type MemoryStorage = ReturnType<typeof createMemoryStorage>;
const holderView = (buyer: { id: string }) => ({ id: buyer.id, isHost: false, isHolder: true, isAdmin: false });
```

`makeTicket`, `makePhoto` are Task 5's fixtures; `deleteDraft` Task 3a's; the rest exist.

```ts
describe("runPhotoCleanup (photos spec §5.6)", () => {
  it("removes incoming files and unconsumed tickets older than 24 hours, and keeps younger ones (Review Focus 3)", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const b = await makeBreak(tx, { hostId: host.id, status: "draft" });
    const old = await makeTicket(tx, { hostId: host.id, breakId: b.id, expiresAt: hoursAgo(25) });
    const young = await makeTicket(tx, { hostId: host.id, breakId: b.id, expiresAt: hoursAgo(23) });
    const used = await makeTicket(tx, { hostId: host.id, breakId: b.id, expiresAt: hoursAgo(30), consumedAt: hoursAgo(30) });
    clock = hoursAgo(25); await s.put(BUCKETS.incoming, old.id, Buffer.from("x"), "image/webp");
    clock = hoursAgo(23); await s.put(BUCKETS.incoming, young.id, Buffer.from("x"), "image/webp"); clock = T0;
    const r = await job(s, tx);
    expect(r).toMatchObject({ incoming: 1, tickets: 1 });
    expect([has(s, BUCKETS.incoming, old.id), has(s, BUCKETS.incoming, young.id)]).toEqual([false, true]);
    const left = await tx.select({ id: photoUploads.id }).from(photoUploads).where(eq(photoUploads.breakId, b.id));
    expect(left.map((x) => x.id).sort()).toEqual([young.id, used.id].sort());
  }));

  it("removes published files that no row relies on after 24 hours, and junk names too", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const r1 = prefixOf(b.id); await variants(s, BUCKETS.public, r1, 25);
    const { prefix: r2 } = await addPhoto(tx, s, host, b.id, "photos");
    const r3 = prefixOf(b.id); await variants(s, BUCKETS.public, r3, 23);
    clock = hoursAgo(25); await s.put(BUCKETS.public, `${b.id}/junk.txt`, Buffer.from("x"), "image/webp"); clock = T0;
    const r = await job(s, tx);
    expect(hasNone(s, BUCKETS.public, r1)).toBe(true);
    expect(hasAll(s, BUCKETS.public, r2)).toBe(true);
    expect(hasAll(s, BUCKETS.public, r3)).toBe(true);
    expect(has(s, BUCKETS.public, `${b.id}/junk.txt`)).toBe(false);
    expect(r.orphans).toBe(4);
  }));

  it("keeps a failed open's public copy while the row is still a draft, and drops the draft copy once the break is open", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const draft = await makeBreak(tx, { hostId: host.id, status: "draft" });
    const { prefix: r4 } = await addPhoto(tx, s, host, draft.id, "photos-draft");
    await variants(s, BUCKETS.public, r4); // the copy a failed open left
    const open = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const { prefix: r5 } = await addPhoto(tx, s, host, open.id, "photos");
    await variants(s, BUCKETS.draft, r5); // the draft copy left after an open
    await job(s, tx);
    expect([hasAll(s, BUCKETS.draft, r4), hasAll(s, BUCKETS.public, r4)]).toEqual([true, true]);
    expect([hasNone(s, BUCKETS.draft, r5), hasAll(s, BUCKETS.public, r5)]).toEqual([true, true]);
  }));

  it("removes a deleted draft's photos", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const d = await makeBreak(tx, { hostId: host.id, status: "draft" });
    const { prefix } = await addPhoto(tx, s, host, d.id, "photos-draft");
    await deleteDraft(tx, as(host.id), d.id); // the files stay, as if the action's removal failed
    await job(s, tx);
    expect(hasNone(s, BUCKETS.draft, prefix)).toBe(true);
  }));

  it("removes an archive copy no row names (a crash before a hide or remove committed)", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const p = prefixOf(b.id); await variants(s, BUCKETS.archive, p);
    const r = await job(s, tx);
    expect(hasNone(s, BUCKETS.archive, p)).toBe(true);
    expect(r.orphans).toBe(3);
  }));

  it("never deletes the last copy: a removed photo whose files are only in photos is copied to the archive, not deleted (ruling 25)", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
    const b = await claimedBreak(tx, host, buyer);
    const { photoId, prefix } = await addPhoto(tx, s, host, b.id, "photos");
    await removePhoto(tx, as(host.id), { photoId, now: T0 }); // the row now relies on photo-archive, which holds nothing
    expect(hasNone(s, BUCKETS.archive, prefix)).toBe(true);
    const first = await job(s, tx);
    expect(hasAll(s, BUCKETS.archive, prefix)).toBe(true);  // copied into the row's own bucket
    expect(hasAll(s, BUCKETS.public, prefix)).toBe(true);   // and nothing deleted in the run that copied
    expect(first.orphans).toBe(0);
    await job(s, tx);
    expect(hasNone(s, BUCKETS.public, prefix)).toBe(true);  // the next run finds the archive complete
    expect(hasAll(s, BUCKETS.archive, prefix)).toBe(true);
    const removed = (await breakPhotos(tx, b.id, holderView(buyer))).removed;
    expect(removed.map((x) => x.prefix)).toEqual([prefix]);
  }));

  it("keeps a stale leftover object that a row came to rely on after the batch's read (the fresh re-read)", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const d = await makeBreak(tx, { hostId: host.id, status: "draft" });
    const p = prefixOf(d.id); await variants(s, BUCKETS.draft, p); // 25 h old, no row: an orphan when read
    let inserted = false;
    const r = await job(s, tx, {
      afterRead: async (rule) => {
        if (rule !== "orphans" || inserted) return;
        inserted = true;
        await makePhoto(tx, { breakId: d.id, createdBy: host.id, position: 0, bucket: "photos-draft", path: p });
      },
    });
    expect(inserted).toBe(true);
    expect(hasAll(s, BUCKETS.draft, p)).toBe(true);
    expect(r.orphans).toBe(0);
  }));

  it("drops archived photos after 180 days, keeps them before, and keeps them while the break is under hold", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
    const a = await claimedBreak(tx, host, buyer); const held = await claimedBreak(tx, host, buyer);
    const due = await archived(tx, s, host, a.id, 181);
    const young = await archived(tx, s, host, a.id, 179);
    const kept = await archived(tx, s, host, held.id, 181);
    const hidden = await addPhoto(tx, s, host, a.id, "photos");
    await variants(s, BUCKETS.archive, hidden.prefix);
    await hidePhoto(tx, SYSTEM, { photoId: hidden.photoId, reason: "test", now: T0 });
    await tx.execute(sql`update break_photos set hidden_at = ${daysAgo(181)} where id = ${hidden.photoId}`);
    const r = await job(s, tx, { holds: async () => new Set([held.id]) });
    expect([hasNone(s, BUCKETS.archive, due.prefix), hasNone(s, BUCKETS.archive, hidden.prefix)]).toEqual([true, true]);
    expect([hasAll(s, BUCKETS.archive, young.prefix), hasAll(s, BUCKETS.archive, kept.prefix)]).toEqual([true, true]);
    expect(r.archive).toBe(6); // two photos, three variants each
    const removed = (await breakPhotos(tx, a.id, holderView(buyer))).removed;
    expect(removed.find((x) => x.id === due.photoId)!.prefix).toBeNull(); // the Removed mark stays, with no image
    expect(removed.find((x) => x.id === young.photoId)!.prefix).toBe(young.prefix);
  }));

  it("expires a cancelled break's photos 180 days after the cancel: rows to photo-archive with no path, photo.expired, every file gone (ruling 26)", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
    const b = await claimedBreak(tx, host, buyer);
    const live = await addPhoto(tx, s, host, b.id, "photos");
    const gone = await archived(tx, s, host, b.id, 10);
    await tx.execute(sql`update breaks set status = 'cancelled' where id = ${b.id}`);
    await tx.execute(sql`insert into events (break_id, type, created_at) values (${b.id}, 'break.cancelled', ${daysAgo(181)})`);
    const r = await job(s, tx);
    for (const p of [live.prefix, gone.prefix]) for (const bucket of Object.values(BUCKETS)) expect(hasNone(s, bucket, p), `${bucket} ${p}`).toBe(true);
    const rows = await tx.select({ bucket: breakPhotos.bucket, path: breakPhotos.path }).from(breakPhotos).where(eq(breakPhotos.breakId, b.id));
    expect(rows).toEqual([{ bucket: "photo-archive", path: null }, { bucket: "photo-archive", path: null }]); // allowed by the new gone check
    const evs = await tx.select().from(events).where(and(eq(events.breakId, b.id), eq(events.type, "photo.expired")));
    expect(evs).toHaveLength(1);
    expect(evs[0].payload).toEqual({ photoIds: expect.arrayContaining([live.photoId, gone.photoId]), reason: "retention" });
    expect(evs[0].processedAt).not.toBeNull();
    expect((await leadPhotos(tx, [b.id])).has(b.id)).toBe(false);
    expect(r.cancelled).toBe(6);
  }));

  it("leaves a cancelled break's photos alone before 180 days, under hold, and without a cancel event", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
    const cases: { id: string; prefix: string }[] = [];
    for (const [days, held] of [[179, false], [181, true], [null, false]] as const) {
      const b = await claimedBreak(tx, host, buyer);
      const { prefix } = await addPhoto(tx, s, host, b.id, "photos");
      await tx.execute(sql`update breaks set status = 'cancelled' where id = ${b.id}`);
      if (days !== null) await tx.execute(sql`insert into events (break_id, type, created_at) values (${b.id}, 'break.cancelled', ${daysAgo(days)})`);
      cases.push({ id: held ? b.id : "", prefix });
    }
    const r = await job(s, tx, { holds: async () => new Set(cases.map((c) => c.id).filter(Boolean)) });
    for (const c of cases) expect(hasAll(s, BUCKETS.public, c.prefix), c.prefix).toBe(true);
    expect(r.cancelled).toBe(0);
  }));

  it("works through more than one batch in a run", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const ps = Array.from({ length: 5 }, () => prefixOf(b.id));
    for (const p of ps) await variants(s, BUCKETS.public, p);
    const r = await job(s, tx, { batchSize: 2 });
    expect(ps.every((p) => hasNone(s, BUCKETS.public, p))).toBe(true);
    expect(r).toMatchObject({ orphans: 15, done: true });
  }));

  it("stops at the time budget and finishes on the next run", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const ps = Array.from({ length: 3 }, () => prefixOf(b.id));
    for (const p of ps) await variants(s, BUCKETS.public, p);
    const first = await job(s, tx, { budgetMs: 0 });
    expect(first.done).toBe(false);
    expect(ps.some((p) => hasAll(s, BUCKETS.public, p))).toBe(true);
    const second = await job(s, tx);
    expect(second.done).toBe(true);
    expect(ps.every((p) => hasNone(s, BUCKETS.public, p))).toBe(true);
  }));

  it("is idempotent: a second run removes nothing, and a file already gone is not an error", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
    const b = await claimedBreak(tx, host, buyer);
    const orphan = prefixOf(b.id); await variants(s, BUCKETS.public, orphan);
    const due = await archived(tx, s, host, b.id, 181);
    await s.remove(BUCKETS.archive, VARIANT_WIDTHS.map((w) => variantPath(due.prefix, w)));
    await s.remove(BUCKETS.public, VARIANT_WIDTHS.map((w) => variantPath(due.prefix, w))); // every copy already gone
    await job(s, tx);
    const [row] = await tx.select({ path: breakPhotos.path }).from(breakPhotos).where(eq(breakPhotos.id, due.photoId));
    expect(row.path).toBeNull();
    expect(await job(s, tx)).toEqual({ incoming: 0, tickets: 0, orphans: 0, archive: 0, cancelled: 0, done: true });
  }));

  it("returns locked while another run holds the lock, and touches nothing", async () => {
    await db.transaction(async (holder) => {
      await holder.execute(sql`select pg_advisory_xact_lock(hashtext('job:photo-cleanup'))`);
      const s = store();
      await variants(s, BUCKETS.public, `${randomUUID()}/${"A".repeat(22)}`);
      const before = [...s.files.keys()];
      expect(await runPhotoCleanup(s, T0)).toBe("locked");
      expect([...s.files.keys()]).toEqual(before);
    });
  });
});

describe("breaksUnderHold", () => {
  it("is empty until the reports plan gives it open reports", async () => withTx(async (tx) => expect((await breaksUnderHold(tx)).size).toBe(0)));
});
```

- [ ] **Step 2: Run them to see them fail**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/jobs/photo-cleanup.test.ts`
Expected: FAIL: `./photo-cleanup` does not exist.

- [ ] **Step 3: Implement the lock, the holds hook, `dropPhotoFiles`, `expirePhotos` and `runPhotoCleanup`**

`withHeldJobLock`: `db.transaction` → `pg_try_advisory_xact_lock(hashtext('job:' || name))` → if not got, `"locked"`;
else `await work()` and return it. The holder transaction runs no other statement. `runPhotoCleanup` wraps the four
rules in `withHeldJobLock("photo-cleanup", …)`. Each batch: read (`run`) → Storage (no transaction) → write (`run`).
Before each batch it checks `Date.now() - started < budgetMs`, else it returns with `done: false`. Storage listing uses
`storage.list(bucket, "")` (contract change 1: recursive, full paths) and filters by `createdAt` in the job. A batch
removes all of one prefix's variants in one `remove` call, and only through `deleteIfSafe(storage, run, bucket, prefix)`
(the gate above: fresh re-read of every row naming the prefix, copy-first into a relying row's own bucket, never the
last copy). Write transactions: `lockBreak` per touched break in ascending id order (a deleted draft locked by its row
directly), then `allowPhotoModeration(tx)` before any photo-row write, then `dropPhotoFiles` / `expirePhotos` / the
ticket deletes. Rules 3 and 4 commit the row change first and delete the files after, outside the transaction. No
Storage call runs while a transaction is open (ruling 28).

- [ ] **Step 4: Run the cleanup tests**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/jobs/photo-cleanup.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing route and cron-auth tests**

`src/lib/cron-auth.test.ts`: with `CRON_SECRET` from the test env, `cronAuthorized` is true for
`authorization: Bearer <secret>`, false for no header, a wrong secret of the same length, a longer one, and `bearer`
in lower case.

`src/app/api/photos/cleanup/route.test.ts`: mock `@/jobs/photo-cleanup` (`runPhotoCleanup` a `vi.fn` returning
`{ incoming: 1, tickets: 0, orphans: 3, archive: 0, cancelled: 0, done: true }`) and `@/storage/photo-storage`
(`photoStorage` returns a sentinel).

```ts
it("refuses a request without the cron secret, and runs nothing", async () => {
  expect((await GET(req())).status).toBe(401);
  expect((await GET(req("Bearer " + "x".repeat(secret.length)))).status).toBe(401);
  expect(runPhotoCleanup).not.toHaveBeenCalled();
});
it("runs the cleanup once with the storage and the current time, and answers its result", async () => {
  const r = await GET(req(`Bearer ${secret}`));
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ incoming: 1, tickets: 0, orphans: 3, archive: 0, cancelled: 0, done: true });
  expect(runPhotoCleanup).toHaveBeenCalledWith(sentinel, expect.any(Date));
});
it("answers 200 with locked when another run holds the lock", async () => {
  vi.mocked(runPhotoCleanup).mockResolvedValueOnce("locked");
  const r = await GET(req(`Bearer ${secret}`));
  expect(r.status).toBe(200);
  expect(await r.json()).toBe("locked");
});
it("is scheduled daily beside the minute tick, and vercel.json keeps every other key (ruling 39)", () => {
  const v = JSON.parse(readFileSync("vercel.json", "utf8"));
  expect(v.crons).toEqual([
    { path: "/api/tick", schedule: "* * * * *" },
    { path: "/api/photos/cleanup", schedule: "17 9 * * *" },
  ]);
  expect(v.functions["src/app/api/photos/finalise/route.ts"]).toEqual({ maxDuration: 30 }); // Task 6's, untouched
  expect(Object.keys(v).sort()).toEqual(["crons", "functions"]);
});
```

- [ ] **Step 6: Run them to see them fail**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/lib/cron-auth.test.ts src/app/api/photos/cleanup/route.test.ts`
Expected: FAIL: the modules do not exist; `vercel.json` has one cron.

- [ ] **Step 7: Add `cronAuthorized`, the route and the cron entry**

Move the tick route's check into `cronAuthorized`, and have both routes call it. The cleanup route mirrors `/api/tick`:
`runPhotoCleanup(photoStorage(), new Date())`, then logs and returns JSON. In `vercel.json`, append the cleanup entry to
`crons` and change nothing else: Task 6's `functions` key and the tick cron stay as they are (ruling 39).

- [ ] **Step 8: Run them**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/lib/cron-auth.test.ts src/app/api/photos/cleanup/route.test.ts`
Expected: PASS.

- [ ] **Step 9: Write the failing hide tests**

`src/photos/hide.test.ts`, in `withTx` with `run(tx) = (fn) => fn(tx)` and `store()`, `as`, `addPhoto`, `claimedBreak`,
`variants`, `hasAll`, `hasNone`, `T0` as in Step 1 (copy the helpers; they are small). `ID` is a fixed uuid.
`typed(tx, breakId, type)` selects that break's events of that type. `row(tx, photoId)` selects
`{ hiddenAt, bucket, path }` of one photo.

```ts
describe("parseHideArgs", () => {
  it("reads an id, a reason and --purge anywhere", () => {
    expect(parseHideArgs([ID, "nudity"])).toEqual({ photoId: ID, reason: "nudity", purge: false });
    expect(parseHideArgs(["--purge", ID, "illegal content"])).toEqual({ photoId: ID, reason: "illegal content", purge: true });
  });
  it("refuses a missing reason, a non-uuid id, an unknown flag and extra words", () => {
    for (const a of [[ID], ["nope", "r"], [ID, "r", "--force"], [ID, "r", "extra"]]) expect(parseHideArgs(a)).toHaveProperty("error");
  });
});

describe("hidePhotoAndFiles (photos spec §10)", () => {
  it("hides a published photo: row hidden, photo.hidden written, public variants gone, a copy in the archive", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
    const b = await claimedBreak(tx, host, buyer);
    const { photoId, prefix } = await addPhoto(tx, s, host, b.id, "photos");
    expect(await hidePhotoAndFiles(s, { photoId, reason: "nudity", purge: false, now: T0 }, run(tx))).toEqual({ status: "hidden", breakId: b.id });
    expect([hasNone(s, BUCKETS.public, prefix), hasAll(s, BUCKETS.archive, prefix)]).toEqual([true, true]);
    expect(await row(tx, photoId)).toMatchObject({ bucket: "photo-archive", path: prefix, hiddenAt: T0 });
    expect(await typed(tx, b.id, "photo.hidden")).toHaveLength(1);
    expect((await leadPhotos(tx, [b.id])).has(b.id)).toBe(false);
    const v = await breakPhotos(tx, b.id, { id: buyer.id, isHost: false, isHolder: true, isAdmin: false });
    expect([...v.live, ...v.removed].map((x) => x.id)).not.toContain(photoId); // a hidden photo is never shown
  }));
  it("hides a draft's photo the same way, from photos-draft", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const d = await makeBreak(tx, { hostId: host.id, status: "draft" });
    const { photoId, prefix } = await addPhoto(tx, s, host, d.id, "photos-draft");
    expect((await hidePhotoAndFiles(s, { photoId, reason: "r", purge: false, now: T0 }, run(tx))).status).toBe("hidden");
    expect([hasNone(s, BUCKETS.draft, prefix), hasAll(s, BUCKETS.archive, prefix)]).toEqual([true, true]);
  }));
  it("hides a photo the host had removed after the first claim, and never removes from photo-archive (ruling 27)", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
    const b = await claimedBreak(tx, host, buyer);
    const { photoId, prefix } = await addPhoto(tx, s, host, b.id, "photos");
    await variants(s, BUCKETS.archive, prefix);
    await removePhoto(tx, as(host.id), { photoId, now: T0 });
    const removeSpy = vi.spyOn(s, "remove");
    expect((await hidePhotoAndFiles(s, { photoId, reason: "r", purge: false, now: T0 }, run(tx))).status).toBe("hidden");
    expect(hasAll(s, BUCKETS.archive, prefix)).toBe(true); // its only copy stays
    expect(removeSpy.mock.calls.filter(([bucket]) => bucket === BUCKETS.archive)).toEqual([]);
    expect((await row(tx, photoId)).hiddenAt).toEqual(T0);
  }));
  it("hides a row whose files are already gone (path null): no copy, no removal, the row hidden (ruling 27)", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
    const b = await claimedBreak(tx, host, buyer);
    const { photoId } = await addPhoto(tx, s, host, b.id, "photos");
    await removePhoto(tx, as(host.id), { photoId, now: T0 });
    await allowPhotoModeration(tx); await dropPhotoFiles(tx, [photoId]); // retention already took the archive copy
    const copySpy = vi.spyOn(s, "copy"); const removeSpy = vi.spyOn(s, "remove");
    expect((await hidePhotoAndFiles(s, { photoId, reason: "r", purge: false, now: T0 }, run(tx))).status).toBe("hidden");
    expect(copySpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
    expect(await row(tx, photoId)).toMatchObject({ hiddenAt: T0, path: null });
  }));
  it("purges: every copy in every bucket gone, the row's path null, photo.purged written with the reason", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const { photoId, prefix } = await addPhoto(tx, s, host, b.id, "photos");
    await variants(s, BUCKETS.draft, prefix); // a stray draft copy too
    expect((await hidePhotoAndFiles(s, { photoId, reason: "illegal content", purge: true, now: T0 }, run(tx))).status).toBe("purged");
    for (const bucket of Object.values(BUCKETS)) expect(hasNone(s, bucket, prefix), bucket).toBe(true);
    expect(await row(tx, photoId)).toMatchObject({ bucket: "photo-archive", path: null });
    const [ev] = await typed(tx, b.id, "photo.purged");
    expect(ev.payload).toMatchObject({ photoId, reason: "illegal content" });
    expect(ev.processedAt).not.toBeNull();
  }));
  it("purges a photo hidden earlier, removing the archive copy", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const { photoId, prefix } = await addPhoto(tx, s, host, b.id, "photos");
    await hidePhotoAndFiles(s, { photoId, reason: "r", purge: false, now: T0 }, run(tx));
    expect(hasAll(s, BUCKETS.archive, prefix)).toBe(true);
    expect((await hidePhotoAndFiles(s, { photoId, reason: "r", purge: true, now: T0 }, run(tx))).status).toBe("purged");
    expect(hasNone(s, BUCKETS.archive, prefix)).toBe(true);
    expect((await row(tx, photoId)).path).toBeNull();
  }));
  it("does nothing to a photo already hidden without --purge, and says so", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const { photoId } = await addPhoto(tx, s, host, b.id, "photos");
    await hidePhotoAndFiles(s, { photoId, reason: "r", purge: false, now: T0 }, run(tx));
    const before = [...s.files.keys()].sort();
    expect((await hidePhotoAndFiles(s, { photoId, reason: "r", purge: false, now: T0 }, run(tx))).status).toBe("already-hidden");
    expect([...s.files.keys()].sort()).toEqual(before);
    expect(await typed(tx, b.id, "photo.hidden")).toHaveLength(1);
  }));
  it("leaves the photo visible when the archive copy fails: the copy runs before the hide commits", async () => withTx(async (tx) => {
    const s = store(); const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const { photoId, prefix } = await addPhoto(tx, s, host, b.id, "photos");
    vi.spyOn(s, "copy").mockRejectedValue(new Error("storage down"));
    await expect(hidePhotoAndFiles(s, { photoId, reason: "r", purge: false, now: T0 }, run(tx))).rejects.toThrow("storage down");
    expect((await row(tx, photoId)).hiddenAt).toBeNull();
    expect(hasAll(s, BUCKETS.public, prefix)).toBe(true);
    expect((await leadPhotos(tx, [b.id])).get(b.id)?.id).toBe(photoId);
  }));
  it("throws NotFound for an unknown photo id", async () => withTx(async (tx) => {
    await expect(hidePhotoAndFiles(store(), { photoId: randomUUID(), reason: "r", purge: false, now: T0 }, run(tx))).rejects.toBeInstanceOf(NotFound);
  }));
});
```

- [ ] **Step 10: Run them to see them fail**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/photos/hide.test.ts`
Expected: FAIL: `./hide` does not exist.

- [ ] **Step 11: Implement `hidePhotoAndFiles`, `parseHideArgs` and the script**

Order inside `hidePhotoAndFiles`. Each storage step runs with no transaction open:
1. Read the row (`path`, `bucket`, `hidden_at`, `break_id`); throw `NotFound` if there is none.
2. If it is already hidden and `purge` is false, return `already-hidden`.
3. If it is not hidden: when `path` is set, copy each variant to `photo-archive`, unless it is already there; when
   `path` is null there is nothing to copy, so skip the copy (ruling 27). Then, in one transaction, run
   `hidePhoto(tx, SYSTEM, { photoId, reason, now })` (it calls `allowPhotoModeration` itself on a frozen break). Then,
   when `path` is set and `from` is not `photo-archive`, remove the variants from `from`. The hide never removes from
   `photo-archive`: a photo removed after a claim keeps its only copy there (ruling 27).
4. With `purge`: when `path` is set, remove the variants from all four buckets (the one deliberate removal from
   `photo-archive`). Then, in one transaction: `lockBreak`, `allowPhotoModeration(tx)` (ruling 10), `dropPhotoFiles`
   and the `photo.purged` event (`processed_at` set).
`scripts/hide-photo.ts` follows `scripts/verify-draws.ts`: dotenv first, its own `postgres` client with `max: 1`, a
`TxRunner` over that client, and `photoStorage()`. It prints the usage
`Usage: pnpm exec tsx scripts/hide-photo.ts <photo id> <reason> [--purge]` on a parse error.

- [ ] **Step 12: Run them**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/photos/hide.test.ts`
Expected: PASS.

- [ ] **Step 13: Write the runbook and the README lines**

No runbook file exists yet: the platform spec says "admin runbook", and README carries operational notes. Create
`docs/runbooks/photos.md` with these sections, in plain words:
- **Hide a photo**: the command with and without `--purge`, where the photo id comes from (the break page's image URL
  holds the prefix; `select id from break_photos where path = '<prefix>'`), and what each mode leaves behind: a hide
  keeps one copy in `photo-archive` (never removed by a hide) for holders' records and any report; `--purge` removes
  every copy and leaves the row with no image.
- **What still shows after a hide**: public variants are served with a one-hour cache lifetime, so browsers and the
  Storage CDN may keep serving a hidden photo for up to an hour; the link preview is cached five minutes
  (`s-maxage=300`), and social sites keep their own copy of a preview for as long as they choose.
- **Response target**: act on a photo report within 24 hours. Act as soon as it is seen for apparently illegal content
  or someone's personal data. (Mark this as the owner's to confirm.)
- **Purge and legal reporting**: `--purge` is for content that must not be kept. Before purging apparently illegal
  content, check the duty to report and preserve: in the US, providers must report apparent child sexual abuse material
  to NCMEC's CyberTipline and preserve it (18 U.S.C. § 2258A). Purging first can breach that. Hide without `--purge`,
  report, get legal advice, and purge only once preservation is no longer required. This runbook is not legal advice.
- **Revoking a host**: there is no revoke command yet. Until there is, when a host's role is taken away by SQL (README
  "Roles"), hide every photo of their breaks:
  `psql "$DATABASE_URL" -Atc "select p.id from break_photos p join breaks b on b.id = p.break_id where b.host_id = '<user id>' and p.hidden_at is null" | while read id; do pnpm exec tsx scripts/hide-photo.ts "$id" "host revoked"; done`.
  The revoke command, when built, must do the same.
- **Account anonymisation** (spec §5.6): when a host's account is anonymised, delete their photos and archive copies.
  First check that no report is open on any of their breaks (today, with no reports table, the moderation inbox; once
  the reports plan lands, `breaksUnderHold`): while one is open, the deletion waits, and is done when the last report on
  their breaks closes. Then purge every photo of every break they hosted, drafts and deleted drafts included, hidden or
  not, that still has files:
  `psql "$DATABASE_URL" -Atc "select p.id from break_photos p join breaks b on b.id = p.break_id where b.host_id = '<user id>' and p.path is not null" | while read id; do pnpm exec tsx scripts/hide-photo.ts "$id" "account anonymised" --purge; done`.
  Re-run the query: it must print nothing. A deleted draft's files have no row; the cleanup's orphan rule removes them
  within a day. Content under a preservation duty (see "Purge and legal reporting") is not purged until that duty ends.
- **Cleanup**: the daily `/api/photos/cleanup` (09:17 UTC), what it removes (the four rules), that it never deletes the
  last copy a row relies on (it copies into the row's bucket first), the hold hook (`breaksUnderHold`), and how to run it
  by hand: `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/photos/cleanup`.

In `README.md`: add a Scripts row `| pnpm exec tsx scripts/hide-photo.ts <id> <reason> [--purge] | Hide (or purge) a photo; see docs/runbooks/photos.md |`.
To the Deploy bullet about `CRON_SECRET`, add: "and to `/api/photos/cleanup` (daily, 09:17 UTC)". Task 12 owns the
rest of the README; keep these two lines when it edits.

- [ ] **Step 14: Run the gates**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:concurrency && pnpm test:ci`
Expected: all PASS, no lint warnings. Then the script's argument handling, against the local stack:
`export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec tsx scripts/hide-photo.ts not-a-uuid x; echo $?` prints the usage and `2`.

- [ ] **Step 15: Commit**

```bash
git add src/db/client.ts src/jobs/job-lock.ts src/jobs/photo-cleanup.ts src/jobs/photo-cleanup.test.ts \
  src/domain/photos/holds.ts src/domain/photos/retention.ts src/lib/cron-auth.ts src/lib/cron-auth.test.ts \
  src/app/api/tick/route.ts src/app/api/photos/cleanup vercel.json src/photos/hide.ts src/photos/hide.test.ts \
  scripts/hide-photo.ts docs/runbooks/photos.md README.md
git commit -m "feat(photos): daily cleanup cron, hide script and photos runbook"
```

---


### Task 12a: Budget measurement (model: Sonnet; Reviewer: Opus)

Spec §11. `scripts/measure-first-load.mjs`: Plan C's measurement read `app-build-manifest.json`, which Turbopack no
longer writes, so there is no working number today. This task restores it, records the number on the commit this
branch started from (before any photo code), and wires the allowance check into `pnpm budget` and CI. The figure after
the plan is taken in Task 12b's last gate, once every photo change is in.

How a route's first load is found under Turbopack (verified against a `next build` on main, Next 16.4.2):
- `.next/server/app/b/[id]/page_client-reference-manifest.js` assigns `globalThis.__RSC_MANIFEST["/b/[id]/page"]`. Its
  `entryJSFiles` maps each layout and page entry to the chunks the browser loads for it, e.g.
  `"[project]/src/app/layout": ["static/chunks/0qrm….js"]` and `"[project]/src/app/b/[id]/page": [… ]`. Entries for
  `error`, `global-error`, `loading` and `not-found` are not part of a successful first load and are excluded.
- `.next/build-manifest.json` has `rootMainFiles` (the runtime and shared client entry, loaded on every page) and
  `polyfillFiles`.
- First-load JS = the union of those files, each gzipped at level 9 and summed; the CSS in `entryCSSFiles` the same way,
  reported but not asserted (the spec's allowance is JS).
- A chunk that only a dynamic import reaches (the viewer) is in none of those lists, so it is out of the number by
  construction; the script also proves it by scanning the first-load chunks for the viewer's marker
  (`data-photo-viewer-root`, carried by Task 8b's `<dialog>` and no other module, ruling 36).

**Files:**
- Create: `scripts/measure-first-load.mjs`, `scripts/measure-first-load.d.mts`, `scripts/first-load-base.json`
- Create: `tests/scripts/measure-first-load.test.ts`
- Modify: `package.json` (script `budget`), `.github/workflows/ci.yml` (run it after `pnpm build`)

**Interfaces:**
- Consumes: Task 8b's viewer `<dialog>` carrying `data-photo-viewer-root` (the marker).
- Produces:
  - `measureFirstLoad(o: { dist?: string; route?: string; forbid?: string[] }): { js: number; css: number; chunks: { file: string; gz: number; kind: "js" | "css" }[]; forbidden: { marker: string; file: string }[] }`
    (defaults `dist = ".next"`, `route = "/b/[id]"`); `checkAgainstBase(m: { js: number }, base: { js: number; allowanceJs: number }): { ok: boolean; over: number }`.
  - CLI: `node scripts/measure-first-load.mjs [--route "/b/[id]"] [--dist .next] [--forbid <marker>]… [--json] [--check] [--write-base <file> --commit <sha>]`; exit 1 on `--check` over the allowance or a forbidden marker found.
  - `scripts/first-load-base.json`: `{ route, commit, js, css, allowanceJs }`.
  - `pnpm budget` = `node scripts/measure-first-load.mjs --check --forbid data-photo-viewer-root`.

- [ ] **Step 1: Write the failing tests for the measurement**

`tests/scripts/measure-first-load.test.ts` builds a fake `dist` in `os.tmpdir()` (a `server/app/b/[id]/page_client-reference-manifest.js`
written as the real file is, a `build-manifest.json`, and chunk files with known text) and imports
`../../scripts/measure-first-load.mjs`:

```ts
it("sums the gzip level 9 size of the root files, polyfills, the layout chain and the page, each file once", () => {
  const d = fakeDist({ root: ["r1.js"], polyfill: ["p.js"], layout: ["r1.js", "l.js"], page: ["r1.js", "pg.js"], error: ["e.js"] });
  const m = measureFirstLoad({ dist: d });
  expect(m.chunks.filter((c) => c.kind === "js").map((c) => c.file).sort()).toEqual(["l.js", "p.js", "pg.js", "r1.js"].map((f) => `static/chunks/${f}`));
  expect(m.js).toBe(["r1.js", "p.js", "l.js", "pg.js"].reduce((n, f) => n + gzipSync(read(d, f), { level: 9 }).length, 0));
});
it("leaves out the error entries and chunks reached only by a dynamic import", () => {
  const m = measureFirstLoad({ dist: fakeDist({ root: ["r1.js"], page: ["pg.js"], error: ["e.js"], lazy: ["viewer.js"] }) });
  expect(m.chunks.map((c) => c.file).join()).not.toMatch(/e\.js|viewer\.js/);
  expect(m.chunks.map((c) => c.file).sort()).toEqual(["static/chunks/pg.js", "static/chunks/r1.js"]);
});
it("reports a forbidden marker found in a first-load chunk, and none when it is only in a lazy chunk", () => {
  const d = fakeDist({ root: ["r1.js"], page: ["pg.js"], lazy: ["viewer.js"], text: { "viewer.js": "data-photo-viewer-root" } });
  expect(measureFirstLoad({ dist: d, forbid: ["data-photo-viewer-root"] }).forbidden).toEqual([]);
  const d2 = fakeDist({ root: ["r1.js"], page: ["pg.js"], text: { "pg.js": "data-photo-viewer-root" } });
  expect(measureFirstLoad({ dist: d2, forbid: ["data-photo-viewer-root"] }).forbidden).toEqual([{ marker: "data-photo-viewer-root", file: "static/chunks/pg.js" }]);
});
it("fails loudly when the manifest is missing, instead of measuring nothing", () => {
  expect(() => measureFirstLoad({ dist: mkdtempSync(join(tmpdir(), "nb-")) })).toThrow(/page_client-reference-manifest\.js/);
});
it("checks the allowance against the base", () => {
  expect(checkAgainstBase({ js: 10_000 }, { js: 8_000, allowanceJs: 4_036 })).toEqual({ ok: true, over: 0 });
  expect(checkAgainstBase({ js: 12_036 }, { js: 8_000, allowanceJs: 4_036 })).toEqual({ ok: true, over: 0 }); // exactly at the allowance
  expect(checkAgainstBase({ js: 12_100 }, { js: 8_000, allowanceJs: 4_036 })).toEqual({ ok: false, over: 64 });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test tests/scripts/measure-first-load.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `scripts/measure-first-load.mjs` (with `.d.mts` types)**

Node only, no dependencies. Read the manifest with `vm.runInNewContext` (a sandbox `{ globalThis: {} }`-style object so the file's
`globalThis.__RSC_MANIFEST = …` fills it), take the single entry's `entryJSFiles` and `entryCSSFiles`. An entry key counts when it
is `[project]/src/app/<dir>/layout` or `[project]/src/app/<dir>/page` and `<dir>` is empty or a whole-segment prefix of the route's
directory (`b/[id]`); everything else (`error`, `global-error`, `loading`, `not-found`) does not. Add `rootMainFiles` and
`polyfillFiles` from `build-manifest.json`. Gzip each distinct file once with `zlib.gzipSync(buf, { level: 9 })`. The CLI runs only
when the file is the entry point (`import.meta.url` against `process.argv[1]`), prints `js`, `css` and the per-chunk table, and
with `--write-base` writes `{ route, commit, js, css, allowanceJs: 4036 }` to the given file. `--check` reads
`scripts/first-load-base.json` (resolved from the script's own directory, not the working directory).

The allowance, from the existing Mosaic §11 ruling (assembly ruling 16): `/b/[id]` first-load JS may be 12 288 B gzip over the
pre-Plan-C base; Plan C used 8 252 B of it (deferred findings, Budget), so 4 036 B remain over today's number, whatever method
measures it. That remainder is the photos allowance. The plate and the Prizes block are server-rendered and the viewer is lazy, so
the expected growth is near zero; a result above the allowance is a finding to fix by moving code out of the first load, not a
number to raise.

- [ ] **Step 4: Run the tests to see them pass**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test tests/scripts/measure-first-load.test.ts`
Expected: PASS.

- [ ] **Step 5: Record the base on the commit this branch started from, before any photo code**

Each shell call starts in a fresh working directory, so the whole recording runs as **one** command, with absolute paths
and `git -C`/`pnpm --dir` instead of `cd`. The base worktree needs no copy of the script: the script on this branch reads
the base build through `--dist`. Run it from the repository root of this branch (sandbox off: the build fetches Google
Fonts; a build that cannot is BLOCKED: fonts):

```bash
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && \
ROOT="$(git rev-parse --show-toplevel)" && BASE="$(git -C "$ROOT" merge-base HEAD main)" && \
git -C "$ROOT" worktree add "$TMPDIR/base-build" "$BASE" && \
cp "$ROOT/.env.local" "$TMPDIR/base-build/.env.local" && \
pnpm --dir "$TMPDIR/base-build" install --frozen-lockfile && pnpm --dir "$TMPDIR/base-build" build && \
node "$ROOT/scripts/measure-first-load.mjs" --dist "$TMPDIR/base-build/.next" --json && \
node "$ROOT/scripts/measure-first-load.mjs" --dist "$TMPDIR/base-build/.next" --write-base "$ROOT/scripts/first-load-base.json" --commit "$(git -C "$TMPDIR/base-build" rev-parse --short HEAD)"; \
STATUS=$?; git -C "$ROOT" worktree remove --force "$TMPDIR/base-build"; exit $STATUS
```

Expected: a JSON with `js` in the region of 130 000 B (Plan C's own figure was 133 937 B under another method, so the two are not
comparable; only this base is used from now on), the worktree removed, and `scripts/first-load-base.json` naming `BASE`'s short
sha. Sanity: `js` is over 50 000 and the chunk list contains the layout and page chunks; if the list is empty the manifest layout
changed and the script must be fixed, not the base.

- [ ] **Step 6: Wire `pnpm budget` and CI, then check the current build**

`package.json` script: `"budget": "node scripts/measure-first-load.mjs --check --forbid data-photo-viewer-root"`. In
`.github/workflows/ci.yml` add `- run: pnpm budget` after `- run: pnpm build`.

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm build && pnpm budget`
Expected: prints `js` and `css`, exit 0 and no forbidden marker (Tasks 1 to 11 are in; the viewer is lazy). An overrun
here is handled as in Task 12b Step 12.

- [ ] **Step 7: Commit**

```bash
git add scripts/measure-first-load.mjs scripts/measure-first-load.d.mts scripts/first-load-base.json tests/scripts package.json .github/workflows/ci.yml
git commit -m "build: measure /b/[id] first-load JS under Turbopack and hold the allowance"
```

**Reviewer: Opus.** Focus: (a) the base was measured on the merge base with main, not on this branch; (b) the entry
filter keeps the layout chain and the page and nothing else; (c) `--check` fails on a forbidden marker even under the
allowance.

---

### Task 12b: Copy audit, photos e2e, README (model: Sonnet; Reviewer: Opus)

Spec §10, §11 and Review Focus 2. The copy audit learns the photo copy, the photos e2e runs the journeys that cross
tasks (Task 8b's viewer and layout tests already cover the viewer and Review Focus 5, so none are repeated here), and the
README catches up. Last, the budget after the plan.

**Files:**
- Modify: `src/lib/copy-audit.test.ts`
- Modify: `e2e/db.ts` (a service-role Storage client), `e2e/global-setup.ts` (empty the buckets, Storage probe)
- Create: `e2e/photo-helpers.ts`
- Modify: `e2e/photos.spec.ts` (created by Task 8b; this task appends a `describe` to it)
- Modify: `e2e/helpers.ts`, `e2e/layout.spec.ts` (only if Task 8a/8b did not already move `axeViolations`, `ranBreak` and `signedIn` into `e2e/helpers.ts`)
- Modify: `README.md`, `docs/superpowers/plans/2026-10-14-plan-c-deferred-findings.md` (Budget section)

No image file is committed: every photo is generated by Task 7a's `jpeg(n)` (ruling 38).

**Interfaces:**
- Consumes:
  - Task 5: `noticeFor` from `src/domain/photos/notice.ts` (ruling 37); `CONDITION_LABEL` (re-exported by `src/domain/photos/types.ts` from Task 3a's `condition.ts`).
  - Task 7a: `defaultAlt({ itemName, title })` from `src/components/photos/strip-state.ts` (object form, ruling 37);
    `jpeg(n: number): Promise<Buffer>` and `composeBreakWithPhotos(page, { title, photos, lineCount?, price?, intent? })`
    in `e2e/helpers.ts`.
  - Task 3b: `composeBreak` already selects the prize condition (do not add it again).
  - Task 7b/7c: the strip (`photo-input`, `photo-tile` with `data-status` and `data-photo-id`, `photo-options-N`, the
    inline panel's "Make lead", "Tag" (radios named by prize, plus "No tag"), "Describe", "Move earlier", "Move later",
    "Remove"; after a claim, "Remove photo" / "Keep photo"; `edit-photos` and the "Edit photos" dialog).
  - Task 8a: the plate button named "Prize photos, N" (`photo-plate`), `prizes-block`, `prize-place`,
    `photo-notice-line`, `removed-plate`, the `Plate`'s `data-testid="plate"`. Task 9: `card-media`, `thumb`,
    `my-photo-notice`, `pay-break`.
  - Task 11: the cleanup route and runbook. Task 1: the buckets script.
- Produces:
  - `e2e/db.ts`: `storageAdmin(): SupabaseClient` (service role, built once from `.env.local` loaded with
    `dotenv.config({ path: ".env.local", quiet: true })`; `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; never
    `photoStorage()`, which imports `server-only` and cannot load in Playwright), `listObjects(bucket: string, prefix: string): Promise<string[]>`,
    `emptyBucket(bucket: string): Promise<void>`, `probeStorage(): Promise<void>` (lists the four buckets; throws the
    message below on any failure).
  - `e2e/photo-helpers.ts`: `addPhotos(page: Page, ns: number[]): Promise<void>` (sets the strip's file input to
    `{ name: \`p${n}.jpg\`, mimeType: "image/jpeg", buffer: await jpeg(n) }` for each `n` and waits until every tile is
    `data-status=ready`), `tileMenu(page, index: number, item: "Make lead" | "Tag" | "Describe" | "Move earlier" | "Move later" | "Remove")`
    (1-based, `photo-options-${index}` then the item), `describeTile(page, index, alt)` (Describe, fill the panel's
    text field, Save; use Task 7b's field and button names), `tagTile(page, index, place: string)` (Tag, check the
    radio named `place`, "No tag" included), `fillComposer(page, o: { title: string; lineCount?: number; price?: string; alternative?: string })`
    (the same fields `composeBreak` fills, condition included, without submitting; `alternative` adds an "or" item).

- [ ] **Step 1: Write the failing copy-audit tests**

In `src/lib/copy-audit.test.ts`, first widen `COPY_MODULE` so photo copy is read by the caps and state-word rules (add these
alternatives inside its group, before the closing `)`): `domain\/photos\/(types|notice)|components\/photos\/(shrink|strip-state)|app\/photos\/actions|api\/photos\/finalise\/route`.
Any photo module whose file name contains `copy` is already forced into the list by the existing "keeps every copy module" test.
Add the new modules to that test's `known` list (each must exist). Then add a block:

```ts
const PHOTO_PATH = /(^|\/)photos?(\/|-)|photo[^/]*\.tsx?$/;
const RE_PHOTO = { verified: /\b(verified|authentic(?:ated)?|genuine|certified|guaranteed|proof|checked by)\b/i };
const photoSegs = segments.filter((g) => PHOTO_PATH.test(g.path));

describe("copy audit, photos (spec §10, §11)", () => {
  it("reads the photo modules at all (a guard against a path that silently matches nothing)", () => {
    expect(photoSegs.some((g) => g.text === "Photo removed")).toBe(true);
    expect(photoSegs.some((g) => /can't be read here/.test(g.text))).toBe(true);
  });
  it("never implies the platform checked a photo", () => expect(copyHits(RE_PHOTO.verified, photoSegs)).toEqual([]));
  it("catches that claim and lets the near-misses through", () => {
    for (const t of ["Verified photo", "Photo checked by Breaks", "An authentic item", "Proof of the item", "Guaranteed real"]) expect(RE_PHOTO.verified.test(t), t).toBe(true);
    for (const t of ["Photos of the items.", "Rules and specs go in the description.", "Photo removed"]) expect(RE_PHOTO.verified.test(t), t).toBe(false);
  });
  it("keeps every notice sentence inside every Mosaic and photo rule", () => {
    const place = (s: string | null) => (s === null ? "" : s === "top" ? "Top spot" : s === "second" ? "2nd place" : "Phantom 24g");
    const sentences = [
      noticeFor([{ kind: "lead" }], place), noticeFor([{ kind: "removed", slot: null, wasLead: false }], place),
      noticeFor([{ kind: "removed", slot: "top", wasLead: true }], place), noticeFor([{ kind: "removed", slot: "second", wasLead: false }], place),
      noticeFor([{ kind: "removed", slot: "or", wasLead: false }], place),
      noticeFor([{ kind: "retagged", from: "top", to: "second" }], place),
      noticeFor([{ kind: "lead" }, { kind: "removed", slot: null, wasLead: false }], place),
    ];
    expect(sentences.every((s) => typeof s === "string" && s.length > 0)).toBe(true);
    expect(new Set(sentences)).toEqual(new Set(["Lead photo replaced", "Photo removed", "Top-spot photo removed", "2nd-place photo removed", "Phantom 24g photo removed", "A photo moved from Top spot to 2nd place", "Photos changed"]));
    for (const s of sentences as string[]) for (const [rule, re] of Object.entries(RE)) expect(re.test(s), `${rule}: "${s}"`).toBe(false);
    for (const s of sentences as string[]) expect(RE_PHOTO.verified.test(s), s).toBe(false);
  });
  it("keeps the labels and the viewer's caption inside the rules", () => {
    const texts = [...Object.values(CONDITION_LABEL), "Updated", "Removed Oct 21", "5 photos", "Top spot: Taylor Chronos 24g. Photo 2 of 5.", "Photos of the items. Rules and specs go in the description.", "Buyers in this break will still see this photo, marked Removed.", "Buyers see the lead photo first in the feed."];
    for (const t of texts) { for (const [rule, re] of Object.entries(RE)) expect(re.test(t), `${rule}: "${t}"`).toBe(false); expect(RE_PHOTO.verified.test(t), t).toBe(false); }
  });
  it("gives every default alt text inside the rules, within 1 to 120 characters, even for a very long title", () => {
    for (const a of [defaultAlt({ itemName: "Taylor Chronos 24g", title: "Chronos night" }), defaultAlt({ itemName: null, title: "Chronos night" }), defaultAlt({ itemName: null, title: "x".repeat(300) })]) {
      expect(a.length).toBeGreaterThanOrEqual(1);
      expect(a.length).toBeLessThanOrEqual(120);
      for (const [rule, re] of Object.entries(RE)) expect(re.test(a), `${rule}: "${a}"`).toBe(false);
      expect(RE_PHOTO.verified.test(a), a).toBe(false);
    }
  });
});
```

Imports at the top of the file: `noticeFor` from `@/domain/photos/notice`, `CONDITION_LABEL` from `@/domain/photos/types`, and
`defaultAlt` from `@/components/photos/strip-state`. `RE` is declared after the existing first `describe`, so place this block
after it. "Photo removed" is the strip's Undo line ("Photo removed.") and the notice sentence; either satisfies the guard.

- [ ] **Step 2: Run them to see them fail**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/lib/copy-audit.test.ts`
Expected: FAIL (the new modules are unlisted in `known`). If it fails on a real sentence, change the sentence in its module and
say so in the report; do not loosen a rule.

- [ ] **Step 3: Make them pass**

Add the modules to `known`; fix whatever the audit finds in photo copy (the strip's and finalise route's strings come from Tasks
6 and 7). Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/lib/copy-audit.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/copy-audit.test.ts
git commit -m "test(copy): audit photo copy, notice sentences and default alt text"
```

- [ ] **Step 5: The e2e plumbing**

- `e2e/db.ts`: add `storageAdmin`, `listObjects`, `emptyBucket`, `probeStorage` as in Interfaces. `listObjects` lists
  recursively under the prefix and returns full paths; `emptyBucket` lists the whole bucket and removes in batches of 100.
- `e2e/global-setup.ts`: Task 2 already truncates `break_photos`, `photo_uploads` and `photo_notices_seen` (check; add
  nothing twice). Before the truncate, `await probeStorage()`; on failure it throws `Storage is not reachable at
  SUPABASE_URL. Start the local stack (pnpm supabase start) and create the buckets (README, "Photos and Storage").`
  After the truncate, `emptyBucket` for `incoming`, `photos-draft`, `photos`, `photo-archive`. A missing Storage is a
  failed run, as a missing database is.
- `e2e/helpers.ts`: if `axeViolations`, `ranBreak` and `signedIn` still live in `e2e/layout.spec.ts`, move them here
  unchanged (exported) and update that file's imports. `ranBreak(browser, host, o?: { photos?: number })` composes with
  `composeBreakWithPhotos` when `photos` is set, else as today.
- `e2e/photo-helpers.ts` as in Interfaces.

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec tsc --noEmit`
Expected: clean.
Run (sandbox off; the local stack up): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; /usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test:e2e e2e/layout.spec.ts`
Expected: PASS (a regression pin for the move: nothing in the layout tests changes).

- [ ] **Step 6: Append the journeys to `e2e/photos.spec.ts`**

At the end of the file Task 8b created, a new `test.describe("photo journeys (Task 12b)", …)` with
`test.describe.configure({ mode: "serial" })`, `const run = Date.now()`, users `ph${run}@e2e.test` (host) and
`pb${run}@e2e.test` (buyer), handles at most 20 characters (`ph` + 13 digits is 15), an anonymous context for strangers;
every signed-in page through `loginAs`. Every photo comes from `jpeg(n)`. Each test carries the assertions listed (UI by
role and name, or by the helpers; spec §9 words are the names):

1. `"a host adds photos from the composer and opens the break; the photo shows on the feed card, the plate and the Prizes block, served from photos"`:
   `fillComposer(page, { title: \`Photos ${run}\` })`, `addPhotos(page, [1, 2])`, `describeTile(page, 1, "Chronos on a desk")`,
   `tagTile(page, 1, "Chronos 22g")`, click `composer-open`, wait for `/b/<uuid>`.
   - On `/breaks?host=ph${run}`: the break's `[data-testid="break-card"]` has exactly one `img`, with `alt=""` and a `src`
     containing `/storage/v1/object/public/photos/`; its `thumb` still renders `data-tone` cells.
   - Card geometry: `card-media` contains both the plate and the `thumb` boxes; they intersect; the intersection is at
     most a third of the plate's area; a photo-less card on the same page (`composeBreak` beforehand) has its title's left
     edge equal to this card's.
   - On the break page: the button named `Prize photos, 2` is visible with its `img` `src` under `/public/photos/`; the
     Prizes block's top-spot `prize-place` holds a plate whose `img` has `alt="Chronos on a desk"`.
2. `"a prize's condition shows in the Prizes block"`: on the same break, the top-spot `prize-place` text matches
   `/Chronos 22g.*New in box/`.
3. `"a draft's photo is not readable without the host's signed URL"`: `fillComposer`, `addPhotos(page, [3])`, Save draft;
   on the edit page read the tile `img` `src` (contains `token=`); with `page.request`: that URL answers 200 and
   `content-type` `image/webp`; the same object path under `/storage/v1/object/public/photos-draft/` and under
   `/storage/v1/object/public/photos/` each answer a non-2xx status; an anonymous context gets 404 for the draft's
   `/b/<id>` and its HTML does not contain `photos-draft`.
4. `"after a buyer claims, the host replaces the lead (Remove, then Make lead); the buyer sees 'Lead photo replaced', on /me too, and the old lead marked Removed; a stranger does not"` (ruling 34):
   `composeBreakWithPhotos(host, { title: \`Replace ${run}\`, photos: 2 })`; the buyer claims two lines (as
   `layout.spec.ts` does). Host: `edit-photos`, `addPhotos(host, [5])` (tile 3); `tileMenu(host, 1, "Remove")`; the panel
   shows exactly "Buyers in this break will still see this photo, marked Removed."; click "Remove photo"; then
   `tileMenu(host, 2, "Make lead")` (the new photo, now second); close the sheet.
   - Buyer's break page (reloaded): `photo-plate` contains "Updated" and its box ends inside the first viewport
     (`y + height <= viewport height`); `photo-notice-line` contains "Lead photo replaced"; one `removed-plate` whose
     text matches `/Removed [A-Z][a-z]{2} \d{1,2}/` and whose `img` `src` contains `token=`.
   - Buyer's `/me`: `my-photo-notice` contains "Lead photo replaced". After the buyer's break page has rendered (above),
     `expect.poll` on a `/me` reload, up to 5 s, until `my-photo-notice` has count 0; the card's plate is still there.
   - Stranger's break page: no text "Removed", no `img` whose `src` contains `photo-archive` or `token=`, and
     `photo-notice-line` contains "Lead photo replaced".
5. `"removing the only photo after a claim: no plate, the feed falls back to the kit thumbnail, the notice says what was removed, and the buyer still sees it marked Removed"` (Review Focus 2):
   a break with one photo tagged "Chronos 22g" (`fillComposer`, `addPhotos([6])`, `tagTile`, open) and one buyer claim;
   the host removes it through `edit-photos` and "Remove photo". Then: the break page has no button named
   `/Prize photos/`; the feed card has no `img` and its `thumb` is 96 px (`width:108px` in its style); the buyer's
   `photo-notice-line` reads "Top-spot photo removed" and one `removed-plate` shows; the buyer's `/me` card shows
   "Top-spot photo removed" and no `plate`; the stranger's page has neither a `removed-plate` nor the text "Removed".
6. `"a draft's photos and tags survive a re-save that removes an 'or' alternative"`: `fillComposer(page, { title, alternative: "Phantom 24g" })`,
   `addPhotos([7, 8])`, `tagTile(1, "Chronos 22g")`, `tagTile(2, "Phantom 24g")`, `describeTile(2, "Phantom on a mat")`,
   Save draft; on the editor remove the alternative, Save draft; reopen the editor: 2 tiles; tile 1's Tag panel has
   "Chronos 22g" checked, tile 2's has "No tag" checked; tile 2's Describe field still reads "Phantom on a mat".
7. `"Delete draft removes the draft's photos"`: a draft with `addPhotos([9])`; read the object prefix from the tile's
   `src`; `expect(await listObjects("photos-draft", prefix)).toHaveLength(3)`; Delete draft (`delete-draft`, then
   `delete-draft-confirm`); the draft is gone from `/host`; `expect.poll(() => listObjects("photos-draft", prefix))`
   becomes `[]` within 5 s (Delete draft removes them itself; the cleanup cron is not needed).
8. `"axe finds no WCAG 2.1 A or AA violation on every page the photos touch"`: with `axeViolations`: `/`, `/breaks`,
   `/h/ph${run}`, the break page of test 4 (anonymous and the buyer), the pay sheet with its `pay-break` header (the
   buyer, an owed line), `/me` with the notice, `/host`, `/host/new` with two ready tiles and a tile panel open, the
   "Edit photos" dialog, and the result page of `ranBreak(browser, host, { photos: 2 })` (anonymous and the buyer; the
   Prizes block under the full order). `expect(found).toEqual([])`.

Review Focus 2 is test 5. Review Focus 5 (the viewer at the edges) is Task 8b's.

- [ ] **Step 7: Run the photos spec until it is green**

Run (sandbox off; the local stack up, buckets created): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; /usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test:e2e e2e/photos.spec.ts`
Expected: Task 8b's tests and these 8 pass. A failure that is a real product defect is fixed in the owning task's file and
reported; a selector changes only when the owning task named it differently.

- [ ] **Step 8: Commit the e2e**

```bash
git add e2e
git commit -m "test(e2e): photo journeys across surfaces, axe on every touched page"
```

- [ ] **Step 9: README**

`README.md`:
- "Local setup": after the `pnpm supabase start` line, say Storage runs with the stack (enabled in `supabase/config.toml`) and add a
  "Photos and Storage" subsection: create the four buckets with Task 1's buckets script (the exact `pnpm exec tsx scripts/<name>.ts`
  command and what it creates: `incoming` private 5 MB, `photos-draft` private, `photos` public `image/webp`, `photo-archive`
  private; no policies for `anon` or `authenticated`); it is idempotent and is also run once against production; the preflight now
  includes a Storage probe (Docker, every `supabase_*` container including Kong and Storage, auth health, Mailpit, then Storage);
  the e2e reaches Storage with the service-role key from `.env.local`, fails (never skips) when Storage or the buckets are missing,
  and empties them before each run.
- sharp: a direct, pinned dependency for the finalise route (`/api/photos/finalise`, Node runtime) and, when Task 10 chose the PNG
  fallback, the link preview route; nothing else imports it.
- The new cron: the daily photo cleanup route and schedule exactly as `vercel.json` names them (copy path and schedule from that
  file), what it removes (spec §5.6), that it is separate from the minute tick and needs `CRON_SECRET` like it, and a link to Task
  11's runbook for `scripts/hide-photo.ts`. Keep Task 11's two README lines.
- Scripts table: `pnpm budget` ("Measure `/b/[id]` first-load JS from the last build and fail past the allowance; run after `pnpm build`").
- UI conventions: one bullet on the plate (never the board's language; paper and board surfaces), and one on `e2e/photos.spec.ts`.

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm lint`
Expected: clean.

- [ ] **Step 10: The budget after the plan, and the whole suite**

Run (sandbox off): `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm build && pnpm budget`
Expected: prints the first-load JS and CSS, `js - base.js <= 4036`, exit 0, no forbidden marker. If it is over: one round, move the
cause out of the first load (a `next/dynamic` or a server-computed prop), rebuild and re-measure; if still over, record the figure and
the largest chunks in the deferred findings and report it, as Plan C did.
Then, in one command (sandbox off, 10-minute timeout):
`export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH; /usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:concurrency && pnpm test:ci && pnpm test:e2e`
Expected: all green, no flake tolerated.

- [ ] **Step 11: Record the budget**

`docs/superpowers/plans/2026-10-14-plan-c-deferred-findings.md`, Budget section: add "Under Turbopack the Plan C measurement stopped
working (`app-build-manifest.json` is no longer written). `scripts/measure-first-load.mjs` reads the route's client-reference manifest
and the root files instead; on `<BASE sha>` it measures js `<N>`, css `<M>` (not comparable with the figures above). Plan D's allowance
is the 4 036 B left of the 12 288 B; after Plan D js is `<N2>` (`+<N2-N>` B)." filled with the real numbers from
`scripts/first-load-base.json` and Step 10.

- [ ] **Step 12: Commit**

```bash
git add README.md docs/superpowers/plans/2026-10-14-plan-c-deferred-findings.md
git commit -m "docs: Storage, buckets, sharp, the photo cron and the first-load budget"
```

**Reviewer: Opus.** Focus: (a) no e2e reaches Storage through app code (`photoStorage()`), only `e2e/db.ts`; (b) no image
file is committed; (c) the replace test runs Remove then Make lead and reads "Lead photo replaced"; (d) the copy audit's
guard test fails if the photo paths match nothing; (e) the budget figure is recorded with its base sha.

---
