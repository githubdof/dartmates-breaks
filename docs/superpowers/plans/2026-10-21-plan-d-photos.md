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
export function photoStorage(): PhotoStorage; // supabaseAdmin()-backed
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
14. **Replace** in the strip (Task 7) runs as add, then remove the old lead, then move the new photo to the front, so
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
    - Task 8: `PrizesBlock` takes `frozen?: boolean` and resolved view data (it reads no database);
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
      buckets and probes Storage; `COPY_MODULE` gains `domain/photos/types`, `components/photos/(shrink|strip-state)`,
      `app/photos/actions` and `api/photos/finalise/route`.
20. **Precedence**: some task bodies cite a writer's "Contract changes" item by number, and Tasks 3 and 5 keep their own
    "Contract changes" subsections as context. Where any of them differs from these rulings, the rulings win.

## Before any task

Read the spec in full, then Mosaic §6, §8 and §11. Confirm the local preflight (Docker, every `supabase_*` container
including Kong and Storage, auth health, Mailpit) per `README.md`. Work in the plan's worktree.

## Task map (writers expand each task below into full TDD steps; the stubs fix scope, files and interfaces)

| Task | What | Model |
|---|---|---|
| 1 | Storage foundation: config, buckets, policies, `PhotoStorage`, memory fake, preflight | Opus |
| 2 | Migration 0005: tables, columns, triggers, backfill; claims set `first_claimed_at` | Opus |
| 3 | Prize slots, condition, idempotent drafts, Delete draft (domain + composer form) | Opus |
| 4 | `processPhoto`: sharp hardening and variants | Opus |
| 5 | Photo domain: tickets, commands, notice, queries, concurrency | Opus |
| 6 | Pipeline wiring: actions, finalise route, open copy, URLs, archive moves | Opus |
| 7 | Composer photos UI: strip, shrink, upload states, Edit photos sheet | Sonnet |
| 8 | Break page: plate, Prizes block, viewer, notice seen, layout | Sonnet |
| 9 | Other surfaces: feed and profile cards, /me, /host, pay sheet, result | Sonnet |
| 10 | Link preview photo | Opus |
| 11 | Cleanup cron and the hide script with its runbook | Opus |
| 12 | Budget measurement, copy audit, the photos e2e journey, README | Sonnet |

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
- Create: `src/storage/photo-storage.ts`
- Create: `src/storage/ensure-buckets.ts`
- Create: `tests/helpers/memory-storage.ts`, `tests/helpers/photo-storage-contract.ts`, `tests/helpers/memory-storage.test.ts`
- Create: `tests/ci/storage.test.ts`
- Modify: `vitest.ci.config.mts` (the `server-only` alias the unit config already has)
- Create: `scripts/create-buckets.ts`
- Modify: `README.md` (Preflight section, Storage and buckets, the restart rule, the script in the Scripts table)

**Interfaces:**
- Consumes: `env()` (`src/lib/env.ts`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`); `supabaseAdmin()`
  (`src/auth/supabase.ts`); `@supabase/supabase-js` 2.118 (`SupabaseClient`, `storage.from(b).createSignedUploadUrl`,
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
  - `src/storage/photo-storage.ts` (`import "server-only"`):
    ```ts
    export class TooLarge extends Error {}         // download past maxBytes
    export class StorageNotFound extends Error {}  // download of a missing object
    export interface PhotoStorage {
      createSignedUpload(name: string): Promise<{ url: string; token: string }>; // into `incoming`, upsert false; the URL lives 2 h (Storage's fixed value), the ticket enforces 5 minutes
      download(bucket: BucketName, path: string, maxBytes: number): Promise<Buffer>; // TooLarge past maxBytes (checked on Content-Length and while streaming); StorageNotFound when missing
      put(bucket: BucketName, path: string, body: Buffer, contentType: "image/webp"): Promise<void>; // cacheControl "3600", upsert true
      copy(from: { bucket: BucketName; path: string }, to: { bucket: BucketName; path: string }): Promise<void>; // destination already there: resolves, unchanged
      remove(bucket: BucketName, paths: string[]): Promise<void>; // missing paths are not an error; batches of 1000
      signedReadUrl(bucket: BucketName, path: string, seconds: number): Promise<string>;
      list(bucket: BucketName, prefix: string): Promise<{ name: string; createdAt: Date }[]>; // every object under `prefix` ("" = the whole bucket), recursively, every page; `name` is the full path in the bucket; folders omitted
    }
    export function photoStorage(): PhotoStorage; // supabaseAdmin()-backed
    ```
  - `src/storage/ensure-buckets.ts` (no `server-only`):
    `ensureBuckets(admin: SupabaseClient): Promise<{ bucket: BucketName; action: "created" | "updated" | "ok" }[]>`
    (creates a missing bucket, updates one whose `public`, `file_size_limit` or `allowed_mime_types` differ from
    `BUCKET_SETTINGS`, in `Object.values(BUCKETS)` order) and
    `clientStoragePolicies(sql: postgres.Sql): Promise<{ table: string; policy: string; roles: string[] }[]>` (every
    `pg_policies` row in schema `storage` whose roles overlap `anon`, `authenticated` or `public`).
  - `tests/helpers/memory-storage.ts`: `createMemoryStorage(clock?: () => Date): PhotoStorage & { files: Map<string, Buffer> }`,
    `files` keyed `` `${bucket}/${path}` ``; `list` reports each file's `createdAt` as `clock()` at its `put`/`copy`
    (default `() => new Date()`); `download` throws the same `TooLarge`/`StorageNotFound`; `createSignedUpload(name)`
    returns `{ url: "memory://upload/incoming/" + name, token }` and a test "uploads" by setting
    `files.set("incoming/" + name, body)`; `signedReadUrl` returns `` `memory://sign/${bucket}/${path}?seconds=${seconds}` ``.
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

Run (sandbox off): `pnpm test src/storage/buckets.test.ts`
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

Run (sandbox off): `pnpm test src/storage/buckets.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the shared contract suite and run it against the fake (failing)**

Create `tests/helpers/photo-storage-contract.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { BUCKETS } from "@/storage/buckets";
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

    it("copies across buckets, keeps the source, and a second copy is not an error", async () => {
      const body = randomBytes(100);
      await s.put(BUCKETS.draft, at("c-640.webp"), body, "image/webp");
      const from = { bucket: BUCKETS.draft, path: at("c-640.webp") }, to = { bucket: BUCKETS.public, path: at("c-640.webp") };
      await s.copy(from, to);
      await s.copy(from, to);
      expect(Buffer.compare(await s.download(BUCKETS.public, at("c-640.webp"), 1000), body)).toBe(0);
      expect(Buffer.compare(await s.download(BUCKETS.draft, at("c-640.webp"), 1000), body)).toBe(0);
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
  const t = new Date("2026-10-01T00:00:00Z");
  const s = createMemoryStorage(() => t);
  await s.put(BUCKETS.public, "b/x-160.webp", Buffer.from("x"), "image/webp");
  expect([...s.files.keys()]).toEqual(["photos/b/x-160.webp"]);
  expect(await s.list(BUCKETS.public, "b")).toEqual([{ name: "b/x-160.webp", createdAt: t }]);
});
```

Run (sandbox off): `pnpm test tests/helpers/memory-storage.test.ts`
Expected: FAIL, `Failed to resolve import "./memory-storage"` (and `@/storage/photo-storage`).

- [ ] **Step 7: Write `src/storage/photo-storage.ts` and `tests/helpers/memory-storage.ts`**

`photo-storage.ts`: the error classes, the interface, and `photoStorage()` over `supabaseAdmin()` exactly as the
Interfaces block says. Choices the signatures leave open:
- `download` does not use supabase-js (it buffers the whole body): `fetch(`${env().SUPABASE_URL}/storage/v1/object/authenticated/${bucket}/${path}`)`
  with `apikey` and `Authorization: Bearer` set to the service role key; a 400 or 404 whose body mentions "not found"
  throws `StorageNotFound`; a `Content-Length` above `maxBytes` throws `TooLarge` before reading; otherwise read the
  stream, cancel it and throw `TooLarge` as soon as the running total passes `maxBytes`.
- `copy`: `storage.from(from.bucket).copy(from.path, to.path, { destinationBucket: to.bucket })`; an error whose
  `statusCode` is `"409"` or message matches `/already exists/i` resolves.
- `list`: `storage.from(bucket).list(dir, { limit: 1000, offset })` page by page; an entry with `id === null` is a
  folder and is walked; files become `{ name: `${dir}/${entry.name}` (or `entry.name` at the root), createdAt: new Date(entry.created_at) }`.
- Every other Supabase `error` is rethrown as an `Error` whose message names the bucket and path.

`memory-storage.ts`: a `Map<string, Buffer>` plus a private `Map<string, Date>` for dates; same errors; `remove`
ignores missing keys; `copy` leaves an existing destination as it is.

- [ ] **Step 8: Run the fake's tests to see them pass**

Run (sandbox off): `pnpm test tests/helpers/memory-storage.test.ts src/storage`
Expected: PASS (7 contract tests, the clock test, 4 bucket tests).

- [ ] **Step 9: Restart the local stack with Storage on, and check every container**

Run (sandbox off, from this task's checkout): `./node_modules/.bin/supabase stop && ./node_modules/.bin/supabase start`
Expected: `supabase start` prints the API URL and a Storage URL, and its output has no "Stopped services" line naming
kong or storage. Then run (sandbox off):
`docker ps -a --filter name=supabase_ --format '{{.Names}} {{.Status}}' | sort`
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

Run (sandbox off): `pnpm test:ci tests/ci/storage.test.ts`
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
`SUPABASE_SERVICE_ROLE_KEY` (built with `createClient`, not `supabaseAdmin()`, which is `server-only`), `ensureBuckets`,
then `clientStoragePolicies` over `postgres(process.env.DATABASE_URL!, { max: 1, prepare: false })` (the database that
holds the `storage` schema: `postgres` locally, the project's database in production), printing and exiting as the
Interfaces block says. Header comment: what it does, that it is idempotent, that it runs once per environment
(locally after the first `supabase start` with Storage on, in production once before the photos release and again
after any change to `BUCKET_SETTINGS`), and that an explicit `DATABASE_URL` wins over the file.

- [ ] **Step 11: Create the buckets locally and probe Storage**

Run (sandbox off): `ENV_FILE=.env.local pnpm exec tsx scripts/create-buckets.ts && ENV_FILE=.env.local pnpm exec tsx scripts/create-buckets.ts`
Expected: the first run prints four lines, each `ok` (the stack made them from `config.toml`) or `created`; the second
prints `incoming ok`, `photos-draft ok`, `photos ok`, `photo-archive ok`, then `no client policies on storage`, exit 0.

Run (sandbox off): `set -a; . ./.env.local; set +a; curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" http://127.0.0.1:54321/storage/v1/bucket | grep -o '"name":"[a-z-]*"' | sort`
Expected:

```
"name":"incoming"
"name":"photo-archive"
"name":"photos"
"name":"photos-draft"
```

- [ ] **Step 12: Run the Storage CI test to see it pass**

Run (sandbox off): `pnpm test:ci`
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
drops their files under the same exception. Hosts never get the flag; Task 5's `hidePhoto` and Task 11's cleanup and
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
    - `path` is `{break_id}/{22 url-safe characters}` or null, and null (every copy gone) only on a removed or hidden
      row; a live row is never in `photo-archive` (`break_photos_gone_chk`); `path` only ever changes to null.
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

  it("refuses an alt outside 1–120 characters, a path outside the break's folder, an unknown bucket, and a dropped or archived live photo", async () => {
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
      expect(await refusal(tx, sql`update break_photos set bucket = 'photo-archive' where id = ${id}`)).toMatch(/break_photos_gone_chk/);
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

Run (sandbox off): `pnpm test src/db/migrations.test.ts src/domain/lines/commands.test.ts`
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
    check("break_photos_gone_chk", sql`(${t.path} is not null and ${t.bucket} <> 'photo-archive') or ${t.removedAt} is not null or ${t.hiddenAt} is not null`),
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

Run: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate --name photos`
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
`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate --name photos_drop`
Expected: no prompt; `0006_photos_drop.sql` holds exactly `ALTER TABLE "break_items" DROP COLUMN "photo_paths";`.

Merge it into 0005 (one migration, forward-only):

```bash
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
`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate --name check` must print
`No schema changes, nothing to migrate` and write nothing, and
`node -e 'const e=require("./src/db/migrations/meta/_journal.json").entries;console.log(e.length, e[5].tag, e[5].when>e[4].when?"ok":"BAD")'`
must print `6 0005_photos ok`. Anything else: `git checkout src/db/migrations` and `git clean -f src/db/migrations`,
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

Run (sandbox off): `ENV_FILE=.env.local pnpm db:migrate && ENV_FILE=.env.test pnpm db:migrate && DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/breaks_e2e pnpm db:migrate`
Expected: `migrated` three times. Then
`psql`-free check (sandbox off): `node -e 'const p=require("postgres")("postgresql://postgres:postgres@127.0.0.1:54322/postgres",{max:1});p\`select count(*)::int n from breaks where first_claimed_at is null and exists (select 1 from lines l where l.break_id = breaks.id and l.owner_id is not null)\`.then(r=>{console.log(r[0].n);return p.end()})'`
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

Run (sandbox off): `pnpm test src/db src/domain/lines`
Expected: PASS, including the 13 "migration 0005 photos" tests, the 6 `first_claimed_at` tests, the existing 0001 and
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
git add src/db/schema.ts src/db/migrations src/db/migrations.test.ts src/db/photo-moderation.ts \
  src/domain/lines/commands.ts src/domain/lines/commands.test.ts tests/concurrency/setup.ts e2e/global-setup.ts README.md
git commit -m "feat(db): migration 0005 for photos, prize slots, item condition and first claims"
```

---


### Task 3: Prize slots, condition, idempotent drafts, Delete draft (model: Opus)

Spec §4.1, §7 (condition), §9 (the composer's id, Delete draft), decision 16. Photo tags point at a prize's
**slot key**, so a draft save must keep every slot it already has: `updateDraft` stops deleting and reinserting
prizes and instead updates kept slots in place, inserts new ones and deletes only removed ones (clearing the photo
tags of removed slots). Each prize gains a condition. The composer makes the new break's id when the page renders
and posts it, and `createDraft` becomes idempotent on that id for the same host, so the first photo (Task 7), a Save
pressed while it uploads, and a reload all land on one draft. Drafts gain **Delete draft**: the break row stays as a
tombstone (`deleted_at`), because `events.break_id` references it and events are append-only; prizes, items, photo
rows and tickets go.

**Rulings made in this task** (the caller records them in the plan):
- R3.1 The break row of a deleted draft is kept with `breaks.deleted_at` set (Contract changes, item 2).
  `lockBreak` treats a deleted break as `NotFound`, so every command (this plan's photo commands included) refuses it;
  `getBreakPage`, `draftForEdit`, `listHostBreaks` and `lastBreakDefaults` skip it.
- R3.2 `createDraft` with an id that already exists: same host and still a draft → it applies the input exactly as
  `updateDraft` does (one row, `break.updated`, no second `break.created`); another caller's id → `NotAuthorized`
  (admins included: an admin edits through `updateDraft`); a break that is no longer a draft → `NotOpen`; a deleted one
  → `NotFound`.
- R3.3 Save draft and Open break keep redirecting to `/b/{id}` (design §5.6; pinned by journey-2, pages and layout
  e2e). "The page moves to the draft's edit address" (spec §9) is for a draft created while the composer stays open
  (Task 7's first photo): `moveToEditAddress(id)` replaces the URL with `/host/{id}/edit` through
  `history.replaceState`, so typing and uploads in flight survive and a reload lands on the editor.
- R3.4 Items keep the composer's order: `insertPrizes` stamps `break_items.created_at` with `clock_timestamp()`
  (today every item of one save shares the transaction's `now()` and the order falls back to a random uuid).
- R3.5 Condition copy (spec §7): "New in box", "New, opened", "Used"; the select's empty first option reads
  "Condition". The select is required in the browser on the first top-spot row only (as the name is); parse enforces
  it for every named row.

**Files:**
- Create: `src/domain/breaks/condition.ts` (import-free, so the client composer may import it)
- Modify: `src/domain/breaks/rules.ts` (re-export the condition module; `validatePrizes`)
- Modify: `src/domain/breaks/commands.ts` (`CreateDraftInput`, `insertPrizes`, `createDraft`, `updateDraft`, new
  `deleteDraft`), `src/domain/breaks/commands.test.ts`
- Modify: `src/domain/breaks/queries.ts` (`DraftForEdit`, `draftForEdit`, `getBreakPage`, `listHostBreaks`,
  `lastBreakDefaults` skip deleted), `src/domain/breaks/queries.test.ts` (line 154's literal)
- Modify: `src/auth/authz.ts` (`lockBreak` refuses a deleted break)
- Modify: `tests/helpers/fixtures.ts` (`prize`, `photoRow`)
- Create: `tests/concurrency/drafts.test.ts`
- Create: `src/app/host/new/prize-rows.ts`, `src/app/host/new/prize-rows.test.ts` (the composer's prize rows, pure)
- Create: `src/app/host/new/draft-address.ts`, `src/app/host/new/draft-address.test.ts`
- Modify: `src/app/host/new/parse.ts`, `parse.test.ts`, `initial.ts`, `initial.test.ts`, `form.tsx`,
  `form-render.test.ts`, `actions.ts`, `page.tsx`; `src/app/host/[id]/edit/page.tsx`
- Create: `src/app/host/actions.ts` (`deleteDraftAction`), `src/app/host/delete-draft-button.tsx`,
  `src/app/host/delete-draft-button.test.ts`
- Modify: `src/app/host/page.tsx` (Delete draft on draft rows)
- Modify: `e2e/helpers.ts`, `e2e/journey-1.spec.ts`, `e2e/journey-2.spec.ts`, `e2e/layout.spec.ts` (choose a
  condition), `e2e/pages.spec.ts` (the Delete draft journey)

**Interfaces:**
- Consumes (Task 2's migration and `src/db/schema.ts`): `prizes.slotKey` (`slot_key uuid not null default
  gen_random_uuid()`, unique per `(break_id, slot_key)`; existing rows backfilled), `breakItems.condition`
  (`text`, nullable, check `in ('new_in_box','new_opened','used')`), `breaks.deletedAt` (Contract changes, item 2),
  `breakPhotos` (`breakId`, `position`, `prizeSlot`, `path`, `bucket`, `width`, `height`, `alt`, `createdBy`),
  `photoUploads` (`hostId`, `breakId`, `incomingName`, `expiresAt`). `PhotoLocation` (Task 5's
  `src/domain/photos/types.ts`; if Task 5 has not landed, import the type from Task 2's schema bucket union; it is
  `"photos-draft" | "photos" | "photo-archive"`). Existing: `assertHostOf`, `lockBreak`, `appendEvent`, `isUuid`,
  `action`, `ActionFailure`, `withTx`, `makeUser`.
- Produces:
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
    `deleted_at`; appends `break.deleted` with `{ photos: n }`; returns every photo row's `bucket` and `path` for
    Task 6 to remove from storage.
  - `DraftForEdit.topSpot` and `.secondPlace`: `{ slotKey: string; name: string; condition: ItemCondition | null
    }[]`, in the composer's order.
  - `ComposerInitial`: gains `newBreakId: string | null` (set for a new break, `breakId` stays the editing id);
    `prize1: PrizeRow[]`, `prize2: PrizeRow | null`, where `type PrizeRow = { slotKey: string; name: string;
    condition: ItemCondition | "" }` (`prize-rows.ts`). `newComposerInitial(defaults, handles, newId: () =>
    string)`, `draftComposerInitial(d, handles, newId: () => string)`.
  - Form fields: `newBreakId` (hidden), `prize1`/`prize1Slot`/`prize1Condition` (repeated, same order),
    `prize2`/`prize2Slot`/`prize2Condition`.
  - `moveToEditAddress(breakId: string): void`, `editAddress(breakId: string): string` (`draft-address.ts`), for
    Task 7.
  - `deleteDraftAction(breakId: string): Promise<ActionFailure>` (`src/app/host/actions.ts`): redirects to `/host`
    on success; Task 6 adds the storage removal between the transaction and the redirect.
  - `DeleteDraftButton({ breakId, title }: { breakId: string; title: string })` (client).

- [ ] **Step 1: Write the failing domain tests**

In `tests/helpers/fixtures.ts`, add:

```ts
/** A composer prize: a fresh slot key unless given. */
export const prize = (name: string, condition: ItemCondition = "new_in_box", slotKey: string = randomUUID()) => ({ name, slotKey, condition });
/** A break_photos row straight into the table (Task 5's commands are not needed to test slots and deletes). */
export async function photoRow(tx: Tx, o: { breakId: string; hostId: string; position: number; slot: string | null; bucket?: "photos-draft" | "photos" }): Promise<string>;
// path `${breakId}/${22 url-safe chars}`, width 1600, height 1200, alt "Darts"; returns the row id.
```

In `src/domain/breaks/commands.test.ts`: `input.items` becomes `[prize("Chronos 22g"), prize("Chronos 24g")]`;
every other item literal in this file and in `queries.test.ts` goes through `prize(…)`. Import `deleteDraft`,
`draftForEdit`, `listHostBreaks`, `NotFound`, `randomUUID`, `breakPhotos`, `photoUploads`, `prizes`, `breakItems`.
Local helpers: `slotItems(tx, breakId): Promise<Map<string, string>>` (slot key → item id from `prizes`) and
`photoSlot(tx, photoId): Promise<string | null>`. Add:

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
  it("freezes a prize's condition with its item after the first paid line", async () => {
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
      await photoRow(tx, { breakId, hostId: host.id, position: 0, slot: input.items[0].slotKey });
      await photoRow(tx, { breakId, hostId: host.id, position: 1, slot: null });
      await tx.insert(photoUploads).values({ hostId: host.id, breakId, incomingName: "x", expiresAt: new Date(Date.now() + 300_000) });
      const { photos } = await deleteDraft(tx, asHost(host), breakId);
      expect(photos).toHaveLength(2);
      expect(photos.every((p) => p.location === "photos-draft" && p.prefix.startsWith(`${breakId}/`))).toBe(true);
      for (const t of [prizes, breakItems, breakPhotos, photoUploads]) {
        expect(await tx.select().from(t).where(sql`${t.breakId} = ${breakId}`)).toHaveLength(0);
      }
      const evs = await tx.select().from(events).where(sql`${events.breakId} = ${breakId}`);
      expect(evs.map((e) => e.type)).toEqual(expect.arrayContaining(["break.created", "break.deleted"]));
      expect(evs.find((e) => e.type === "break.deleted")!.payload).toEqual({ photos: 2 });
      expect(await draftForEdit(tx, breakId)).toBeNull();
      expect(await getBreakPage(tx, breakId)).toBeNull();
      expect((await listHostBreaks(tx, host.id)).map((b) => b.id)).not.toContain(breakId);
    });
  });
  it("is for the host or an admin, and only while the break is a draft", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const other = await makeUser(tx, { role: "host" }); const member = await makeUser(tx);
      const admin = await makeUser(tx, { role: "admin" });
      const a = await createDraft(tx, asHost(host), input);
      await expect(deleteDraft(tx, asHost(other), a.breakId)).rejects.toBeInstanceOf(NotAuthorized);
      await expect(deleteDraft(tx, asMember(member), a.breakId)).rejects.toBeInstanceOf(NotAuthorized);
      await deleteDraft(tx, { ...asHost(admin), role: "admin" }, a.breakId);
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
Expected: FAIL. `deleteDraft` and `prize` are not exported; `createDraft` ignores the id (the idempotency tests see two
rows or a new id); `draftForEdit` returns names, not slots; `tsc` errors on the `CreateDraftInput` literals are
expected until Step 3.

- [ ] **Step 3: Implement the condition module, `validatePrizes`, and the commands**

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
- `updateDraft`: replace the delete-all with `syncPrizes(tx, breakId, input)` (private): read the break's item prizes
  (`item_id is not null`) with their slot keys; for an input slot already present update its item (`name`,
  `variantSchema`, `expectedShipAt`, `condition`) and its prize `rank` if different; insert the rest through the same
  path as `insertPrizes`; delete the prizes of slots not in the input, then their items, then
  `update break_photos set prize_slot = null where break_id = $1 and prize_slot = any($removed)`. The `break.updated`
  payload is unchanged.
- `deleteDraft`: `assertOnboarded`; `assertHostOf` (locks; host or admin); `status !== "draft"` → `NotOpen`; select
  `bucket`, `path` from `break_photos` (every row); delete `break_photos`, `photo_uploads`, prizes, items; set
  `deletedAt: new Date()`; `appendEvent({ breakId, actorId: caller.id, type: "break.deleted", payload: { photos: n } })`;
  return `{ photos: rows.map((r) => ({ location: r.bucket, prefix: r.path })) }`.
- `lockBreak` (`src/auth/authz.ts`): a row with `deletedAt` set throws `NotFound("Break not found")`.
- `queries.ts`: `draftForEdit` selects `slotKey` and `condition` and returns `null` for a deleted break;
  `getBreakPage` returns `null` for a deleted break; `listHostBreaks` and `lastBreakDefaults` add
  `isNull(breaks.deletedAt)`.

- [ ] **Step 4: Run the domain tests to verify they pass**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/domain && pnpm test:concurrency`
Expected: PASS, including every existing `createDraft`/`updateDraft`/`openBreak` test with the `prize(…)` literals.

- [ ] **Step 5: Write the failing composer tests**

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
  });
  it("changes a row's name or condition without touching its slot", () => {
    const rows = [{ slotKey: "s1", name: "", condition: "" as const }];
    expect(setName(rows, 0, "Chronos 22g")).toEqual([{ slotKey: "s1", name: "Chronos 22g", condition: "" }]);
    expect(setCondition(rows, 0, "used")).toEqual([{ slotKey: "s1", name: "", condition: "used" }]);
  });
});
```

Signatures: `blankRow(newId: () => string): PrizeRow`; `addChoice(rows, newId)`; `removeChoice(rows, i)` (never row
0); `setName(rows, i, name)`; `setCondition(rows, i, c: ItemCondition | "")`; all return new arrays.

`src/app/host/new/draft-address.test.ts`:

```ts
it("moves the composer to the draft's edit address without a navigation", () => {
  const replaceState = vi.fn();
  vi.stubGlobal("window", { history: { state: { k: 1 }, replaceState } });
  moveToEditAddress("6f1c2a3b-0000-4000-8000-000000000001");
  expect(replaceState).toHaveBeenCalledWith({ k: 1 }, "", "/host/6f1c2a3b-0000-4000-8000-000000000001/edit");
  expect(editAddress("abc")).toBe("/host/abc/edit");
});
```

(`moveToEditAddress` passes the current `history.state` through, which the App Router keeps its entry in.)

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
it("asks for the condition of every named prize", () => {
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
condition: <first's> }`.

`form-render.test.ts` adds:

```ts
it("posts the new break's id, a hidden slot per prize row and a condition select", () => {
  const h = renderToStaticMarkup(createElement(ComposerForm, { initial: newComposerInitial(null, {}, ids()), maxLines: 50, kit: PLUM_LIME }));
  expect(h).toContain('name="newBreakId" value="00000000-0000-4000-8000-000000000001"');
  expect(h).toContain('name="prize1Slot" value="00000000-0000-4000-8000-000000000002"');
  expect(h).toMatch(/<select[^>]*name="prize1Condition"[^>]*required/);
  expect(h).toMatch(/<option value="">Condition<\/option><option value="new_in_box">New in box<\/option><option value="new_opened">New, opened<\/option><option value="used">Used<\/option>/);
  expect(h).not.toContain('name="breakId"');
});
it("the draft editor posts the draft's id and keeps each prize's slot and condition", () => {
  const d = { ...draft, topSpot: [{ slotKey: S1, name: "22g", condition: "used" as const }], secondPlace: [{ slotKey: S2, name: "Flights", condition: "new_opened" as const }] };
  const h = renderToStaticMarkup(createElement(ComposerForm, { initial: draftComposerInitial(d, {}, ids()), maxLines: 50, kit: PLUM_LIME }));
  expect(h).toContain(`name="breakId" value="${d.id}"`);
  expect(h).not.toContain('name="newBreakId"');
  expect(h).toContain(`name="prize1Slot" value="${S1}"`);
  expect(h).toContain(`name="prize2Slot" value="${S2}"`);
  expect(h).toMatch(/<option value="used" selected="">Used<\/option>/);
  expect(h).toContain('data-testid="delete-draft"');
});
```

(`draft` is a `DraftForEdit` literal like the one in `initial.test.ts`; add `vi.mock("../actions", …)` for
`deleteDraftAction` next to the existing `./actions` mock.)

`src/app/host/delete-draft-button.test.ts`: the static render of `DeleteDraftButton` contains a button with
`data-testid="delete-draft"` and text "Delete draft", and not the confirm sentence.

- [ ] **Step 6: Run the composer tests to verify they fail**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/app/host`
Expected: FAIL. `prize-rows`, `draft-address` and `delete-draft-button` fail to resolve; the parse tests see items
without `slotKey`; the render tests find no `newBreakId`, `prize1Slot` or `select`.

- [ ] **Step 7: Implement the composer**

- `parse.ts`: read `prize1`, `prize1Slot`, `prize1Condition` with `getAll`; unequal lengths, a non-uuid or a repeated
  slot (across rank 1 and 2) → the stale-form error; zip, drop rows whose trimmed name is blank, then any remaining
  row whose condition fails `isItemCondition` → `` `${name}: choose its condition` ``. The schema check order stays:
  existing field errors first, then "Top spot: name the prize", then slots, then conditions.
- `initial.ts`: as in Produces; `page.tsx` passes `randomUUID` from `node:crypto`; the edit page passes it too (for
  the blank row of a draft with no top spot).
- `form.tsx`: `choices` state becomes `PrizeRow[]` driven by `prize-rows.ts`, `second` becomes `PrizeRow | null` ("Add
  2nd place" makes one with `crypto.randomUUID()`); both are controlled, so slots and conditions survive re-renders
  and a failed save (React resets only uncontrolled fields). Each row renders its name input, `<input type="hidden"
  name="prize1Slot">`, and a `<select name="prize1Condition">` labelled "Condition" (visually hidden label tied to the
  row's name label; options from `ITEM_CONDITIONS`/`CONDITION_LABEL` imported from `@/domain/breaks/condition`;
  `required` on row 0 only); 2nd place likewise. Hidden `newBreakId` when `initial.newBreakId`, hidden `breakId` as
  today. When `initial.breakId` is set (the draft editor), the form renders `DeleteDraftButton` below its submit
  buttons, outside the `<form>` element's submit path (`type="button"`).
- `actions.ts` (`saveBreak`): `breakId` set → `updateDraft` as today; else `newBreakId` must be a uuid (else "This form
  is out of date. Reload the page and try again.") → `createDraft(tx, caller, parsed.input, { breakId: newBreakId })`.
  Redirect unchanged (ruling R3.3).
- `draft-address.ts`: `editAddress`, `moveToEditAddress` as tested.
- `src/app/host/actions.ts` (`"use server"`): `deleteDraftAction(breakId)`: `parseInput(uuid, …)`, `action((tx, c) =>
  deleteDraft(tx, c, id))`; on failure return it; on success `revalidatePath("/host")`, `redirect("/host")`.
- `delete-draft-button.tsx` (client, ledger-row's inline-confirm pattern): "Delete draft" (`Button variant="text"`,
  `data-testid="delete-draft"`) opens an inline confirm: "Delete this draft? Its prizes and photos go too. This can't be
  undone." with "Delete draft" (`variant="secondary"`, `data-testid="delete-draft-confirm"`, disabled while pending)
  and "Keep"; a failure shows its message in `role="alert"`.
- `src/app/host/page.tsx`: a draft row renders `DeleteDraftButton` beside, not inside, its `Link`.

- [ ] **Step 8: Run the composer tests to verify they pass**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm test src/app/host src/lib/copy-audit.test.ts`
Expected: PASS; the copy audit accepts "New in box", "New, opened", "Used", "Condition" and the confirm sentence.

- [ ] **Step 9: Update the e2e composer fills and add the Delete draft journey**

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

- [ ] **Step 10: Run every gate**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:concurrency && pnpm test:ci`
then (sandbox off) `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test:e2e`
Expected: all green, no lint warnings, no flake; axe passes on /host/new, /host/[id]/edit and /host with the new
select and the Delete draft button.

- [ ] **Step 11: Commit**

```bash
git add src/domain/breaks src/auth/authz.ts tests/helpers/fixtures.ts tests/concurrency/drafts.test.ts \
  src/app/host e2e
git commit -m "feat(breaks): stable prize slots, item condition, idempotent drafts and Delete draft"
```

#### Contract changes (for the caller to apply to the skeleton and to neighbouring tasks)

1. **`ItemCondition` lives in Task 3**, in a new import-free `src/domain/breaks/condition.ts` (with
   `ITEM_CONDITIONS`, `isItemCondition`, `CONDITION_LABEL`), re-exported by `src/domain/breaks/rules.ts`. Task 5's
   `src/domain/photos/types.ts` re-exports `ItemCondition` and `CONDITION_LABEL` from it instead of defining them
   (no cycle: breaks never imports photos except the `PhotoLocation` type). The separate file, not `rules.ts`, because
   the client composer imports the labels and the composer's convention is to import no domain module with
   dependencies.
2. **Task 2 adds `breaks.deleted_at timestamptz` (nullable)** to migration 0005 and `deletedAt` to the schema, with a
   guard (in `breaks_freeze_guard` or its own trigger): `deleted_at` may be set only while `status = 'draft'`, is never
   cleared or changed, and a break with `deleted_at` set cannot change `status`. Reason: `events.break_id` references
   `breaks` with no cascade and events are append-only, so a draft's row cannot be deleted while its events are kept.
   Task 11's cleanup treats `deleted_at is not null` as "photos of deleted drafts".
3. **Task 2's assumed shapes**: `prizes.slot_key uuid not null default gen_random_uuid()` with a unique index on
   `(break_id, slot_key)` (the default keeps `makeBreak`, minis and old rows working); `break_items.condition text`
   nullable with the three-value check. If Task 2 chose otherwise, Task 3's Interfaces follow Task 2.
4. **`createDraft`'s return** stays `{ breakId: string }`; with an existing id it applies the input through
   `updateDraft` (ruling R3.2) rather than returning untouched, so a Save pressed while the first photo created the
   draft does not lose the host's latest typing.
5. **`deleteDraftAction` lives in `src/app/host/actions.ts` (Task 3)**, not `src/app/photos/actions.ts`: it returns
   `ActionFailure` or redirects to `/host`. Task 6 adds `photoStorage().remove(...)` for the returned photos after the
   transaction and before the redirect (best effort; Task 11's cleanup is the backstop). Remove it from Task 6's action
   list.
6. **`lockBreak` refuses a deleted break with `NotFound`**, so Task 5's photo commands need no deleted check of their
   own.
7. **Composer form field names** for Task 7: `newBreakId`, `prize1Slot`, `prize1Condition`, `prize2Slot`,
   `prize2Condition`; the strip reads prize slots and names from the form's `PrizeRow` state (Task 7 lifts or reads it
   from `ComposerForm`), and calls `moveToEditAddress(id)` once its first photo has created the draft.

### Task 4: `processPhoto`, sharp hardening and variants (model: Opus)

The server re-encode that is the security control of spec §5.3 steps 2–3 and §10: magic bytes first, then a
bounded sharp decode that never picks a format on its own, then three WebP variants (160, 640, 1600 px on the long
edge) with no metadata, upright, never upscaled (recorded ruling 4). Pure Node: no database, no storage. Review Focus 1
(odd images) is pinned here.

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
- Test: `src/photos/process.test.ts`

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

Run: `pnpm add sharp@0.35.5 --save-exact`
Then: `grep -c "'@img/sharp-linux-x64@0.35.5'\|'@img/sharp-libvips-linux-x64@1.3.4'" pnpm-lock.yaml` and
`pnpm why sharp`
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

- [ ] **Step 3: Write the failing tests in `src/photos/process.test.ts`**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import sharp from "sharp";
import { processPhoto, UnsupportedImage, MAX_INCOMING_BYTES } from "./process";
import { photoFixtures } from "../../tests/fixtures/photos/make";

let fx: Awaited<ReturnType<typeof photoFixtures>>;
beforeAll(async () => { fx = await photoFixtures(); }, 60_000);
const sizeOf = async (b: Buffer) => { const m = await sharp(b).metadata(); return [m.width, m.height]; };

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
    }
  });
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `pnpm test src/photos/process.test.ts`
Expected: FAIL, "Cannot find module './process'".

- [ ] **Step 5: Implement `src/photos/process.ts`**

- No `server-only` import (the tests import the module directly); sharp is imported only here and by the fixtures.
- At module load, once: `sharp.concurrency(1); sharp.cache(false);`.
- `sniff(buf): "jpeg" | "png" | "webp" | null` — JPEG `FF D8 FF`; PNG `89 50 4E 47 0D 0A 1A 0A`; WebP `RIFF` at 0 and
  `WEBP` at 8. Anything else, including a buffer shorter than 12 bytes, throws `UnsupportedImage` before sharp sees it.
- `const img = sharp(buf, { limitInputPixels: 12e6, failOn: "error", pages: 1, animated: false })`; `await
  img.metadata()` and require `format` to equal the sniffed format (a WebP that libvips reads as something else is
  refused).
- `const base = img.rotate()` (EXIF orientation applied, the tag dropped; `autoOrient()` is equivalent in 0.35).
- Each variant: `base.clone().resize({ width: w, height: w, fit: "inside", withoutEnlargement: true }).webp({ quality: 80
  }).toBuffer()` for `w` of `VARIANT_WIDTHS`, awaited in order. No `withMetadata`, `keepExif`, `keepIccProfile` or
  `keepMetadata` call anywhere. WebP quality 80 is this plan's choice (the spec pins none).
- `width`/`height` from the 1600 variant's `toBuffer({ resolveWithObject: true }).info`.
- Wrap everything after the sniff: any error that is not already `UnsupportedImage` is rethrown as `new
  UnsupportedImage("unsupported image", { cause })`.

- [ ] **Step 6: Run the tests to see them pass**

Run: `pnpm test src/photos/process.test.ts`
Expected: PASS, every case; the file finishes in under 30 s.

- [ ] **Step 7: Gates**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: all clean, no warnings.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml src/photos/process.ts src/photos/process.test.ts tests/fixtures/photos/make.ts
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
- Modify: `tests/helpers/fixtures.ts` (`makePhoto`, `makeTicket`, `addPrize`, `newPrefix`), `tests/concurrency/setup.ts` (truncate list)

**Interfaces:**
- Consumes:
  - Task 2 schema (`src/db/schema.ts`): `breakPhotos` {`id`, `breakId`, `position`, `prizeSlot`, `path`, `bucket`, `width`, `height`, `alt`, `createdBy`, `createdAt`, `hiddenAt`, `removedAt`}; `photoUploads` {`id`, `hostId`, `breakId`, `incomingName`, `expiresAt`, `consumedAt`, `createdAt`}; `photoNoticesSeen` {`userId`, `breakId`, `seenAt`}, primary key (`user_id`, `break_id`); `breaks.firstClaimedAt`, `breaks.photosUpdatedAt`, `breaks.photosUpdatedNote`; `prizes.slotKey` (uuid, not null, default `gen_random_uuid()`). The claim commands set `first_claimed_at` (Task 2). The status trigger refuses photo row changes from `drawing` on (with the exception listed under Contract changes).
  - Task 3: `ItemCondition` from `src/domain/breaks/rules.ts`.
  - Task 1: `PREFIX_PATTERN` from `src/storage/buckets.ts`.
  - Existing: `lockBreak`, `assertHostOf`, `assertOnboarded`, `assertAdmin` (`src/auth/authz.ts`); `appendEvent`; `hitRateLimit` (`src/domain/rate-limit.ts`); `InvalidInput`, `NotAuthorized`, `NotFound`, `NotOpen`, `notOpenMessage`; `Caller`, `SYSTEM`; `plural` (`src/lib/list.ts`); fixtures `makeUser`, `makeBreak`, `openBreakWithLines`; `claimLines`, `markPaid`, `releaseLine`, `requestDraw`.
- Produces (the plan's contracts, with the changes listed at the end of this file):
  - `src/domain/photos/types.ts`: `ItemCondition` (re-exported), `CONDITION_LABEL`, `MAX_PHOTOS = 8`, `PhotoLocation`, `PhotoChange`, and the limits `TICKET_SECONDS = 300`, `MAX_OPEN_TICKETS = 8`, `PHOTO_RATE = { hour: 30, day: 100 }`, `ALT_MAX = 120`, `rateBucket(step: "ticket" | "record", window: "hour" | "day", userId: string): string` (`photo-${step}-${window}:${userId}`).
  - `src/domain/photos/notice.ts`: `noticeFor(changes, placeOf): string | null`; `placeWords(prizes: readonly { slotKey: string; rank: number; itemName: string }[]): (slot: string | null) => string`.
  - `src/domain/photos/commands.ts`: `issueUploadTicket`, `recordProcessedPhoto` (gains `location`), `removePhoto`, `reorderPhotos`, `retagPhoto`, `describePhoto`, `hidePhoto` (returns `prefix: string | null`), `markPhotoNoticeSeen`.
  - `src/domain/photos/queries.ts`: `PhotoView`, `RemovedPhotoView`, `BreakPhotos`, `breakPhotos`, `leadPhotos`.
  - `appendEvent(tx, e, opts: { ignoreDuplicateBatch?: boolean; processedAt?: Date })`.
  - Fixtures: `newPrefix(breakId): string`, `makePhoto(tx, o): Promise<{ id: string; prefix: string }>`, `makeTicket(tx, o): Promise<{ id: string }>`, `addPrize(tx, breakId, rank, name): Promise<string>` (the slot key).

**Pinned rules** (each has a test below):

| Rule | Value |
|---|---|
| Who | `assertOnboarded`, then `assertHostOf` (the break's host or an admin). `hidePhoto`: `assertAdmin` (SYSTEM is an admin). `markPhotoNoticeSeen`: any caller, writes only for a holder. |
| Status | `draft`, `open`, `filled`, else `NotOpen(status)`. `hidePhoto` and `markPhotoNoticeSeen` work at any status. A `mini` gets no ticket. |
| Cap | Issue: live rows + this break's unconsumed tickets with `expires_at > now` < 8. Record: live rows < 8 (the ticket's reservation becomes the row). |
| Rate | Issue and record each hit their own buckets: 30 per hour and 100 per day per caller (`rateBucket`); at most 8 unconsumed, unexpired tickets per caller across breaks. |
| Ticket | `expires_at = now + 300 s`; expired when `now >= expires_at`; consumed once; `incoming_name = ${breakId}/${ticketId}`; `host_id = caller.id`. |
| Positions | Live rows only, 0..n−1, lead at 0, compacted in two statements after remove, hide and reorder. |
| Removal | `breaks.first_claimed_at` set → keep the row (`removed_at = now`, `bucket = 'photo-archive'`), `archive: true`; unset → delete the row, `archive: false`. |
| Counts (§6) | Only once `first_claimed_at` is set: a removal, a new lead (by removal or reorder), a retag away from a prize. Not: add, a reorder that keeps the lead, tagging an untagged photo, describe, an admin hide. |
| Events | `photo.added`, `photo.removed`, `photo.reordered`, `photo.retagged`, `photo.hidden`, one per committed action, `processed_at = now`. No-ops (same order, same slot, already hidden) write nothing. `describePhoto` writes no event (not in the spec's list). |

**Copy** (all `InvalidInput` unless stated; Task 12 adds them to the copy audit):

| Case | Message |
|---|---|
| Cap | `A break can have up to 8 photos.` |
| Open tickets | `Wait for the photos already uploading to finish.` |
| Rate | `Too many photos for now. Try again in 10 minutes.` (`Math.ceil(retryAfter / 60)` minutes up to 60, else `Math.ceil(retryAfter / 3600)` hours) |
| Mini | `A mini shows its parent break's photos.` |
| Ticket missing or another caller's | `NotFound("Upload not found")` |
| Ticket consumed | `This photo was already added.` |
| Ticket expired | `This upload took too long. Add the photo again.` |
| Location mismatch | `The break just opened. Add the photo again.` |
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

Run (sandbox off): `pnpm test src/domain/events.test.ts`
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

Run: `pnpm test src/domain/photos/notice.test.ts`
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

Run: `pnpm test src/domain/photos/notice.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 7: Commit**

```bash
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

In `tests/concurrency/setup.ts`, add `photo_notices_seen, photo_uploads, break_photos` at the front of the truncate list.

- [ ] **Step 9: Write the failing ticket and record tests**

`src/domain/photos/tickets.test.ts`. Shared lines:

```ts
import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, makeBreak, openBreakWithLines, makePhoto, makeTicket, addPrize, newPrefix } from "../../../tests/helpers/fixtures";
import { breaks, breakPhotos, photoUploads, events, prizes } from "@/db/schema";
import { hitRateLimit } from "@/domain/rate-limit";
import { InvalidInput, NotAuthorized, NotFound, NotOpen, notOpenMessage } from "@/domain/errors";
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
  it("refuses another caller's ticket, a used one and an expired one, and adds nothing", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const admin = await makeUser(tx, { role: "admin" });
      const b = await openBreakWithLines(tx, { hostId: host.id });
      const t = await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
      // Another caller, even an admin, cannot finalise a host's ticket; the reply does not say it exists.
      await expect(recordProcessedPhoto(tx, as(admin.id, "admin"), rec(t.ticketId, b.id))).rejects.toThrow(new NotFound("Upload not found"));
      await expect(recordProcessedPhoto(tx, as(host.id), rec("55555555-5555-4555-8555-555555555555", b.id))).rejects.toBeInstanceOf(NotFound);
      await expect(recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id, { now: later(300) }))).rejects.toThrow("This upload took too long. Add the photo again.");
      await recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id));
      await expect(recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id))).rejects.toThrow("This photo was already added.");
      expect(await live(tx, b.id)).toHaveLength(1);
    });
  });
  it("re-checks status, and refuses variants written for the other state of the break", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await makeBreak(tx, { hostId: host.id });
      const t = await issueUploadTicket(tx, as(host.id), { breakId: b.id, now: NOW });
      await setStatus(tx, b.id, "open"); // opened while the photo was processing (Task 6 wrote to photos-draft)
      await expect(recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id, { location: "photos-draft" }))).rejects.toThrow("The break just opened. Add the photo again.");
      await setStatus(tx, b.id, "drawing");
      await expect(recordProcessedPhoto(tx, as(host.id), rec(t.ticketId, b.id))).rejects.toThrow(notOpenMessage("drawing"));
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

Run (sandbox off): `pnpm test src/domain/photos/tickets.test.ts`
Expected: FAIL, `./commands` does not exist.

- [ ] **Step 11: Write `issueUploadTicket` and `recordProcessedPhoto` in `src/domain/photos/commands.ts`**

Signatures as in the plan's contract, with `recordProcessedPhoto`'s `p` gaining `location: "photos-draft" | "photos"`.
Check order for `issueUploadTicket`: onboarded → `assertHostOf` (locks) → status → mini → break cap → open tickets →
hour → day (each `hitRateLimit` with `limit` and `windowSeconds` from `PHOTO_RATE`; refused → `InvalidInput(photoRateMessage(retryAfter))`) → insert.
Check order for `recordProcessedPhoto`, which the race tests depend on:

1. `assertOnboarded`; read the ticket without a lock; missing or `host_id ≠ caller.id` → `NotFound("Upload not found")`.
2. `assertHostOf(tx, caller, ticket.breakId)`: the break lock, before anything else is decided.
3. Re-read the ticket `for update`: consumed, then expired (`now >= expires_at`).
4. Status (`NotOpen`), then `p.location` against it (`photos-draft` exactly when the break is a draft).
5. Inputs: `PREFIX_PATTERN.test(prefix) && prefix.startsWith(`${b.id}/`)`; width and height integers in 1..1600; alt trimmed, 1..120; slot null or a `prizes.slot_key` of this break.
6. Live count ≥ 8 → cap message. Rate limits (`"record"` buckets).
7. Insert at `position = live count`, `bucket = p.location`, `created_by = caller.id`; set `consumed_at = now`; `appendEvent(… "photo.added", { photoId, position, slot, location }, { processedAt: now })`.

Keep three private helpers in this file for the remaining commands: `lockPhoto(tx, caller, photoId)` (find the break id, `assertHostOf`, re-read the row `for update` with `removed_at is null and hidden_at is null`, else `NotFound("Photo not found")`), `compact(tx, breakId, order?)` (Step 15), and `noteChange(tx, b, changes, now)` (if `b.firstClaimedAt` and `noticeFor(changes, placeWords(prizes of b))` is a sentence, set `photosUpdatedAt = now` and `photosUpdatedNote` to it).

- [ ] **Step 12: Run them to see them pass**

Run (sandbox off): `pnpm test src/domain/photos/tickets.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 13: Commit**

```bash
git add src/domain/photos/commands.ts src/domain/photos/tickets.test.ts tests/helpers/fixtures.ts tests/concurrency/setup.ts
git commit -m "feat(photos): upload tickets and recording a processed photo"
```

- [ ] **Step 14: Write the failing command tests**

`src/domain/photos/commands.test.ts` uses the same imports and `NOW`, `as`, `later`, `live`, `setStatus` as Step 9, plus `photoNoticesSeen` (schema), `SYSTEM`, `claimLines`, `releaseLine`, `randomUUID` and `removePhoto`, `reorderPhotos`, `retagPhoto`, `describePhoto`, `hidePhoto`, `markPhotoNoticeSeen`, and:

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

Run (sandbox off): `pnpm test src/domain/photos/commands.test.ts`
Expected: FAIL, `removePhoto` and the rest are not exported.

Then write them in `src/domain/photos/commands.ts` with the plan's signatures (`hidePhoto` returns `{ prefix: string | null; from: PhotoLocation }`). Each one: `lockPhoto` (or `assertHostOf` for `reorderPhotos`), the status check (not for `hidePhoto`), the change, `compact` where positions moved, one event with `{ processedAt: now }`, then `noteChange`. The changes each passes to `noteChange`:

- `removePhoto`: `[{ kind: "removed", slot, wasLead: position === 0 }]`, plus `{ kind: "lead" }` when it was the lead and a live photo remains. Event payload `{ photoId, position, slot, wasLead, archived, previousLead }`. Returns the row's `path` and its `bucket` before the change.
- `reorderPhotos`: validate `order` against the live ids (same length, no duplicates, every id live); identical to the current order → return. `[{ kind: order[0] === previousLead ? "reordered" : "lead" }]`. Payload `{ order, previousLead }`.
- `retagPhoto`: slot validated as in Step 11; unchanged → return. `[{ kind: "retagged", from, to }]`. Payload `{ photoId, from, to }`.
- `describePhoto`: alt only; no event, no notice.
- `hidePhoto`: `assertAdmin`; reason trimmed, 1..500 characters; find the row in any state, `lockBreak`, re-read `for update`; already hidden → return without writing. Set `hidden_at = now`, `bucket = 'photo-archive'`; `compact` if it was live. Payload `{ photoId, reason, slot, position: live ? position : null, previousLead }`. No `noteChange`.
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

Run (sandbox off): `pnpm test src/domain/photos`
Expected: PASS, the notice, ticket and command tests (39).

- [ ] **Step 16: Commit**

```bash
git add src/domain/photos/commands.ts src/domain/photos/commands.test.ts
git commit -m "feat(photos): remove, reorder, retag, describe, hide and notice-seen commands"
```

- [ ] **Step 17: Write the failing query tests**

`src/domain/photos/queries.test.ts` (same helpers; `claimedBreak` moves to a shared `src/domain/photos/test-helpers.ts` exporting it with `as`, `NOW`, `later`, `live`):

```ts
describe("breakPhotos", () => {
  const viewer = (id: string, o: Partial<{ isHost: boolean; isHolder: boolean; isAdmin: boolean }> = {}) =>
    ({ id, isHost: false, isHolder: false, isAdmin: false, ...o });

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

Run (sandbox off): `pnpm test src/domain/photos/queries.test.ts`
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
      and ((${breakPhotos.removedAt} is null and ${seesLive}::boolean) or (${breakPhotos.removedAt} is not null and ${seesRemoved}::boolean))`)
    .orderBy(sql`${breakPhotos.removedAt} nulls first`, breakPhotos.position);
  const notice = b.at && b.note ? { text: b.note, at: b.at } : null;
  let unseen = false;
  if (notice && viewer?.isHolder) {
    const [s] = await tx.select({ seenAt: photoNoticesSeen.seenAt }).from(photoNoticesSeen)
      .where(sql`${photoNoticesSeen.userId} = ${viewer.id} and ${photoNoticesSeen.breakId} = ${breakId}`);
    unseen = !s || s.seenAt < notice.at;
  }
  // map rows: removed_at null → PhotoView (prefix = path!), else RemovedPhotoView (location "photo-archive", prefix = path)
}
```

`leadPhotos`: empty ids → empty map, no query; else one select `where break_id = any(…) and position = 0 and removed_at is null and hidden_at is null and bucket = 'photos'` (pass the ids with `inArray`).

Run (sandbox off): `pnpm test src/domain/photos`
Expected: PASS (45).

- [ ] **Step 19: Commit**

```bash
git add src/domain/photos/queries.ts src/domain/photos/queries.test.ts src/domain/photos/test-helpers.ts src/domain/photos/commands.test.ts
git commit -m "feat(photos): breakPhotos and leadPhotos with the visibility rules"
```

- [ ] **Step 20: Write the concurrency tests**

`tests/concurrency/photos.test.ts` (commits for real; `setup.ts` truncates between tests):

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

Run (sandbox off): `pnpm test:concurrency`
Expected: PASS, the existing claim and draw suites and the 5 photo tests, three runs in a row with no flake.

- [ ] **Step 22: Run every gate**

Run (sandbox off, 10-minute timeout): `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:concurrency && pnpm test:ci`
Expected: all green, no lint warnings. Nothing outside tests calls these commands yet (Task 6 does), so e2e is not needed here.

- [ ] **Step 23: Commit**

```bash
git add tests/concurrency/photos.test.ts
git commit -m "test(photos): races for the 8th place, against requestDraw, and reorder against remove"
```

---

#### Contract changes and requirements on neighbouring tasks (Task 5)

1. **`recordProcessedPhoto` gains `location: "photos-draft" | "photos"`**: the bucket Task 6 wrote the variants to before the lock. If the break opened meanwhile, the command refuses with "The break just opened. Add the photo again.", and Task 6 deletes the variants. Without it, a photo processed during opening would be recorded as `photos` with its files still in `photos-draft`.
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
   - The status trigger lets an update through at any status when it changes only `hidden_at`, `bucket` and `path`. `hidePhoto` must work after the draw, and Task 11 nulls `path` when it drops archive copies.
7. **Task 7 (replace):** for "Lead photo replaced" to be the last sentence under ruling 2, a replace runs in this order: add the new photo, remove the old lead (another photo takes position 0), then reorder the new photo to the front.
8. **My calls within the rulings:**
   - Tagging an untagged photo does not count.
   - Moving a photo off a prize counts and reads "Top-spot photo untagged".
   - A rank with two or more items uses item names, which extends ruling 3 to 2nd place.
   - Bad-input copy and the rate-limit copy are as in the Copy table above. Task 12 adds them to the copy audit.

### Task 6: Pipeline wiring: actions, finalise route, open copy, URLs, archive moves (model: Opus)

Everything between Task 5's commands and Storage: the server actions (spec §5.2), the finalise route handler (§5.3
steps 1, 4–6), the copy into `photos` when a break opens (§5.4), the archive move on a counted removal (§6), the removal
of a deleted draft's files, and `photoSrc` (§5.5 reads). Storage calls never run inside a database transaction except
`createSignedUpload` (one short call, so a failure rolls the ticket back). The rule for every move: **write the new copy,
commit, then delete the old one**; a failure at any point leaves at least one complete copy and a row that can find it
(by prefix, see Contract changes 4).

**Files:**
- Create: `src/photos/variants.ts` (prefix and per-variant storage helpers)
- Create: `src/photos/urls.ts`, test `src/photos/urls.test.ts`
- Create: `src/domain/photos/peek.ts` (two unlocked reads the pipeline needs before any storage call), test
  `src/domain/photos/peek.test.ts`
- Create: `src/photos/publish.ts` (the open copy), test `src/photos/publish.test.ts`
- Create: `src/app/api/photos/finalise/route.ts`, test `src/app/api/photos/finalise/route.test.ts`
- Create: `src/app/photos/actions.ts`, test `src/app/photos/actions.test.ts`
- Create: `tests/helpers/photos.ts` (`seedPhoto`)
- Modify: `src/domain/errors.ts` (four photo errors), `src/app/b/[id]/host-actions.ts` (`openBreakAction`),
  `src/app/host/new/actions.ts` (`saveBreak`'s Open intent), `vercel.json`
- Test: `src/app/b/[id]/host-actions.test.ts` (new)

**Interfaces:**
- Consumes: `BUCKETS`, `BucketName`, `VARIANT_WIDTHS`, `VariantWidth`, `PREFIX_PATTERN`, `variantPath`,
  `publicVariantUrl`, `PhotoStorage`, `photoStorage`, `createMemoryStorage` (Task 1); `processPhoto`,
  `UnsupportedImage`, `MAX_INCOMING_BYTES`, `photoFixtures` (Task 4); `issueUploadTicket`, `recordProcessedPhoto`,
  `removePhoto`, `reorderPhotos`, `retagPhoto`, `describePhoto`, `markPhotoNoticeSeen`, `PhotoLocation`, `PhotoView`,
  `RemovedPhotoView` (Task 5); `deleteDraft`, `openBreak` flipping live rows to `photos`, the client break id of
  `createDraft` (Task 3); the `break_photos` and `photo_uploads` tables and `breaks.first_claimed_at` (Task 2);
  `action`, `toFailure`, `parseInput`, `getCaller`, `lockBreak`, `assertHostOf`, `assertOnboarded`, `DomainError`,
  `NotOpen`.
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
  - `src/photos/publish.ts`:
    `publishDraftPhotos(s: PhotoStorage, caller: Caller, breakId: string): Promise<ReadonlySet<string>>` — in its own
    short read, only when the caller hosts the break (or is admin) and it is a draft, lists live rows in
    `photos-draft`, copies each one's three variants to `photos`, returns the copied photo ids (empty for anyone
    else, so `openBreak` gives its own refusal). On any copy failure removes what it copied into `photos` (best
    effort) and throws `PhotosNotReady`.
    `assertPhotosPublished(tx: Tx, breakId: string, copied: ReadonlySet<string>): Promise<void>` — inside the open
    transaction, after the break is locked: throws `PhotosNotReady` if any live row is in `photos-draft` and not in
    `copied` (a finalise that landed between the copy and the lock).
    `dropDraftCopies(s: PhotoStorage, breakId: string, prefixes: readonly string[]): Promise<void>` — after the open
    commits, removes the `photos-draft` originals, logging and swallowing errors (the Task 11 cleanup is the backstop).
  - `src/domain/errors.ts`: `PhotosNotReady` (`PHOTOS_NOT_READY`, 409, "Photos are still being prepared. Try again."),
    `UploadNotFound` (`UPLOAD_NOT_FOUND`, 404), `UploadExpired` (`UPLOAD_EXPIRED`, 410), `UploadUsed` (`UPLOAD_USED`,
    409). Copy in Step 9.
  - `POST /api/photos/finalise` body `{ ticketId: string; slot: string | null; alt: string }` → `200 { photoId: string;
    src: PhotoSrc }` (`src` at size 160, so the strip swaps the tile in place) | `{ error: string }` with the status of
    Step 9. `runtime = "nodejs"`, `maxDuration = 30`, `dynamic = "force-dynamic"`.
  - `src/app/photos/actions.ts` (`"use server"`), every one returning `ActionResult`:
    `requestPhotoUpload(breakId: string): Promise<ActionResult<{ ticketId: string; uploadUrl: string; token: string }>>`,
    `removePhotoAction(photoId: string): Promise<ActionResult<void>>`,
    `reorderPhotosAction(breakId: string, order: string[]): Promise<ActionResult<void>>`,
    `retagPhotoAction(photoId: string, slot: string | null): Promise<ActionResult<void>>`,
    `describePhotoAction(photoId: string, alt: string): Promise<ActionResult<void>>`,
    `markPhotoNoticeSeenAction(breakId: string): Promise<ActionResult<void>>`,
    `deleteDraftAction(breakId: string): Promise<ActionResult<void>>`.
  - `tests/helpers/photos.ts`: `seedPhoto(tx: Tx, s: PhotoStorage, caller: Caller, breakId: string, o?: { slot?: string
    | null; alt?: string }): Promise<{ photoId: string; prefix: string; location: PhotoLocation }>` — issues a ticket,
    puts three small placeholder bodies at the variant paths in the location the break's status implies, and calls
    `recordProcessedPhoto` (no sharp; for tests that only need rows and files).

**Test harness (route and action tests).** As `src/app/b/[id]/og/route.test.ts`: mock `@/db/client` so
`db.transaction` runs inside the test's `withTx` transaction. Also mock `@/auth/session` (`getCaller: async () =>
caller`, a `let caller: Caller | null`), `@/storage/photo-storage` (`photoStorage: () => mem`, with `mem =
createMemoryStorage()` fresh per test), and `next/cache` (`revalidatePath: vi.fn()`). A storage wrapper
`recording(mem)` in the test file pushes `"copy:<to bucket>"`, `"remove:<bucket>"`, `"put:<bucket>"` onto an `ops`
array and can be told to reject one operation (`failOn: (op) => boolean`). `key(bucket, path)` is the memory store's
file key (Contract changes 5).

- [ ] **Step 1: Write the failing tests for `variants.ts`, `urls.ts` and `peek.ts`**

`src/photos/urls.test.ts`:
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
```
`src/domain/photos/peek.test.ts` (database, `withTx`): `peekUploadTicket` returns `{ expired: false, consumed: false,
breakStatus: "draft" }` for a fresh ticket; `expired: true` after the test sets `expires_at` in the past; `consumed:
true` after `recordProcessedPhoto`; throws `UploadNotFound` for an unknown id and for another host's ticket, and for an
admin caller on someone else's ticket; throws `NotAuthorized` for a banned caller. `peekPhoto` returns `claimed: false`
on a draft, `claimed: true` after a `claimLines` on the open break, and `null` for an unknown id. Also in
`src/photos/urls.test.ts`: `newPhotoPrefix(id)` matches `PREFIX_PATTERN` and two calls differ.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/photos/urls.test.ts src/domain/photos/peek.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `src/photos/variants.ts`, `src/photos/urls.ts`, `src/domain/photos/peek.ts`**

`photoSrc` srcset rule (the one algorithm the signature does not fix): with `L = max(width, height)` of the largest
variant, the variant labelled `w` has real width `round(width × min(w, L) / L)`; list the variants in
`VARIANT_WIDTHS` order, skipping one whose real width equals the previous entry's. `src` is the variant labelled
`size`. `photos` → `publicVariantUrl`; any other location → `storage.signedReadUrl(location, variantPath(prefix, w),
SIGNED_READ_SECONDS)` per listed variant, run in parallel.

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm test src/photos/urls.test.ts src/domain/photos/peek.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing route tests `src/app/api/photos/finalise/route.test.ts`**

`post(body, headers?)` builds `new Request("http://localhost/api/photos/finalise", { method: "POST", headers: {
"content-type": "application/json", origin: "http://localhost", ...headers }, body: JSON.stringify(body) })`.
`upload(tx, host, breakId, file)` issues a ticket with `issueUploadTicket` and sets `mem.files` at
`key("incoming", incomingName)` to `file`. `filesIn(bucket)` lists `mem.files` keys under that bucket. Every test runs
inside `withTx` with a 60 s timeout and uses Task 4's `photoFixtures()`.

```ts
it("a draft's photo lands in photos-draft as three variants, the row is recorded, the incoming file is gone", async () => {
  // host + makeBreak(draft); r = await post({ ticketId, slot: null, alt: "Taylor Chronos 24g" })
  expect(r.status).toBe(200);
  const { photoId, src } = await r.json();
  expect(filesIn("photos-draft")).toHaveLength(3);
  for (const k of filesIn("photos-draft")) expect(k).toMatch(new RegExp(`^photos-draft/${b.id}/[A-Za-z0-9_-]{22}-(160|640|1600)\\.webp$`));
  expect(filesIn("photos")).toEqual([]);
  expect(filesIn("incoming")).toEqual([]);
  // the row: location "photos-draft", position 0, width/height of the 1600 variant; the ticket consumed
  expect(src.src).not.toContain("/object/public/");      // a draft is read through a signed URL
});
it("an open break's photo lands in photos", async () => { /* openBreakWithLines; 200; 3 files in photos, 0 in photos-draft, 0 in incoming */ });
it("the break opened while the photo was processing: the variants end up in photos, none in photos-draft", async () => {
  // recordProcessedPhoto mocked once: set breaks.status = 'open' in tx, then call the real one (which answers location "photos")
});
it("another host's ticket answers 404 and leaves that host's incoming file alone", async () => {
  // A uploads; caller = B; 404 { error: "This upload could not be found. Try again." }; A's incoming file still there; no variants
});
it("an expired ticket answers 410 and removes the incoming file", async () => { /* expires_at in the past */ });
it("a ticket used once answers 409 the second time and removes the re-sent file", async () => {
  // first post 200; put the file at the same incoming name again; second post → 409 "This photo was already added."; incoming empty; still one row
});
it("a file over 5 MB answers 413, writes no variant, leaves the ticket unconsumed, removes the incoming file", async () => {
  // Buffer.concat([fx.tiny, Buffer.alloc(MAX_INCOMING_BYTES + 1 - fx.tiny.length)])
});
it.each(["svg", "gif", "htmlAsJpg", "pixelBomb"] as const)("%s answers 415 with no variant anywhere and no incoming file", async (name) => {
  expect(r.status).toBe(415);
  expect(await r.json()).toEqual({ error: "This photo can't be used. Pick a JPEG, PNG or WebP." });
  expect([...filesIn("photos-draft"), ...filesIn("photos"), ...filesIn("incoming")]).toEqual([]);
});
it("a refusal after the put removes the variants and the incoming file", async () => {
  // recordProcessedPhoto mocked once to throw new InvalidInput("refused"); 400 { error: "refused" }; every bucket empty
});
it("no incoming file (the upload never arrived) answers 409", async () => { /* "The photo didn't arrive. Try again." */ });
it("refuses a signed-out caller (401), a cross-site origin (403) and a malformed body (400), touching nothing", async () => {
  // caller = null → 401 { error: "Sign in to continue" }
  // origin "https://evil.example" → 403, the incoming file still there, ticket unconsumed
  // alt of 121 characters → 400; ticketId "../x" → 400
});
it("a drawing break answers 409 with the state copy and removes the incoming file", async () => {
  // ticket issued while open, then status set to 'drawing': NotOpen("drawing") copy
});
```
The `polyglot` fixture is not in the refused list: it is a real JPEG and is accepted; Task 4 proves its HTML does not
survive the re-encode.

Also `src/app/api/photos/finalise/config.test.ts`: the route module exports `runtime === "nodejs"` and `maxDuration ===
30`; `vercel.json` parses, keeps `{ path: "/api/tick", schedule: "* * * * *" }` in `crons`, and has
`functions["src/app/api/photos/finalise/route.ts"].maxDuration === 30`.

- [ ] **Step 6: Run them to see them fail**

Run: `pnpm test src/app/api/photos/finalise`
Expected: FAIL, "Cannot find module './route'".

- [ ] **Step 7: Implement the photo errors in `src/domain/errors.ts`**

Four `DomainError` subclasses with the codes, statuses and copy of Step 9.

- [ ] **Step 8: Implement `src/app/api/photos/finalise/route.ts`**

`export async function POST(req: NextRequest): Promise<NextResponse>`; every response carries `Cache-Control:
no-store`. Order:

1. `Origin` header present and not equal to `req.nextUrl.origin` → 403. `content-type` not `application/json` → 415
   generic. `content-length` over 2048 → 413 generic. (A route handler gets no Server Action origin check.)
2. `getCaller()`; null → 401 "Sign in to continue"; banned → 403 "This account is suspended".
3. `parseInput(z.object({ ticketId: z.uuid(), slot: z.uuid().nullable(), alt: z.string().trim().min(1).max(120) }))`
   → 400 with the issue's message.
4. `db.transaction(tx => peekUploadTicket(tx, caller, { ticketId, now }))`. A throw here returns before any storage
   call (another host's file is never touched).
5. `try { … } finally { await storage.remove("incoming", [incomingName]).catch(log) }` around everything below:
   `consumed` → `UploadUsed`; `expired` → `UploadExpired`; `breakStatus` draft → put bucket `photos-draft`, open or
   filled → `photos`, else `throw new NotOpen(breakStatus)`; `storage.download("incoming", incomingName,
   MAX_INCOMING_BYTES)`; `processPhoto` (no transaction open); `prefix = newPhotoPrefix(breakId)`; `putVariants`;
   then `db.transaction(tx => recordProcessedPhoto(tx, caller, { ticketId, prefix, width, height, slot, alt, now }))`
   inside its own try: on a throw, `removeVariants(put bucket)` and rethrow. If the returned `location` differs from the
   put bucket (the break opened in between), `copyVariants` to it, then `removeVariants` from the put bucket; a failure
   here is logged, not returned (the row exists; Task 11's cleanup matches by prefix).
6. `revalidatePath(`/b/${breakId}`)`; respond `{ photoId, src: await photoSrc(storage, { location, prefix, width,
   height, alt }, 160) }`.

Errors map in one function: `DomainError` → `e.status` and `e.message`; `UnsupportedImage` → 415; the storage
`TooLarge` → 413; the storage not-found on download → 409; anything else → logged, 500 "Something went wrong. Please
try again."

- [ ] **Step 9: Copy and status codes (plan copy, not in the spec; each line passes `copy-audit.test.ts`)**

| Condition | Status | `error` |
|---|---|---|
| Signed out | 401 | `Sign in to continue` |
| Banned | 403 | `This account is suspended` |
| Cross-site origin | 403 | `This request was refused.` |
| Ticket missing or another user's (`UploadNotFound`) | 404 | `This upload could not be found. Try again.` |
| Ticket expired (`UploadExpired`) | 410 | `This upload took too long. Try again.` |
| Ticket consumed (`UploadUsed`) | 409 | `This photo was already added.` |
| No incoming file | 409 | `The photo didn't arrive. Try again.` |
| Over 5 MB (`TooLarge`) | 413 | `This photo is over 5 MB. Pick a smaller one.` |
| `UnsupportedImage` | 415 | `This photo can't be used. Pick a JPEG, PNG or WebP.` |
| Frozen or not a host state (`NotOpen`) | 409 | `notOpenMessage(status)` |
| Any other `DomainError` (cap, rate limit, tag) | its status | its message |
| Open copy failed (`PhotosNotReady`, actions only) | 409 | `Photos are still being prepared. Try again.` (spec §5.4) |

- [ ] **Step 10: Add the function config to `vercel.json`**

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

Run: `pnpm test src/app/api/photos/finalise`
Expected: PASS.

- [ ] **Step 12: Write the failing action tests**

`src/app/photos/actions.test.ts` (harness above; photos made with `seedPhoto`):
```ts
it("requestPhotoUpload returns the ticket and a signed upload into incoming for that ticket's name", async () => {
  // spy mem.createSignedUpload; r.ok; r.data.ticketId is the photo_uploads row; spy called once with its incoming_name
});
it("requestPhotoUpload rolls the ticket back when the signed URL cannot be made", async () => {
  // createSignedUpload rejects → r.ok false, code "INTERNAL"; no photo_uploads row for the break
});
it("removing before any claim deletes the variants outright; nothing reaches photo-archive", async () => {
  expect(ops).toEqual(["remove:photos"]); expect(filesIn("photo-archive")).toEqual([]);
});
it("removing after a claim copies to photo-archive first, commits, then deletes from photos", async () => {
  // openBreakWithLines, seedPhoto, claimLines by a buyer (sets first_claimed_at)
  expect(ops).toEqual(["copy:photo-archive", "copy:photo-archive", "copy:photo-archive", "remove:photos"]);
  expect(filesIn("photo-archive")).toHaveLength(3); expect(filesIn("photos")).toEqual([]);
  // the row: removed_at set, location photo-archive
});
it("a failed archive copy changes nothing: the photo stays live and every file stays in photos", async () => {
  // failOn: copy to photo-archive → r.ok false; removed_at null; 3 files in photos; photo-archive empty
});
it("a refused removal after the archive copy removes that copy", async () => {
  // claimed break, then status set to 'drawing' (frozen): r.ok false; photo-archive empty; photos intact
});
it("a failed delete from photos after the commit still answers ok and leaves the archive copy", async () => {
  // failOn: remove:photos → r.ok true; row removed; 3 files in photo-archive (the stray public files are Task 11's)
});
it("another host's removePhotoAction is refused and no storage call is made", async () => { expect(ops).toEqual([]); });
it("deleteDraftAction removes every draft photo's variants after the commit", async () => {
  // two seeded photos on a draft; r.ok; photos-draft empty; break row gone
});
it("reorder, retag, describe and notice-seen pass their inputs to the commands and refuse malformed ones", async () => {
  // order with a non-uuid → INVALID_INPUT; alt "" and 121 characters → INVALID_INPUT; slot null accepted
});
```
`src/app/b/[id]/host-actions.test.ts`:
```ts
it("openBreakAction copies every draft photo to photos, opens, then drops the draft copies", async () => {
  // draft with two seeded photos (complete via Task 3's form fixture); r.ok
  // every variant of both prefixes is in photos; photos-draft is empty; rows' location is photos; break open
  // ops order: all "copy:photos" before the first "remove:photos-draft"
});
it("a copy failure answers 'Photos are still being prepared. Try again.', the break stays a draft, photos holds nothing", async () => {
  // failOn: the 4th copy:photos → r = { ok: false, code: "PHOTOS_NOT_READY", message: "Photos are still being prepared. Try again." }
  // status draft; filesIn("photos") empty; photos-draft intact
});
it("a stranger's openBreakAction copies nothing and gets the host refusal", async () => { expect(ops).toEqual([]); });
it("a draft with no photo opens as before", async () => { /* ops empty, r.ok */ });
```
`src/photos/publish.test.ts`: `assertPhotosPublished` throws `PhotosNotReady` when a live `photos-draft` row is missing
from `copied` (a photo seeded after the copy), passes when every one is in it, and ignores removed rows.
Add one case to the existing composer action tests if they exist, else to `host-actions.test.ts`: `saveBreak` with
`intent=open` on a draft with a photo copies it to `photos` (mock `next/navigation`'s `redirect` to throw a marker).

- [ ] **Step 13: Run them to see them fail**

Run: `pnpm test src/app/photos src/app/b/\[id\]/host-actions.test.ts src/photos/publish.test.ts`
Expected: FAIL, modules or exports not found.

- [ ] **Step 14: Implement `src/photos/publish.ts`, `src/app/photos/actions.ts`, and wire the two open paths**

- Every action parses with `parseInput` first (`z.uuid()` ids; `order: z.array(z.uuid()).min(1).max(8)` with unique
  ids; `slot: z.uuid().nullable()`; `alt` trimmed 1–120), then `action(...)`, then `revalidatePath(`/b/${breakId}`)`
  and `revalidatePath("/host")` on success (`markPhotoNoticeSeenAction` revalidates nothing). Command `now` is `new
  Date()`.
- `requestPhotoUpload`: inside the `action` callback, `issueUploadTicket` then `photoStorage().createSignedUpload(
  incomingName)`; returns `{ ticketId, uploadUrl: url, token }`.
- `removePhotoAction`, in this order (the only order in which no failure loses the only copy):
  1. `pre = peekPhoto` in a read transaction; if the caller is the host (or admin), the photo is live, and
     `pre.claimed`, `copyVariants(pre.location → photo-archive)` (speculative). A failure returns `toFailure`-shaped
     `INTERNAL` and nothing has changed.
  2. `action(removePhoto)`. Refused → remove the speculative archive copy (best effort), return the refusal.
  3. `archive && !speculative` (the first claim landed between 1 and 2) → copy now; on failure log and **return ok
     without deleting the source**. `!archive && speculative` → remove the archive copy.
  4. `removeVariants(from)`; a failure is logged, the result is still ok.
- `deleteDraftAction`: `action(deleteDraft)`, then `removeVariants` for each returned `{ location, prefix }`, errors
  logged; `revalidatePath("/host")`.
- `openBreakAction` (`src/app/b/[id]/host-actions.ts`): after `parseInput`, `const caller = await getCaller()`; when
  signed in, `copied = await publishDraftPhotos(storage, caller, id)` (a `PhotosNotReady` returns `toFailure(e)`);
  then `action(async (tx, c) => { await assertHostOf(tx, c, id); await assertPhotosPublished(tx, id, copied); await
  openBreak(tx, c, id); })`; on success `dropDraftCopies`; on failure remove the copies made in `photos` (best effort).
- `saveBreak` (`src/app/host/new/actions.ts`): when `parsed.open` and a break id is known (the editing id, or Task 3's
  client id), the same three calls around the existing transaction, `assertPhotosPublished` right before `openBreak`.

- [ ] **Step 15: Run them to see them pass**

Run: `pnpm test src/app/photos src/app/b/\[id\]/host-actions.test.ts src/photos src/domain/photos/peek.test.ts src/app/api/photos`
Expected: PASS.

- [ ] **Step 16: Confirm sharp is traced into the finalise function only**

Run: `pnpm build && grep -l "@img/sharp" .next/server/app/api/photos/finalise/route.js.nft.json && ! grep -l "@img/sharp" .next/server/app/b/\[id\]/page.js.nft.json`
Expected: the first grep prints the finalise trace; the second finds nothing (sharp stays out of page functions).

- [ ] **Step 17: Gates**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:concurrency && pnpm test:ci` (sandbox off), then
the full e2e on `breaks_e2e` (`/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill` first).
Expected: all clean; the existing open-break e2e still passes with no photo.

- [ ] **Step 18: Commit**

```bash
git add src/photos src/domain/photos/peek.ts src/domain/photos/peek.test.ts src/domain/errors.ts \
  src/app/api/photos src/app/photos "src/app/b/[id]/host-actions.ts" "src/app/b/[id]/host-actions.test.ts" \
  src/app/host/new/actions.ts tests/helpers/photos.ts vercel.json
git commit -m "feat(photos): finalise route, photo actions, open copy and archive moves"
```

---


### Task 7: Composer photos UI: strip, shrink, upload states, Edit photos sheet (model: Sonnet)

Spec §5.1, §5.3 (the tile's "Finishing…", Retry, one automatic retry on `online`, leaving with uploads in flight), §6 (the host's confirm after the first claim; "Edit photos"), §9 (the strip, its menu, the hints). Review Focus 4 lives here: **9 picks with 0 attached upload 8, and the 9th says why at once, before any network call; the same file picked twice uploads twice.**

**Rulings for this task (recorded here, the spec leaves them to the builder, §12):**
1. **The tile menu is an inline options panel**, not a dialog. Each tile has a 44 px "Options for photo N" button (`aria-expanded`) that opens one panel under the grid, labelled "Photo N options". Reason: the strip also lives inside the "Edit photos" `Sheet`, and `Sheet` resets the page scroll lock when it closes, so a nested sheet would unlock the outer one.
2. **Order invariant**: ready tiles always precede unready ones, in server order. A finished upload moves its tile to just after the last ready tile (the server appends it at the end). Make lead, Move earlier/later and drag act on ready tiles only and send `reorderPhotosAction(breakId, readyOrder)`, which is then the full live set.
3. **Unready tiles** (queued, uploading, finishing, failed) offer only Cancel/Remove (no Remove while "finishing"; Retry when failed and retryable). Tag and Describe need a ready tile. The alt text and tag at the time the upload starts are what finalise receives.
4. **Alt prefill**: `defaultAlt(tagName, title)` = the tagged prize's name, else the form title, cut to 120 characters. A retag of a ready tile whose alt was never edited also calls `describePhotoAction` with the new default.
5. **Remove, before any claim**: the tile leaves at once, shown as "Photo removed." with an Undo button for 8 seconds (`role="status"`, polite); `removePhotoAction` runs when the 8 seconds end, on a second removal (the first commits first), and on unmount. **After a claim** (`claimed` prop, from `first_claimed_at`): the panel's Remove turns into the question "Buyers in this break will still see this photo, marked Removed." with "Remove photo" and "Keep photo"; Remove then commits at once with no Undo.
6. **The draft**: the composer makes the break id when it opens (`useState(() => crypto.randomUUID())`) and posts it as hidden `newBreakId`. The first photo calls `ensureDraft()` (once, memoised), which saves the form as a draft under that id through `ensureDraftAction`, then `history.replaceState(null, "", "/host/<id>/edit")`. A Save pressed meanwhile, or a reload, lands on the same draft (spec §9).
7. **Upload progress** uses `XMLHttpRequest` (fetch has no upload progress); the PUT sends `FormData` with `cacheControl` `"3600"` and the blob as the unnamed field, header `x-upsert: false`, to the `uploadUrl` Task 6 returns (token already in it); if Task 6's `token` must travel in a header, follow Task 6's contract test.
8. **Uploads in flight** = tiles queued, uploading or finishing (a failed tile is not in flight). While there are any, `beforeunload` is registered, and the strip shows the banner line "Photos are still uploading. Stay on this page until they finish." (`role="status"`). Neither Save draft nor Open break is ever disabled by uploads.
9. **Where "Edit photos" goes**: a secondary `Button` beside "Host tools" in the break page's host row, shown to the host while the break is `open` or `filled` (a draft has "Edit draft"). The sheet title is "Edit photos"; closing it calls `router.refresh()` if anything changed.
10. **Drag**: pointer events on the tile image (`touch-action: none` on the grip only, so the page still scrolls), hit-testing tiles with `document.elementFromPoint`, committed on `pointerup` as one `drag` action and one `reorderPhotosAction`. Move earlier/later buttons are the keyboard path and are `aria-disabled` at the ends.

**Files:**
- Create: `src/components/photos/strip-state.ts`, `src/components/photos/strip-state.test.ts`
- Create: `src/components/photos/shrink.ts`, `src/components/photos/shrink.test.ts`
- Create: `src/components/photos/upload-client.ts`, `src/components/photos/photo-strip.tsx`, `src/components/photos/strip-tile.tsx`, `src/components/photos/photo-strip.test.ts`
- Create: `src/components/photos/edit-photos-sheet.tsx`, `src/photos/strip-data.ts`
- Modify: `src/app/host/new/form.tsx` (title becomes controlled; the strip after the Lines fieldset; the no-photo line; hidden `newBreakId`), `src/app/host/new/actions.ts` (`ensureDraftAction`), `src/app/host/new/initial.ts` (`photos`, `prizeSlots` inputs), `src/app/host/new/page.tsx`, `src/app/host/[id]/edit/page.tsx` (load photos), `src/app/b/[id]/page.tsx` (the host row; the `photos` load Task 8 reuses)
- Test: `e2e/photo-strip.spec.ts`

**Interfaces:**
- Consumes:
  - Task 6: `requestPhotoUpload(breakId)`, `removePhotoAction(photoId)`, `reorderPhotosAction(breakId, order)`, `retagPhotoAction(photoId, slot)`, `describePhotoAction(photoId, alt)` from `src/app/photos/actions.ts`; `POST /api/photos/finalise` (see Contract changes: it also returns `src`); `photoSrc(storage, v, size)` and `PhotoSrc` from `src/photos/urls.ts`; `photoStorage()`.
  - Task 5: `breakPhotos(tx, breakId, viewer)` and `PhotoView`; `MAX_PHOTOS` (passed in as the `max` prop by the server pages; client files import no domain values).
  - Task 3: the form's prize state with `slotKey` per prize (the strip's `prizes` prop is derived from it) and `condition`.
  - `Sheet` (`src/components/sheet.tsx`), `Button` (`src/components/button.tsx`), `ActionResult` (`src/lib/action-result.ts`).
- Produces:
  - `strip-state.ts` (pure, no DOM, no React):
    ```ts
    export type StripPhoto = { photoId: string; src: PhotoSrc; slot: string | null; alt: string };
    export type TileStatus = "queued" | "uploading" | "finishing" | "failed" | "ready";
    export type StripTile = { key: string; photoId: string | null; status: TileStatus; progress: number; preview: string | null; src: PhotoSrc | null; slot: string | null; alt: string; altEdited: boolean; error: string | null; retryable: boolean; autoRetried: boolean };
    export type StripState = { tiles: StripTile[]; notice: string | null; removal: { tile: StripTile; index: number } | null; max: number };
    export type StripAction =
      | { type: "pick"; files: { key: string; preview: string; alt: string }[] }
      | { type: "start"; key: string } | { type: "progress"; key: string; fraction: number } | { type: "finishing"; key: string }
      | { type: "done"; key: string; photoId: string; src: PhotoSrc }
      | { type: "fail"; key: string; error: string; retryable: boolean }
      | { type: "retry"; key: string } | { type: "online" } | { type: "unreadable"; key: string }
      | { type: "cancel"; key: string }                       // an unready tile
      | { type: "lead"; key: string } | { type: "move"; key: string; by: -1 | 1 } | { type: "drag"; key: string; to: number }
      | { type: "order"; ids: string[] }                      // re-sync after a failed save
      | { type: "tag"; key: string; slot: string | null; defaultAlt: string } | { type: "alt"; key: string; alt: string }
      | { type: "slots"; valid: string[] }                    // a prize field was removed: its tags clear
      | { type: "remove"; key: string } | { type: "undo" } | { type: "removalDone" } | { type: "notice"; text: string | null };
    export function initStrip(photos: readonly StripPhoto[], max: number): StripState;
    export function stripReducer(s: StripState, a: StripAction): StripState;
    export function nextToStart(s: StripState, limit?: number): string[];   // keys of queued tiles to start; limit defaults to 2 uploads at a time (uploading + finishing count)
    export function uploadsInFlight(s: StripState): number;                  // queued + uploading + finishing
    export function readyIds(s: StripState): string[];                       // photoIds of ready tiles, in order
    export function defaultAlt(tagName: string | null, title: string): string; // 1 to 120 characters
    export function canAddPhotos(f: { title: string; lineCount: number; price: string; maxLines: number }): boolean; // title non-empty, 2 <= lineCount <= maxLines, price parses to > 0 with the parser parseComposer uses
    export const UNREADABLE_NOTICE = "This photo can't be read here. Pick a JPEG or PNG.";
    export const NEED_FORM_NOTICE = "Add a title and a price first.";
    export function limitNotice(notAdded: number): string; // "Photos are limited to 8 per break. 1 photo was not added." (plural: "2 photos were not added.")
    ```
  - `shrink.ts`: `shrinkForUpload(file: File): Promise<Blob>`, `class CannotRead extends Error`, `fitWithin(w: number, h: number, maxEdge?: number): { width: number; height: number }`, `MAX_EDGE = 2048`, `JPEG_QUALITY = 0.85`.
  - `upload-client.ts`: `uploadPhoto(p: { breakId: string; blob: Blob; slot: string | null; alt: string; signal: AbortSignal; onProgress(fraction: number): void; onFinishing(): void }): Promise<{ photoId: string; src: PhotoSrc }>`; throws `UploadError extends Error { retryable: boolean }` (network and 5xx and 408/429 are retryable; other 4xx are not).
  - `photo-strip.tsx`:
    ```ts
    export type StripPrize = { slot: string; label: string };   // label: the prize's name as typed, else its place word
    export type PhotoStripProps = {
      breakId: string; initial: StripPhoto[]; prizes: StripPrize[]; title: string; max: number;
      canAdd: boolean;                 // composer: canAddPhotos(form); the sheet: true
      claimed: boolean;                // breaks.first_claimed_at is set
      ensureDraft?: () => Promise<boolean>;   // composer only, until the draft exists
      onCount?: (live: number) => void;
    };
    export function PhotoStrip(p: PhotoStripProps): React.ReactElement;
    ```
  - `edit-photos-sheet.tsx`: `EditPhotosSheet(p: Omit<PhotoStripProps, "canAdd" | "ensureDraft" | "onCount">)`: the "Edit photos" button plus the `Sheet`.
  - `src/photos/strip-data.ts`: `toStripPhotos(storage: PhotoStorage, live: readonly PhotoView[]): Promise<StripPhoto[]>` (160 px `photoSrc`; signed for draft photos).
  - Test ids: `photo-strip`, `photo-input` (the hidden file input), `photo-add`, `photo-count`, `photo-notice`, `photo-tile` (with `data-status`), `photo-options-<n>`, `photo-undo`, `photo-uploading-banner`, `edit-photos`.

- [ ] **Step 1: Write the failing reducer tests**

`src/components/photos/strip-state.test.ts` (build helpers `files(n)`, `ready(photos)` and a `run(state, ...actions)` fold; photos are `StripPhoto`s with `src` stubs). Tests, with the assertions that matter:

```ts
it("9 picks with 0 attached: 8 tiles queued, the 9th refused at once with the reason", () => {
  const s = stripReducer(initStrip([], 8), { type: "pick", files: files(9) });
  expect(s.tiles).toHaveLength(8);
  expect(s.tiles.every((t) => t.status === "queued")).toBe(true);
  expect(s.notice).toBe("Photos are limited to 8 per break. 1 photo was not added.");
  expect(nextToStart(s)).toEqual([s.tiles[0].key, s.tiles[1].key]); // no network yet: pure state
});
it("3 picks with 6 attached: 2 admitted, 1 refused", () => { /* notice limitNotice(1), tiles.length 8 */ });
it("a full break refuses every pick with the same sentence", () => { /* 8 ready + pick 2 -> tiles still 8, notice limitNotice(2) = "...2 photos were not added." */ });
it("the same file twice is two tiles with two keys, both queued (no silent dedupe)", () => {
  const f = { key: "a", preview: "blob:1", alt: "T" };
  const s = stripReducer(initStrip([], 8), { type: "pick", files: [f, { ...f, key: "b" }] });
  expect(s.tiles.map((t) => t.key)).toEqual(["a", "b"]);
});
it("two uploads at a time", () => { /* start a,b -> nextToStart is []; done a -> ["c"]; finishing counts as active */ });
it("a finished upload joins after the last ready tile, and the first ready tile is the lead", () => { /* tiles [ready X, uploading A, uploading B]; done B -> [X, B, A] */ });
it("fail then retry: queued again; progress back to 0", () => {});
it("online retries a failed, retryable tile once; a second failure stays failed", () => {
  /* fail{retryable:true} -> online -> status queued, autoRetried true; fail again -> online -> still failed */
});
it("online never retries a non-retryable failure", () => {});
it("unreadable drops the tile and sets the spec's sentence", () => {
  expect(s.notice).toBe("This photo can't be read here. Pick a JPEG or PNG.");
});
it("lead, move and drag act on ready tiles only and keep unready ones last", () => {});
it("move by -1 on the lead and by +1 on the last ready tile change nothing", () => {});
it("remove sets removal with its index; undo restores that index; removalDone clears", () => {});
it("tag keeps an edited alt and rewrites an unedited one with defaultAlt", () => {});
it("slots clears the tag of a tile whose prize field was removed", () => {});
it("uploadsInFlight counts queued, uploading and finishing, not failed or ready", () => {});
it("defaultAlt is the tagged name, else the title, cut to 120 characters and never empty", () => {
  expect(defaultAlt("Taylor Chronos 24g", "T")).toBe("Taylor Chronos 24g");
  expect(defaultAlt(null, "x".repeat(200))).toHaveLength(120);
  expect(defaultAlt(null, "   ")).toBe("Photo of the items");
});
it("canAddPhotos needs a title, 2+ lines within the max, and a positive price", () => {});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/components/photos/strip-state.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `strip-state.ts`** (signatures in Interfaces)

Pure functions over the shapes above. `pick` admits `max - tiles.length` files (counting every tile) and sets `notice` to `limitNotice(refused)` when any were refused, else clears it; each admitted tile starts `queued`, `progress` 0, `retryable` true, `altEdited` false. `done` sets `ready`, stores `photoId` and `src`, and moves the tile to the index after the last ready tile. `remove` on a ready tile takes it out and records `removal`. All keys come from the caller (no `crypto` in this file).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run src/components/photos/strip-state.test.ts`. Expected: PASS.

- [ ] **Step 5: Write the failing shrink tests**

`src/components/photos/shrink.test.ts`, stubbing `globalThis.createImageBitmap` and `globalThis.document` with `vi.stubGlobal`:

```ts
it("fitWithin shrinks the long edge to 2048 and never upscales", () => {
  expect(fitWithin(4000, 3000)).toEqual({ width: 2048, height: 1536 });
  expect(fitWithin(3000, 4000)).toEqual({ width: 1536, height: 2048 });
  expect(fitWithin(1000, 500)).toEqual({ width: 1000, height: 500 });
  expect(fitWithin(10000, 1000)).toEqual({ width: 2048, height: 205 });
});
it("decodes with the orientation applied, draws at the fitted size and encodes JPEG at 0.85", async () => {
  /* createImageBitmap stub resolves { width: 4000, height: 3000, close }; canvas stub records drawImage and toBlob */
  expect(createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: "from-image" });
  expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2048, 1536);
  expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.85);
  expect(close).toHaveBeenCalled();
});
it("an undecodable file throws CannotRead whose message is the spec's sentence", async () => {
  vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("x")));
  await expect(shrinkForUpload(new File(["x"], "a.heic"))).rejects.toThrow(CannotRead);
  await expect(shrinkForUpload(new File(["x"], "a.heic"))).rejects.toThrow("This photo can't be read here. Pick a JPEG or PNG.");
});
it("a canvas that yields no blob is also CannotRead", async () => {});
```

- [ ] **Step 6: Implement `shrinkForUpload(file: File): Promise<Blob>` in `shrink.ts`, then run**

`createImageBitmap(file, { imageOrientation: "from-image" })` (a rejection becomes `CannotRead`), a canvas element sized `fitWithin(...)`, `drawImage`, `toBlob(cb, "image/jpeg", 0.85)`, then `bitmap.close()` in a `finally`. `CannotRead`'s message is `UNREADABLE_NOTICE`'s text (import the constant from `strip-state.ts`).
Run: `pnpm exec vitest run src/components/photos/shrink.test.ts`. Expected: PASS.

- [ ] **Step 7: Write the failing strip render tests**

`src/components/photos/photo-strip.test.ts` (`renderToStaticMarkup(createElement(PhotoStrip, props))`, with `ok` props: 2 initial photos, `max: 8`, `canAdd: true`, `claimed: false`):

```ts
it("disables Add photos with the reason beside it until the form is valid", () => {
  const h = html({ ...ok, initial: [], canAdd: false });
  expect(h).toMatch(/<button[^>]*disabled[^>]*>Add photos<\/button>/);
  expect(h).toContain("Add a title and a price first.");
});
it("enabled once valid: no reason text", () => {
  const h = html({ ...ok, initial: [], canAdd: true });
  expect(h).not.toMatch(/<button[^>]*disabled[^>]*>Add photos/);
  expect(h).not.toContain("Add a title and a price first.");
});
it("carries the hint and the count", () => {
  expect(html(ok)).toContain("Photos of the items. Rules and specs go in the description.");
  expect(html(ok)).toContain("2 of 8 photos");
});
it("tiles in order, the first marked Lead, each with a named options button", () => {
  const h = html(ok);
  expect(h.match(/data-testid="photo-tile"/g)).toHaveLength(2);
  expect(h.indexOf("Lead")).toBeLessThan(h.indexOf('aria-label="Options for photo 2"'));
  expect(h).toContain('aria-label="Options for photo 1"');
});
it("the file input accepts JPEG, PNG, WebP and HEIC, multiple", () => {
  expect(html(ok)).toMatch(/<input[^>]*type="file"[^>]*multiple/);
  expect(html(ok)).toContain("image/heic");
});
it("renders no uploading banner when nothing is in flight", () => {
  expect(html(ok)).not.toContain("Photos are still uploading.");
});
```

- [ ] **Step 8: Implement the strip, its tile and the upload client**

`photo-strip.tsx` owns `useReducer(stripReducer, initStrip(initial, max))`, an effect that starts `nextToStart(state)` tiles, and the side effects the reducer does not do. Per started tile: `await ensureDraft?.()` (memoised; `false` fails every queued tile with "Couldn't save the draft. Try again." and `retryable: true`), `shrinkForUpload` (`CannotRead` becomes `unreadable`), then `uploadPhoto(...)` feeding `progress`/`finishing`/`done`/`fail`; an `AbortController` per tile for Cancel. A `window` `online` listener dispatches `online`. `beforeunload` is registered only while `uploadsInFlight(state) > 0` (and the banner is shown). `onCount` receives the number of live (ready, unready excluded) tiles. Tile (`strip-tile.tsx`): a `data-testid="photo-tile"` square (about 114 px at 390 in a 3-column grid, `border-wire-strong`, no mat), the image with `alt={tile.alt}`, the "Lead" badge on the first, the progress ring (`role="progressbar"`, `aria-label="Uploading photo N"`, `aria-valuenow`), "Finishing…" (with the ellipsis character), the failed state with its reason and a "Retry" button, and the options button. Copy: a network failure reads "The upload didn't finish. Check your connection."; Remove's Undo line reads "Photo removed." with "Undo".
Run: `pnpm exec vitest run src/components/photos`. Expected: PASS.

- [ ] **Step 9: Wire the composer**

In `form.tsx`: `title` becomes controlled state; `newBreakId` from `useState(() => initial.breakId ?? crypto.randomUUID())`, posted as a hidden `newBreakId` input (the existing hidden `breakId` stays for an existing draft); a "Photos" `fieldset` (legend `text-headline font-semibold`, like its neighbours) placed **after the Lines fieldset**, rendering `<PhotoStrip breakId={newBreakId} initial={initial.photos} prizes={slots} title={title} max={maxPhotos} canAdd={canAddPhotos({ title, lineCount, price, maxLines })} claimed={false} ensureDraft={...} onCount={setPhotoCount} />`; `slots` derive from Task 3's prize state (a `StripPrize` per prize field: its `slotKey` and its typed name, else "Top spot" or "2nd place"); a `useEffect` dispatch of the live slot list keeps tags valid (the strip receives `prizes` and dispatches `slots` itself). `ensureDraft` posts `new FormData(formRef.current)` to `ensureDraftAction`, then `history.replaceState(null, "", \`/host/${newBreakId}/edit\`)` on the first success and returns its `ok`. Above Open break, when `photoCount === 0`, one quiet `<p className="text-small text-ink-2">Buyers see the lead photo first in the feed.</p>`. `ComposerForm` gains the `maxPhotos` prop; `initial.ts` gains `photos: StripPhoto[]` (empty for a new break; `toStripPhotos` of the draft's live photos on the edit page), and both pages pass `MAX_PHOTOS`.
`ensureDraftAction(form: FormData): Promise<ActionResult<{ breakId: string }>>` in `actions.ts` parses with `parseComposer`, then creates or updates the draft by `newBreakId`/`breakId` and returns without redirecting. See "Contract changes" for the `saveBreak` rule.

- [ ] **Step 10: Edit photos sheet and the break page host row**

`EditPhotosSheet` renders `<Button variant="secondary" data-testid="edit-photos">Edit photos</Button>` and `<Sheet title="Edit photos" ...>` holding `<PhotoStrip canAdd ... />`; an `onCount`-free `changed` flag from the strip's dispatches (any committed action) makes `onClose` call `router.refresh()`. In `src/app/b/[id]/page.tsx`: for the host, `const photos = await breakPhotos(tx, id, { id: caller.id, isHost: true, isHolder, isAdmin })` (Task 8 reuses this one load for every viewer; `isHolder = grid.viewer !== null && grid.viewer.held.length > 0`), `toStripPhotos(photoStorage(), photos.live)`, and render `<EditPhotosSheet breakId={id} initial={...} prizes={slots} title={b.title} max={MAX_PHOTOS} claimed={b.firstClaimedAt !== null} />` next to `HostTools` when `grid.hostView && (status === "open" || status === "filled")`.

- [ ] **Step 11: Write and run the e2e**

`e2e/photo-strip.spec.ts` (serial, one host, sandbox off, Storage up; uses `jpeg(n)` from `e2e/helpers.ts`; this step adds `jpeg` and `composeBreakWithPhotos` there, specified in Task 8 step 1):

```ts
test("Add photos is disabled with its reason until the title and price are filled", async ({ page }) => {
  await loginAs(page, `ps${run}@e2e.test`, "host");
  await page.goto("/host/new");
  await page.fill("input[name=title]", "");
  await expect(page.getByTestId("photo-add")).toBeDisabled();
  await expect(page.getByText("Add a title and a price first.")).toBeVisible();
  await page.fill("input[name=title]", "Strip break");
  await expect(page.getByTestId("photo-add")).toBeEnabled();
});
test("nine picks: eight tiles and the reason for the ninth, at once", async ({ page }) => {
  /* fill title; setInputFiles on photo-input with 9 jpegs */
  await expect(page.getByTestId("photo-tile")).toHaveCount(8);
  await expect(page.getByTestId("photo-notice")).toHaveText("Photos are limited to 8 per break. 1 photo was not added.");
});
test("an unreadable file is refused on the spot and the others go on", async ({ page }) => {
  /* one jpeg and one { name: "x.heic", mimeType: "image/heic", buffer: Buffer.from("not an image") } */
  await expect(page.getByTestId("photo-notice")).toHaveText("This photo can't be read here. Pick a JPEG or PNG.");
  await expect(page.getByTestId("photo-tile")).toHaveCount(1);
});
test("the first photo makes the draft; Save draft keeps the photo, the lead and the tag", async ({ page }) => {
  /* one jpeg; tile data-status=ready; page.url matches /host/<uuid>/edit; Options > Tag > the prize; Save draft; reload; the tile is back with the tag selected */
});
test("Remove shows Undo for 8 seconds and Undo restores the tile", async ({ page }) => {
  /* Options for photo 1 > Remove; "Photo removed." and photo-undo visible; click Undo; tile count 1 again */
});
```

Run: `pnpm exec playwright test e2e/photo-strip.spec.ts` (after `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill`). Expected: PASS.

- [ ] **Step 12: Gates and commit**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test` and the full e2e on `breaks_e2e`. Expected: all green, no warnings. A copy-audit run (`pnpm test src/lib/copy-audit.test.ts`) must pass with the new strings.

```bash
git add src/components/photos src/photos/strip-data.ts src/app/host "src/app/b/[id]/page.tsx" e2e/photo-strip.spec.ts
git commit -m "feat(photos): composer photo strip with upload states and an Edit photos sheet"
```

**Reviewer: Opus.** Focus: (a) 9 picks / duplicate files / 8 attached (Review Focus 4) hold in the reducer with no network call; (b) nothing in the strip blocks Save or Open; (c) `beforeunload` is removed when the last in-flight upload ends and on unmount; (d) a removal committed once only (timer, second removal and unmount do not double-fire); (e) every new string passes the copy audit and none implies the platform verified a photo.

---

### Task 8: Break page photos: plate, Prizes block, viewer, notice seen, layout (model: Sonnet)

Spec §6 (the notice, "Removed Oct 21"), §8.0 (the plate), §8.2 (break page), §8.3 (viewer); Mosaic §8 table (the 390 × 664 budget) and §11. Review Focus 1, 2 and 5 live here.

**Decision: how the viewer opens (spec §8.3 offers "invoker commands where supported, falling back to a dynamic import").** This plan uses **one path: a client button that does a dynamic import on the first tap**, and preloads the chunk on `pointerenter`, `focus` and `touchstart`. Reason: an invoker button (`command="show-modal" commandfor=…`) needs a `<dialog>` already in the page, and the dialog's behaviour (arrows, announcement, focus return, the strip) is client code; so the invoker path still needs the dynamic import to bring the code in, and would add a second path (no Safari before 26, no Firefox before 144 at the time of writing) with a dialog shell in every `/b/[id]` response for nothing. One path keeps the first load free of the viewer, which is the goal the sentence serves, and is what the e2e below checks (no extra script before the tap, no 1600 px request before the tap). The deviation is reported in "Contract changes".

**Rulings for this task:**
1. **Plate geometry**: `size` is the image box. On a board surface the outer box is `size + 8` (3 px mat + 1 px keyline each side), so the break page plate is 64 → 72, the 48 → 56, the 40 → 48 (never 44.75). On a paper surface the outer box is `size + 2` (keyline only). The `<img>` has explicit `width` and `height` equal to `size`, `object-fit: cover`, and carries the `--board-wall-2` placeholder as its own background, so a transparent PNG shows the mat colour. The plate never rotates, filters or tints.
2. **Title band**: with a lead photo the title row is `flex items-start gap-3` with `h1` (`mt-3`, `min-w-0 flex-1`, still `line-clamp-2`) and the plate button (`mt-1`, `shrink-0`): the band is `max(12 + 64, 4 + 72)` = 76 px, so Mosaic's budget table (Title, two lines: 12 + 64) is unchanged and nothing below moves. The media row stays a full-width `<p>` under the band. A break with no photo keeps today's markup exactly (`<section className="mt-3">`).
3. **Count and "Updated"** sit on the plate as text on a solid 16 px strip inside the mat (`bg-board-wall-2`, `text-[11px]`, `--board-text`), never a tint of the image. "Updated" replaces the count for a holder with `unseen` and a notice. The button's accessible name is `Prize photos, N`, or `Prize photos, N, updated` in that case; the image is decorative (`alt=""`).
4. **Prizes block is a paper card** like Details (`rounded-card border border-wire bg-card`), so its plates use `surface="paper"`. It sits after the board's children and before `DetailsFold`, always open, and **replaces the prize lines in `DetailsFold`** (the `prizes` prop is removed).
5. **Places**: one row per prize in rank order. Word: "Top spot" for the first rank-1 prize, "Or" for the other rank-1 prizes, "2nd place", "3rd place" from the existing `ordinal` helper in `frame-copy.ts` (export it if private). Row text: word, item name, then the condition label (`CONDITION_LABEL`, omitted when the item has none), then variants as `key: a or b` pairs joined with "; " (`orList` from `frame-copy.ts`). At most three 64 px plates of the photos tagged with that prize's `slot_key`; tagged photos past three stay reachable in the viewer. "Also in the photos" lists untagged photos. A place with no tagged photo shows text only.
6. **Plates open the viewer**: every live plate (lead, prize plates, "Also in the photos") is a `ViewerButton` for that photo's index in `live` order. The lead's name is `Prize photos, N`; the others are `Photo K of N`. Removed plates are not buttons (their photos are not in the viewer).
7. **Notice**: the sentence plus `LocalTime`, rendered as "<text> on <date and time>." (`LocalTime` kind `datetime`, so "Lead photo replaced on Oct 21, 2026 at 3:05 PM."). Holders see it at the top of the block (under "Prizes"); everyone else at the foot, for the rest of the break's life. "Updated" on the plate needs `unseen`; the sentence stays regardless.
8. **Removed photos** (holders and the host only; `breakPhotos` already withholds them, and `pagePhotos` drops them again for any other audience): a 64 px paper plate with the mark "Removed Oct 21" (`LocalTime` kind `date`, fallback in the viewer's zone), signed 10-minute URL through `photoSrc`; once the archive dropped the image (`prefix: null`) the mark stays on an empty `--board-wall-2` box.
9. **`markPhotoNoticeSeenAction(breakId)`** is fired by a client `NoticeSeen` after the page renders for a holder with `unseen`, once per page view per break (a module-level `Set` guards React's double effect); never from a server render; the result is ignored.

**Files:**
- Create: `src/components/photos/plate.tsx`, `src/components/photos/plate.test.ts`
- Create: `src/components/photos/viewer-model.ts`, `src/components/photos/viewer-model.test.ts`
- Create: `src/components/photos/viewer-root.tsx` (client: `ViewerRoot`, `ViewerButton`), `src/components/photos/photo-viewer.tsx` (client, loaded only by dynamic import)
- Create: `src/components/photos/prizes-model.ts`, `src/components/photos/prizes-model.test.ts`, `src/components/photos/prizes-block.tsx`, `src/components/photos/prizes-block.test.ts`
- Create: `src/components/photos/notice-seen.tsx`, `src/components/photos/notice-seen-logic.ts`, `src/components/photos/notice-seen-logic.test.ts`
- Create: `src/photos/page-photos.ts`, `src/photos/page-photos.test.ts`
- Modify: `src/app/b/[id]/page.tsx` (title band, `ViewerRoot`, `NoticeSeen`, `PrizesBlock`), `src/components/break/details-fold.tsx` (drop `prizes`), `src/components/local-time.tsx` and `src/lib/time.ts` (+ `src/lib/time.test.ts`): a `date` kind
- Modify: `e2e/helpers.ts` (`jpeg`, `composeBreakWithPhotos`), `e2e/layout.spec.ts`
- Create: `e2e/photos.spec.ts` (the viewer tests; Task 12 appends the journeys to it)

**Interfaces:**
- Consumes:
  - Task 5: `breakPhotos(tx, breakId, viewer): Promise<BreakPhotos>` and its types (`PhotoView`, `RemovedPhotoView`, `notice: { text; at } | null`, `unseen`); `ItemCondition`, `CONDITION_LABEL`. Task 3: `prizes.slotKey` and `break_items.condition` on the page's `prizes` and `items` rows (`page.prizes`, `page.items`); `break_items.variantSchema: Record<string, string[]> | null` (exists).
  - Task 6: `photoSrc(storage, v, size): Promise<PhotoSrc>`; `markPhotoNoticeSeenAction(breakId)`; `photoStorage()`.
  - Task 7: the `photos` load in the break page (do not load twice).
  - `LocalTime` (`src/components/local-time.tsx`), `orList`/`ordinal` (`frame-copy.ts`).
- Produces:
  ```ts
  // plate.tsx (server-safe, no hooks)
  export function Plate(p: { photo: PhotoSrc; size: 40 | 48 | 64; surface: "board" | "paper"; decorative?: boolean }): React.ReactElement;
  // viewer-model.ts (pure)
  export type ViewerPhoto = PhotoSrc & { caption: string | null };      // caption: "Top spot: Taylor Chronos 24g" or null when untagged
  export const positionText = (index: number, count: number): string;  // "Photo 2 of 5"
  export const viewerCaption = (tag: string | null, index: number, count: number): string; // "Top spot: Taylor Chronos 24g. Photo 2 of 5."
  export const neighbours = (index: number, count: number): { prev: number | null; next: number | null };
  export const countText = (n: number): string;                          // "1 photo", "5 photos"
  export const plateButtonName = (n: number, updated: boolean): string;  // "Prize photos, 5" | "Prize photos, 5, updated"
  // viewer-root.tsx (client; ViewerButton renders a plain button outside a ViewerRoot)
  export function ViewerRoot(p: { photos: ViewerPhoto[]; children: React.ReactNode }): React.ReactElement;
  export function ViewerButton(p: { index: number; name: string; className?: string; children: React.ReactNode }): React.ReactElement;
  // photo-viewer.tsx (client, default-loaded via next/dynamic, ssr: false)
  export function PhotoViewer(p: { photos: ViewerPhoto[]; index: number; onIndex(i: number): void; onClose(): void; opener: HTMLElement | null }): React.ReactElement;
  // prizes-model.ts (pure)
  export type PlateData = { id: string; index: number; photo: PhotoSrc };
  export type PrizePlace = { key: string; word: string; captionWord: string; name: string; condition: string | null; variants: string | null; plates: PlateData[] };
  export type RemovedPlate = { id: string; photo: PhotoSrc | null; alt: string; removedIso: string; removedFallback: string };
  export function variantText(schema: Record<string, string[]> | null): string | null;
  export function placeRows(prizes: readonly { rank: number; itemId: string | null; slotKey: string }[], items: readonly { id: string; name: string; condition: ItemCondition | null; variantSchema: Record<string, string[]> | null }[]): Omit<PrizePlace, "plates">[];
  export function attachPlates(rows: ReturnType<typeof placeRows>, live: readonly { id: string; slot: string | null; photo: PhotoSrc }[]): { places: PrizePlace[]; untagged: PlateData[] }; // up to 3 per place, viewer index = position in live
  // prizes-block.tsx (server; no data access)
  export function PrizesBlock(p: { places: PrizePlace[]; untagged: PlateData[]; removed: RemovedPlate[]; notice: { text: string; iso: string; fallback: string } | null; noticeFirst: boolean }): React.ReactElement;
  // page-photos.ts (server)
  export type PagePhotos = { count: number; lead: PhotoSrc | null; viewer: ViewerPhoto[]; updated: boolean; unseen: boolean; places: PrizePlace[]; untagged: PlateData[]; removed: RemovedPlate[]; notice: PrizesBlockNotice | null };
  export async function pagePhotos(storage: PhotoStorage, photos: BreakPhotos, rows: ReturnType<typeof placeRows>, o: { audience: "holder" | "host" | "other"; tz: string }): Promise<PagePhotos>;
  // notice-seen-logic.ts
  export async function markSeenOnce(breakId: string, unseen: boolean, call: (breakId: string) => Promise<unknown>, fired?: Set<string>): Promise<void>;
  ```
  Test ids: `photo-plate` (the lead button), `prizes-block`, `prize-place`, `photo-notice-line`, `removed-plate`, `photo-viewer`, `viewer-prev`, `viewer-next`, `viewer-announce`.

- [ ] **Step 1: e2e helpers (already added by Task 7 step 11; verify they exist, else add them)**

In `e2e/helpers.ts` there are `jpeg(n: number): Promise<Buffer>` (a distinct solid 800 × 600 JPEG per `n`, with `sharp`, a direct dependency since Task 4) and

```ts
/** /host/new filled, `photos` JPEGs attached through the strip and waited for, then Open break; returns the break's URL. */
export async function composeBreakWithPhotos(page: Page, o: { title: string; photos: number; lineCount?: number; price?: string }): Promise<string>;
```
(fills as `composeBreak` does, `setInputFiles` on `photo-input`, waits for `photo-tile[data-status=ready]` to count `photos`, clicks `composer-open`, `waitForURL(/\/b\/[0-9a-f-]{36}$/)`).

- [ ] **Step 2: Write the failing plate tests**

`src/components/photos/plate.test.ts`:

```ts
const photo = (o: Partial<PhotoSrc> = {}): PhotoSrc => ({
  src: "https://x.test/photos/a-160.webp",
  srcSet: "https://x.test/photos/a-160.webp 160w, https://x.test/photos/a-640.webp 640w",
  width: 640, height: 480, alt: "Chronos 24g", ...o,
});
const plate = (o: Partial<ComponentProps<typeof Plate>> = {}) => html(createElement(Plate, { photo: photo(), size: 64, surface: "board", ...o }));

it("board: a 64 px image in a 3 px mat and a 1 px steel keyline, 72 px outside", () => {
  const h = plate();
  expect(h).toContain('width="64"'); expect(h).toContain('height="64"');
  expect(h).toContain("width:72px;height:72px");
  expect(h).toContain("p-[3px]"); expect(h).toContain("bg-board-wall-2"); expect(h).toContain("border-board-steel");
});
it("paper: no mat, a wire-strong keyline, 42 px outside a 40 px image", () => {
  const h = plate({ size: 40, surface: "paper" });
  expect(h).toContain("width:42px;height:42px"); expect(h).toContain("border-wire-strong");
  expect(h).not.toContain("p-[3px]"); expect(h).not.toContain("border-board-steel");
});
it("never takes a board pitch: outer boxes are 48, 56 and 72 on the wall", () => {
  for (const [size, outer] of [[40, 48], [48, 56], [64, 72]] as const)
    expect(plate({ size })).toContain(`width:${outer}px;height:${outer}px`);
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

- [ ] **Step 3: Run to verify failure, then implement `Plate`**

Run: `pnpm exec vitest run src/components/photos/plate.test.ts`. Expected: FAIL. Implement `Plate` per ruling 1 (outer `<span>` with inline `width`/`height` style, inner `<img>`).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run src/components/photos/plate.test.ts`. Expected: PASS.

- [ ] **Step 5: Write the failing model, viewer-model and notice-seen tests**

`viewer-model.test.ts`:

```ts
expect(positionText(1, 5)).toBe("Photo 2 of 5");
expect(viewerCaption("Top spot: Taylor Chronos 24g", 1, 5)).toBe("Top spot: Taylor Chronos 24g. Photo 2 of 5.");
expect(viewerCaption(null, 0, 1)).toBe("Photo 1 of 1.");
expect(neighbours(0, 5)).toEqual({ prev: null, next: 1 });
expect(neighbours(4, 5)).toEqual({ prev: 3, next: null });
expect(neighbours(0, 1)).toEqual({ prev: null, next: null });
expect(countText(1)).toBe("1 photo"); expect(countText(5)).toBe("5 photos");
expect(plateButtonName(5, false)).toBe("Prize photos, 5");
expect(plateButtonName(5, true)).toBe("Prize photos, 5, updated");
```

`prizes-model.test.ts`:

```ts
it("variantText joins keys with '; ' and values with 'or'", () => {
  expect(variantText({ weight: ["18g", "20g"], tip: ["soft", "steel"] })).toBe("weight: 18g or 20g; tip: soft or steel");
  expect(variantText(null)).toBeNull(); expect(variantText({})).toBeNull();
});
it("placeRows: Top spot, Or, 2nd place in rank order, with condition labels", () => {
  expect(rows.map((r) => [r.word, r.captionWord, r.name, r.condition])).toEqual([
    ["Top spot", "Top spot", "Taylor Chronos 24g", "New in box"],
    ["Or", "Top spot", "Phantom 24g", "Used"],
    ["2nd place", "2nd place", "Flight pack", null],
  ]);
});
it("attachPlates: at most three plates per place, in live order, with their viewer index; untagged go to 'Also in the photos'", () => {
  /* live: 5 photos tagged to slot A, 1 untagged -> places[0].plates ids = first three, indexes [0,1,2]; untagged = [{index: 5}] */
});
it("a place with no tagged photo has no plates", () => {});
it("a photo tagged to a slot no place has (a stale tag) falls into untagged", () => {});
```

`notice-seen-logic.test.ts`:

```ts
it("calls once for an unseen notice, and only once per break per page view", async () => {
  const call = vi.fn().mockResolvedValue(undefined); const fired = new Set<string>();
  await markSeenOnce("b1", true, call, fired); await markSeenOnce("b1", true, call, fired);
  expect(call).toHaveBeenCalledTimes(1); expect(call).toHaveBeenCalledWith("b1");
});
it("never calls when there is nothing unseen", async () => { /* unseen false -> 0 calls */ });
it("a rejected call is swallowed", async () => { /* call rejects -> resolves undefined */ });
```

`time.test.ts` gains: `formatShortDate(new Date("2026-10-21T15:05:00Z"), "America/New_York")` is `"Oct 21"`.

- [ ] **Step 6: Run to verify failure, then implement**

Run: `pnpm exec vitest run src/components/photos src/lib/time.test.ts`. Expected: FAIL. Implement `viewer-model.ts`, `prizes-model.ts`, `notice-seen-logic.ts`, `formatShortDate(d: Date, tz: string): string` in `src/lib/time.ts` and the `date` kind in `LocalTime` (`kind: "deadline" | "datetime" | "date"`; `browserText` calls `formatShortDate`). Run again. Expected: PASS.

- [ ] **Step 7: Write the failing Prizes block and plate button tests**

`prizes-block.test.ts` (fixture: three places, the first with two plates, the second with none, the third with one; one untagged; helper `block(o)` merging overrides):

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
it("up to the plates it is given, as 64 px paper plates that open the viewer", () => {
  expect(block().split('data-testid="prize-place"')[1].match(/<img/g)).toHaveLength(2);
  expect(block()).toContain('aria-label="Photo 1 of 4"');
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
  const n = { text: "Lead photo replaced", iso: "2026-10-21T15:05:00Z", fallback: "Oct 21, 2026 at 3:05 PM" };
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

`viewer-root.test.ts` (the plate button's name; `ViewerButton` outside a root renders a plain button):

```ts
it("the lead plate is a button named 'Prize photos, 5' that shows '5 photos' and holds a decorative image", () => {
  const h = html(createElement(ViewerButton, { index: 0, name: plateButtonName(5, false) }, createElement(Plate, { photo, size: 64, surface: "board", decorative: true }), createElement("span", null, countText(5))));
  expect(h).toContain('aria-label="Prize photos, 5"'); expect(h).toContain('type="button"'); expect(h).toContain("5 photos"); expect(h).toContain('alt=""');
});
it("a holder with an unseen change gets 'Prize photos, 5, updated'", () => {
  expect(html(createElement(ViewerButton, { index: 0, name: plateButtonName(5, true) }, "Updated"))).toContain('aria-label="Prize photos, 5, updated"');
});
```

`page-photos.test.ts` (with `createMemoryStorage()` from Task 1 and hand-built `BreakPhotos`):

```ts
it("a stranger never gets removed photos or a signed URL, even if breakPhotos returned them", async () => {
  const p = await pagePhotos(storage, withRemoved, rows, { audience: "other", tz: "America/New_York" });
  expect(p.removed).toEqual([]); expect(JSON.stringify(p)).not.toMatch(/token=|photo-archive|photos-draft/);
});
it("a holder gets them with a signed URL and the local-date fallback 'Oct 21'", async () => {});
it("'updated' needs a holder, a notice and unseen", async () => { /* host+unseen -> false; holder+seen -> false; holder+unseen+notice -> true */ });
it("the last photo removed: count 0, no lead, no viewer photos, the removal sentence kept", async () => {
  /* live [] + removed [one] + notice { text: "Top-spot photo removed" } -> lead null, count 0, notice.text kept (Review Focus 2) */
});
it("the viewer's caption is the tagged place word and item name; untagged photos have none", async () => {});
```

- [ ] **Step 8: Run to verify failure, then implement the server side**

Run: `pnpm exec vitest run src/components/photos src/photos`. Expected: FAIL. Implement `PrizesBlock` (ruling 4 to 8; headed `<h2>Prizes</h2>`; each place `data-testid="prize-place"`), `pagePhotos` (resolves `photoSrc` in parallel: the lead at size 160, viewer photos at 1600, prize plates at 160, removed at 160; `count` = live length; `notice.fallback` from `formatDateTime(at, tz)`, removed fallback from `formatShortDate`) and `ViewerButton`/`ViewerRoot` (the root holds `{ open, index, opener }` and renders the viewer through `next/dynamic(() => import("./photo-viewer").then((m) => m.PhotoViewer), { ssr: false })` only once opened; the button calls the same `import()` on `pointerenter`, `focus` and `touchstart` to warm the chunk, and sets `aria-busy` between the tap and the chunk). Run again. Expected: PASS.

- [ ] **Step 9: Implement the viewer (`photo-viewer.tsx`, client)**

A native `<dialog>` opened with `showModal()` in an effect (the pattern of `src/components/sheet.tsx`: `onCancel` prevents default and calls `onClose`; the page's scroll lock set and released). Content: a header with the "Close" button (44 px) and the visible caption (`viewerCaption(photo.caption, index, count)`); a horizontal scroll-snap strip (`snap-x snap-mandatory overflow-x-auto`, one slide per photo, `w-full shrink-0 snap-center`, `object-contain`, `max-h` of the dialog so a 320 px width and a landscape phone fit with no sideways page scroll; `motion-safe:scroll-smooth` only); `Previous photo` and `Next photo` buttons, 44 × 44 px minimum, **not rendered** where `neighbours` gives null (focus moves to the remaining button when the focused one disappears); ArrowLeft and ArrowRight on the dialog; a visually hidden `role="status"` `aria-live="polite"` (`data-testid="viewer-announce"`) that reads `positionText` on every change, whether by button, key or swipe (an `IntersectionObserver`, threshold 0.6, drives `onIndex` for swipes). Images: the current photo and its two neighbours load eagerly, the rest `loading="lazy"`, `srcSet` from each `ViewerPhoto`, `sizes="100vw"`. On open the strip scrolls to `index` (no animation); on close, focus returns to `opener`. Reduced motion: no smooth scrolling and no zoom (there is none).

- [ ] **Step 10: Wire the break page**

In `src/app/b/[id]/page.tsx` (the `photos` load from Task 7 serves every viewer: for a non-host pass `{ id: caller?.id, isHost: false, isHolder, isAdmin }` or `null` for anonymous):
- Title band per ruling 2. With `pp.lead`: `<section>` containing `<div className="flex items-start gap-3">` with the `h1` (`mt-3 min-w-0 flex-1`, same classes otherwise) and `<ViewerButton index={0} name={plateButtonName(pp.count, pp.updated)} className="relative mt-1 shrink-0" data-testid="photo-plate">` holding `<Plate photo={pp.lead} size={64} surface="board" decorative />` and the count strip (`pp.updated ? "Updated" : countText(pp.count)`); then the media row `<p>` unchanged. No lead: today's markup.
- Wrap the page's content in `<ViewerRoot photos={pp.viewer}>` when `pp.count > 0`.
- Render `<NoticeSeen breakId={id} unseen={pp.unseen} />` when the viewer is a holder (it calls `markSeenOnce(breakId, unseen, markPhotoNoticeSeenAction)` in an effect and renders null).
- Place `<PrizesBlock places={pp.places} untagged={pp.untagged} removed={pp.removed} notice={...} noticeFirst={audience === "holder"} />` after the share/host row and before `DetailsFold`; remove `prizes={prizeLines(...)}` from `DetailsFold` and its `prizes` prop and list (`prizeLines` stays in `frame-copy.ts` while other callers exist).
- `pagePhotos(..., { audience, tz: zone.tz })`, `audience` = `"host"` for the host, `"holder"` for a viewer holding a line, else `"other"`.

- [ ] **Step 11: Write the layout tests**

In `e2e/layout.spec.ts`, a second `beforeAll` block creates, with one host whose handle is the longest allowed (20 characters: email local part `"h".repeat(7) + run`, 13 digits) and a 120-character title (`"W".repeat(120)` words, e.g. `"Taylor Chronos ".repeat(8).trim().slice(0, 120)`): `plainLong` (a 50-line break, no photo, via `composeBreak`) and `photoLong` (the same through `composeBreakWithPhotos(page, { photos: 1, lineCount: 50 })`), and has the existing buyer claim lines 3 and 9 in `photoLong`.

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
test("a holder with an unseen change reads 'Updated' on the plate, a stranger the count", async () => { /* Task 12 journey changes the lead; here: stranger name is "Prize photos, 1" and text "1 photo" */ });
```

(`signedInMobile` is a local helper like the existing "You have" test's context setup. If 390 × 664 does not hold with a plate by a pixel or two, the plate geometry changes, not the budget: report the measured numbers.)

- [ ] **Step 12: Write the viewer e2e (Review Focus 5) and run**

`e2e/photos.spec.ts` (serial; one host composes `viewer3` with 3 photos and `viewer1` with 1 through `composeBreakWithPhotos`):

```ts
test("nothing of the viewer loads before the tap: no extra script, no 1600 px image", async ({ page }) => {
  const images: string[] = []; page.on("request", (r) => { if (/-1600\.webp/.test(r.url())) images.push(r.url()); });
  await gotoReady(page, viewer3);
  const scripts = () => page.evaluate(() => performance.getEntriesByType("resource").filter((e) => (e as PerformanceResourceTiming).initiatorType === "script" || e.name.endsWith(".js")).length);
  const before = await scripts(); expect(images).toEqual([]);
  await page.getByRole("button", { name: "Prize photos, 3" }).click();
  await expect(page.getByTestId("photo-viewer")).toBeVisible();
  expect(await scripts()).toBeGreaterThan(before);
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
test("one photo: no Previous or Next", async ({ page }) => { /* viewer1: both count 0, Close and Escape work */ });
test("Previous and Next are at least 44 px", async ({ page }) => { /* box.width >= 44 && box.height >= 44 */ });
for (const [w, h] of [[320, 568], [667, 375]] as const) {
  test(`the photo fits at ${w} × ${h} with no sideways scroll`, async ({ browser }) => {
    /* open viewer3; document.documentElement.scrollWidth <= innerWidth; the dialog's scrollWidth <= clientWidth of the page; the visible img box lies inside the viewport */
  });
}
test("reduced motion: the strip does not scroll smoothly", async ({ browser }) => { /* reducedMotion: "reduce"; computed scroll-behavior of the strip is "auto" */ });
test("axe is clean on a break page with photos, with the viewer closed and open", async ({ page }) => { /* AxeBuilder, as layout.spec.ts does */ });
```

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm exec playwright test e2e/layout.spec.ts e2e/photos.spec.ts`. Expected: PASS.

- [ ] **Step 13: Gates and commit**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`, the full e2e on `breaks_e2e`, then `pnpm build` and confirm the viewer is not in `/b/[id]`'s first load: the photo viewer's strings ("Previous photo", "Next photo") appear in no chunk the route's HTML references (`grep -l "Next photo" .next/static/chunks/*.js` lists a chunk, and that chunk's file name is absent from the page's HTML for a break with photos). Task 12 restores the numeric measurement and holds the allowance.
Expected: all green, no warnings; the copy audit passes ("Prize photos, N", "Updated", "Removed", the notice sentences, "Also in the photos").

```bash
git add src/components/photos src/photos src/lib/time.ts src/lib/time.test.ts src/components/local-time.tsx src/components/break/details-fold.tsx "src/app/b/[id]/page.tsx" e2e
git commit -m "feat(photos): break page plate, Prizes block and a lazily loaded photo viewer"
```

**Reviewer: Opus.** Focus: (a) no photo, no change: a break without photos renders byte-for-byte the title section it does today, and `DetailsFold` loses only the prize list; (b) a stranger, the feed and anonymous viewers get no removed photo, no archive path and no signed URL in the HTML or the RSC payload (view-source check on a break with a removed photo); (c) the 390 × 664 budget numbers are unchanged with the plate (the band is 76 px); (d) the viewer's code and the 1600 px images load only after the first tap; (e) every new string passes the copy audit and "Updated" never reads as a verification claim.

---


### Task 9: Other surfaces (model: Sonnet; Reviewer: Opus)

Spec §8.1 (feed card and host profile cards), §8.4 (pay sheet, result page, /me, /host), §6 (the /me notice sentence),
§8.0 (plate rules), decision 6 (the card still shows fill). A break without a photo renders exactly as today on every
surface. Photos on these surfaces are decorative (`alt=""`): each sits beside the break's title in text.

**Files:**
- Create: `src/photos/lead-srcs.ts` (one helper: lead photos to `PhotoSrc`, shared by the feed, landing, profile, /me and /host)
- Create: `src/components/host/host-break-row.tsx` (the /host row, extracted so it can be render-tested)
- Create: `src/components/break/pay-break-header.tsx` (plate and title at the top of the pay sheet)
- Modify: `src/components/break-card.tsx`, `src/app/breaks/page.tsx`, `src/app/page.tsx`, `src/app/h/[handle]/page.tsx`
- Modify: `src/components/me/my-break-card.tsx`, `src/components/me/me-copy.ts` (`MyBreakCardProps`), `src/app/me/card-props.ts`, `src/app/me/page.tsx`
- Modify: `src/app/host/page.tsx`
- Modify: `src/components/break/pay-sheet.tsx`, `src/components/break/break-interactive.tsx`, `src/app/b/[id]/page.tsx` (one line: pass `lead`)
- Modify: `src/app/b/[id]/result/page.tsx`, `src/components/photos/prizes-block.tsx` (the `frozen` prop, if Task 8 did not add it)
- Test: `src/photos/lead-srcs.test.ts`, `src/components/break-card.test.ts` (new), `src/components/me/my-break-card.test.ts`, `src/app/me/card-props.test.ts`, `src/components/host/host-break-row.test.ts`, `src/components/break/pay-break-header.test.ts`, `src/components/photos/prizes-block-frozen.test.ts`

**Interfaces:**
- Consumes: `leadPhotos(tx, breakIds): Promise<Map<string, PhotoView>>` (public locations only) and
  `breakPhotos(tx, breakId, viewer): Promise<BreakPhotos>` (Task 5); `photoSrc(storage, view, size): Promise<PhotoSrc>`
  (Task 6); `photoStorage(): PhotoStorage` (Task 1); `Plate({ photo, size, surface, decorative? })` (Task 8) rendering
  `data-testid="plate"`, `data-size`, `data-surface` on its root and an `<img>` whose `alt` is `""` when `decorative`;
  `PrizesBlock` (Task 8); `KitThumb({ cells, kit, heat, size })` and `kitThumbCells` (existing); `formatDateTime`,
  `LocalTime` (existing, as the result page uses them).
- Produces:
  - `leadSrcs(storage: PhotoStorage, leads: ReadonlyMap<string, PhotoView>, size: VariantWidth): Promise<Map<string, PhotoSrc>>`
    in `src/photos/lead-srcs.ts`. Throws if any view's `location` is not `"photos"`: a surface that is public by
    construction must never be handed a draft or archive path.
  - `BreakCard({ b, cells, photo? }: { b: FeedBreak; cells: ThumbCell[]; photo?: PhotoSrc | null })`. Test ids: `card-media`
    (the 108 px slot, with or without a photo), `thumb` (existing, now 96 px alone or 48 px in the corner), `plate`.
  - `MyBreakCardProps` gains `photo: PhotoSrc | null` and `photoNotice: { text: string; iso: string; fallback: string } | null`.
    `toCardProps(g, now, zone, flight, photos?: { photo: PhotoSrc | null; notice: { text: string; at: Date } | null })`.
    Test id `my-photo-notice`.
  - `HostBreakRow({ b, photo }: { b: HostBreakRow-shaped row of listHostBreaks; photo: PhotoSrc | null })` (a server component, the `<li>` of today's /host list).
  - `PayBreakHeader({ title, photo }: { title: string; photo: PhotoSrc | null })`: renders `null` without a photo; test id `pay-break`.
  - `PaySheet` gains `breakTitle: string; photo?: PhotoSrc | null`; `BreakInteractiveProps` gains `lead: PhotoSrc | null`.
  - `PrizesBlock` accepts `frozen?: boolean` (Task 8 owns the file; see "Contract changes").

- [ ] **Step 1: Write the failing test for `leadSrcs`**

`src/photos/lead-srcs.test.ts`, using `createMemoryStorage()` (Task 1) and a `view(id, location)` builder for `PhotoView`:

```ts
it("maps each break id to public srcset URLs without touching Storage", async () => {
  const storage = createMemoryStorage();
  const spy = vi.spyOn(storage, "signedReadUrl");
  const m = await leadSrcs(storage, new Map([["b1", view("p1", "photos", "b1/AAAAAAAAAAAAAAAAAAAAAA")]]), 160);
  expect([...m.keys()]).toEqual(["b1"]);
  expect(m.get("b1")!.src).toMatch(/\/storage\/v1\/object\/public\/photos\/b1\/AAAAAAAAAAAAAAAAAAAAAA-160\.webp$/);
  expect(m.get("b1")!.srcSet).toContain("-640.webp 640w");
  expect(JSON.stringify([...m])).not.toMatch(/token=|sign/);
  expect(spy).not.toHaveBeenCalled();
});
it("refuses a lead that is not in the public bucket", async () => {
  for (const loc of ["photos-draft", "photo-archive"] as const)
    await expect(leadSrcs(createMemoryStorage(), new Map([["b1", view("p1", loc, "b1/AAAAAAAAAAAAAAAAAAAAAA")]]), 160)).rejects.toThrow(/public/);
});
it("returns an empty map for no leads", async () => expect((await leadSrcs(createMemoryStorage(), new Map(), 160)).size).toBe(0));
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test src/photos/lead-srcs.test.ts`
Expected: FAIL, `leadSrcs` is not defined.

- [ ] **Step 3: Implement `leadSrcs` in `src/photos/lead-srcs.ts`**

Loop over the entries, throw `new Error("lead photos are public only")` on a non-`photos` location, else `photoSrc(storage, v, size)`.

- [ ] **Step 4: Run it to see it pass, then commit**

Run: `pnpm test src/photos/lead-srcs.test.ts` Expected: PASS.

```bash
git add src/photos/lead-srcs.ts src/photos/lead-srcs.test.ts
git commit -m "feat(photos): resolve lead photos to public srcsets for card surfaces"
```

- [ ] **Step 5: Write the failing render tests for the feed card**

`src/components/break-card.test.ts` (`renderToStaticMarkup(createElement(BreakCard, …))`, as `kit-thumb.test.ts` renders). Fixtures: a `FeedBreak` with title "Chronos 22g", `open` 12, `linePriceCents` 500, host `@jim`, kit `{ dark: "blue", light: "yellow" }`, `heat: 0`; `cells` of 50 `ThumbCell`s (10 paid, 28 taken, 12 open, in number order); `photo: PhotoSrc` with `alt: "Chronos 22g"`.

```ts
describe("BreakCard (spec §8.1)", () => {
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
  it("still links the whole card to the break", () => expect(card({ photo })).toContain('href="/b/b1"'));
});
```

- [ ] **Step 6: Run them to see them fail**

Run: `pnpm test src/components/break-card.test.ts`
Expected: FAIL (no `photo` prop; no `plate`).

- [ ] **Step 7: Implement the card in `src/components/break-card.tsx`**

New optional prop `photo?: PhotoSrc | null`. Without it, render today's `<KitThumb … size={96} />` untouched. With it, replace
that element by `<span data-testid="card-media" className="relative block shrink-0">` of the same 108 px width and height
holding `<Plate photo={photo} size={96} surface="board" decorative />` and, positioned at the bottom-right corner, `<KitThumb
cells={kitThumbCells(cells)} kit={b.kit} heat={b.heat} size={48} />`. The corner board covers the plate's corner and nothing
else: it sits inside the slot (so the caption never moves between cards with and without a photo). The exact offset is the
builder's (spec §12); the e2e in Task 12 measures that the two boxes intersect and that the board covers at most a third of the
plate's area.

- [ ] **Step 8: Feed, landing and profile pages pass the photo**

In each of `src/app/breaks/page.tsx`, `src/app/page.tsx` (the "Open now" cards only; the hero is unchanged) and
`src/app/h/[handle]/page.tsx` (inside `loadProfile`'s transaction, the profile's `open` cards): add
`leads: await leadPhotos(tx, rows.map((r) => r.id))` to the transaction's result, and after it
`const srcs = await leadSrcs(photoStorage(), leads, 160)`; render `<BreakCard … photo={srcs.get(b.id) ?? null} />`. The
hero's `KitThumb` and the profile's record board stay as they are.

- [ ] **Step 9: Run the card tests and the existing feed tests**

Run: `pnpm test src/components/break-card.test.ts src/domain/breaks/feed.test.ts src/components/kit-thumb.test.ts`
Expected: PASS (sandbox off: the feed test uses the database).

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
it("is unchanged for a break with no photos", () => {
  const p = toCardProps(group, now, zone, flight);
  expect([p.photo, p.photoNotice]).toEqual([null, null]);
});
```

In `src/components/me/my-break-card.test.ts` (same `html()` helper; `owing` gains `photo: null, photoNotice: null`):

```ts
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

Run: `pnpm test src/app/me/card-props.test.ts src/components/me/my-break-card.test.ts`
Expected: FAIL.

- [ ] **Step 13: Implement /me**

- `me-copy.ts`: add the two fields to `MyBreakCardProps` (above).
- `card-props.ts`: `toCardProps` takes the optional fifth argument and sets `photo` and `photoNotice` (`null` when absent).
- `my-break-card.tsx`: the title row becomes `<div flex items-start gap-3>` with `<Plate photo={p.photo} size={40} surface="paper" decorative />` first when `p.photo` is set, then the title link and pill as now. The notice is `<p data-testid="my-photo-notice" role="status" className="text-small">{text}, <LocalTime iso fallback kind="datetime" />.</p>` placed directly under the title row, before the cells. Pass `breakTitle={p.title} photo={p.photo}` to its `PaySheet`.
- `me/page.tsx`: for each current (not `earlier`) group, in the same transaction, `breakPhotos(tx, g.breakId, { id: caller.id, isHost: false, isHolder: true, isAdmin: false })`; the plate is `live[0]` resolved with `photoSrc(photoStorage(), live[0], 160)` (a holder's lead is public once the break is open, so this is a public URL), the notice is `notice` only while `unseen`. `/me` never writes `photo_notices_seen`: the break page does, when the holder opens it.

- [ ] **Step 14: Run the /me tests, then commit**

Run: `pnpm test src/app/me src/components/me` Expected: PASS.

```bash
git add src/app/me src/components/me
git commit -m "feat(me): lead photo plate and the unseen photo notice on each card"
```

- [ ] **Step 15: Write the failing tests for /host and the pay sheet**

`src/components/host/host-break-row.test.ts`:

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

Run: `pnpm test src/components/host src/components/break/pay-break-header.test.ts` Expected: FAIL.

- [ ] **Step 17: Implement /host and the pay sheet**

- `host-break-row.tsx`: move the `<li>` block of `src/app/host/page.tsx` into it unchanged and add the plate (`40`, `paper`, `decorative`) to the left of the title line when `photo` is set, so the link's content is `flex gap-3`. `host/page.tsx` loads `leadPhotos(tx, rows.map((r) => r.id))` in its transaction and `leadSrcs(photoStorage(), …, 160)` after it; a draft's photos are in the private bucket, so a draft row shows no plate (the draft editor has the strip).
- `pay-break-header.tsx`: `<div data-testid="pay-break" className="flex items-center gap-3">` with the plate and the title (`font-semibold`, `min-w-0`, two lines at most), null without a photo.
- `pay-sheet.tsx`: props `breakTitle: string; photo?: PhotoSrc | null`; render `<PayBreakHeader title={p.breakTitle} photo={p.photo ?? null} />` as the first child of the body's `space-y-4` div. `break-interactive.tsx`: prop `lead: PhotoSrc | null`, passed as `photo={p.lead}` with `breakTitle={p.title}`; `src/app/b/[id]/page.tsx` passes the lead Task 8 already resolved for the plate (the same `PhotoSrc`, 160 variant).

- [ ] **Step 18: Run them, then commit**

Run: `pnpm test src/components/host src/components/break` Expected: PASS.

```bash
git add src/components/host src/components/break src/app/host/page.tsx "src/app/b/[id]/page.tsx"
git commit -m "feat(ui): lead photo plate on the host dashboard rows and the pay sheet"
```

- [ ] **Step 19: Write the failing test for the result page's Prizes block**

`src/components/photos/prizes-block-frozen.test.ts`, rendering Task 8's `PrizesBlock` with its test fixture builders (a break with a top-spot item, one "or" alternative, a 2nd place, two live photos and one removed photo):

```ts
it("frozen renders the order, the photos and the notice as a record, with no edit or viewer-opening affordance beyond the plates", () => {
  const h = render({ frozen: true });
  expect(h).toContain("Prizes");
  expect(h.match(/data-testid="plate"/g)!.length).toBeGreaterThanOrEqual(2);
  expect(h).not.toMatch(/Edit photos|Updated/);
});
it("frozen with no photos is the place names only", () => {
  const h = render({ frozen: true, photos: none });
  expect(h).toContain("Top spot");
  expect(h).not.toContain('data-testid="plate"');
});
it("shows the holder their removed photo, marked Removed, on the result page too", () => {
  expect(render({ frozen: true, viewer: holder })).toMatch(/Removed Oct \d{1,2}/);
  expect(render({ frozen: true, viewer: stranger })).not.toContain("Removed");
});
```

- [ ] **Step 20: Run it to see it fail, then implement the result page**

Run: `pnpm test src/components/photos/prizes-block-frozen.test.ts` Expected: FAIL (no `frozen` behaviour) or PASS if Task 8 already built it; then only the page wiring below remains.

In `src/app/b/[id]/result/page.tsx`: inside the existing `db.transaction`, `breakPhotos(tx, id, viewer)` with the viewer built exactly as the break page builds it (Task 8's helper; if it was written inline there, extract it first to `src/photos/viewer.ts` as `photoViewer(caller: Caller | null, ctx: { hostId: string; holderIds: ReadonlySet<string> }): { id: string; isHost: boolean; isHolder: boolean; isAdmin: boolean } | null`, with `holderIds` the distinct `ownerId`s of `res.entries`, and use it in both pages). Render `<PrizesBlock … frozen />` inside the `after` fragment directly below the `full-order` list, with the same `h2` weight as "Full order". The board, the reveal, the caller banner, Replay, Share and Technical details do not change, and no plate appears in the banner or the reveal.

- [ ] **Step 21: Gates**

Run: `export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH && pnpm exec tsc --noEmit && pnpm lint && pnpm test` (sandbox off)
Expected: all clean and green.
Then the existing e2e, which must pass unchanged because no break in it has a photo: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test:e2e`
Expected: PASS on `breaks_e2e`.

- [ ] **Step 22: Commit**

```bash
git add "src/app/b/[id]/result/page.tsx" src/components/photos src/photos
git commit -m "feat(result): the Prizes block below the full order, frozen"
```

---


### Task 10: Link preview photo (model: Opus)

Spec §8.4 "Link preview", Mosaic §6 (the preview shapes for no viewer and carries no holder, handle or flight). The lead
photo joins the preview as a plate: beside the board and the caption, the board unchanged on the left. On a ran break
the board with its bulls stays the hero and the plate is smaller. The route never lets the renderer fetch anything: it
builds the one URL it may fetch from `SUPABASE_URL` and the `photos` bucket, checks the prefix, fetches with a timeout
and a byte cap, and passes a data URI. Any failure renders the preview without the photo; it never fails the preview.

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
  - Task 4: `sharp` (tests only, to make a WebP fixture and read pixels back).
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
    - `leadPhotoDataUri(breakId: string, prefix: string, opts?: { fetcher?: typeof fetch; timeoutMs?: number }): Promise<string | null>`. Never throws.
  - `src/app/b/[id]/og/image.tsx`: `OG_PLATE_PX = 200`, `OG_PLATE_RAN_PX = 120`, `ogImage(m: OgModel, photo: string | null = null)` (the data URI; `m.photo` alone draws nothing).
  - `GET /b/{id}/og`: contract unchanged (1200 × 630 PNG, `public, max-age=300, s-maxage=300`, 404 for drafts, no session).

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
  it("still has no holder, handle or flight anywhere, photo or not", () => {
    const text = JSON.stringify(ogModel({ ...page(lines), lead: lead("photos") }, now));
    expect(text).not.toMatch(/alice|pink|slim|flight|holder|owner|handle/);
    expect(text).not.toContain(ALICE);
  });
});
```

3. Add, against the database (`withTx`, `makeUser`, `openBreakWithLines`, `makeBreak`, `claimLines` from the existing
   helpers). A local helper `addPhoto(tx, host, breakId)` calls `issueUploadTicket` then `recordProcessedPhoto` with
   `prefix = \`${breakId}/${randomBytes(16).toString("base64url")}\``, `width: 1600, height: 1200, slot: null, alt: "Darts"`.
   `preview(tx, breakId)` is `ogModel({ ...(await getBreakPage(tx, breakId))!, lead: (await leadPhotos(tx, [breakId])).get(breakId) ?? null }, now)`.

```ts
describe("the lead photo as the preview reads it (photos spec §8.4: hidden, removed, draft)", () => {
  it("shows the live lead of an open break", async () => withTx(async (tx) => {
    const host = await makeUser(tx, { role: "host" });
    const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
    const { photoId } = await addPhoto(tx, host, b.id);
    expect((await preview(tx, b.id))!.photo?.id).toBe(photoId);
  }));
  it("drops a hidden lead, and the next live photo leads", async () => withTx(async (tx) => {
    // two photos; hidePhoto(tx, SYSTEM, { photoId: first, reason: "test", now }) → photo.id is the second
    // hide the second too → photo is null
  }));
  it("drops a lead the host removed, before and after the first claim", async () => withTx(async (tx) => {
    // removePhoto before any claim → photo null; add again, claimLines, removePhoto (archive: true) → photo null
  }));
  it("has no preview at all for a draft, whose photos are in photos-draft", async () => withTx(async (tx) => {
    // makeBreak (draft) + addPhoto → leadPhotos has no entry for it and preview(...) is null
  }));
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/domain/breaks/og.test.ts`
Expected: FAIL: the key lists lack `photo`, `OgPage` has no `lead`.

- [ ] **Step 3: Add `photo` to the model**

In `src/domain/breaks/og.ts`, add `OgPhoto`, `OgPage.lead`, `OgModel.photo` as in Interfaces. `ogModel` copies only
`id` and `prefix`, and only when `lead?.location === "photos"`; the location never leaves the function. Update the
`OgModel` doc comment: the photo is a published file's id and prefix, nothing else.

- [ ] **Step 4: Run the model tests**

Run: `pnpm test src/domain/breaks/og.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing fetch tests**

`src/app/b/[id]/og/photo.test.ts`, no database. `B` is a uuid, `P = \`${B}/${"A".repeat(22)}\``, `URL640 = publicVariantUrl(P, 640)`.
`webp` is a real 640 × 480 WebP made with `sharp({ create: { width: 640, height: 480, channels: 3, background: "#ff0000" } }).webp().toBuffer()`.
`fetcher` is a `vi.fn` returning `new Response(body, { headers })`.

```ts
describe("leadPhotoDataUri (photos spec §8.4)", () => {
  it("fetches the 640 variant from the photos bucket under SUPABASE_URL, without redirects, and returns a WebP data URI", async () => {
    const f = vi.fn(async () => new Response(webp, { headers: { "content-type": "image/webp" } }));
    const uri = await leadPhotoDataUri(B, P, { fetcher: f });
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
```

- [ ] **Step 6: Run them to see them fail**

Run: `pnpm test 'src/app/b/\[id\]/og/photo.test.ts'`
Expected: FAIL: `./photo` does not exist.

- [ ] **Step 7: Implement `leadPhotoDataUri` in `src/app/b/[id]/og/photo.ts`**

Order: `PREFIX_PATTERN.test(prefix)` and `prefix.startsWith(\`${breakId}/\`)`, else null; `url = publicVariantUrl(prefix, 640)`
and assert it starts with `` `${env().SUPABASE_URL}/storage/v1/object/public/photos/` `` (belt over Task 1); fetch with
`{ signal: AbortSignal.timeout(timeoutMs), redirect: "error", cache: "no-store" }`; require `ok`; refuse a
`content-length` over the cap before reading; read `body` chunk by chunk and cancel the reader once the total passes
`OG_PHOTO_MAX_BYTES`; require the WebP magic (`RIFF` at 0, `WEBP` at 8); return the base64 data URI. One `try/catch`
around the whole returns null on anything thrown. No logging of the URL.

- [ ] **Step 8: Run the fetch tests**

Run: `pnpm test 'src/app/b/\[id\]/og/photo.test.ts'`
Expected: PASS.

- [ ] **Step 9: Write the failing image tests**

In `src/app/b/[id]/og/image.test.ts` (the existing `model()` helper gains `photo: null` in its defaults). `RED` is a
`data:image/webp;base64,` URI of a 640 × 480 pure red WebP (sharp, as Step 5). `redBox(png)` decodes the PNG with
`sharp(png).raw()` and returns the bounding box `{ x0, y0, x1, y1 }` of pixels with `r > 240 && g < 20 && b < 20`, or null.

```ts
describe("the lead photo plate (photos spec §8.0, §8.4)", () => {
  const render = async (o: Partial<OgModel>, photo: string | null) =>
    Buffer.from(await new ImageResponse(ogImage(model(o), photo), { ...OG_SIZE, fonts: ogFonts() }).arrayBuffer());
  it("renders a WebP data URI (Satori draws it with no fetch)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await redBox(await render({ photo: { id: "x", prefix: "y" } }, RED))).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("is a 200 px square beside the board on an open break, never in the board column", async () => {
    const box = (await redBox(await render({ ...STATUSES.open, photo: { id: "x", prefix: "y" } }, RED)))!;
    expect([box.x1 - box.x0 + 1, box.y1 - box.y0 + 1]).toEqual([OG_PLATE_PX, OG_PLATE_PX]);
    expect(box.x0).toBeGreaterThanOrEqual(GRID_PX + 2 * 64 + 8); // past the column, mat and keyline included
  });
  it("is smaller on a ran break, where the board and its bulls stay in front", async () => {
    const box = (await redBox(await render({ ...STATUSES.ran, photo: { id: "x", prefix: "y" } }, RED)))!;
    expect(box.x1 - box.x0 + 1).toBe(OG_PLATE_RAN_PX);
    expect(box.x0).toBeGreaterThanOrEqual(GRID_PX + 2 * 64 + 8);
  });
  it("draws no plate without a data URI, even when the model names a photo", async () => {
    expect(await redBox(await render({ photo: { id: "x", prefix: "y" } }, null))).toBeNull();
  });
  it("keeps the title to two lines while a plate shows", () => {
    const tree = expand(ogImage(model({ title: "x".repeat(80), photo: { id: "x", prefix: "y" } }), RED));
    // the title node's maxHeight is ceil(44 * 1.1 * 2) with a plate, ceil(44 * 1.1 * 3) without
  });
});
```

The existing per-status and kit PNG loop also renders each status once with `RED` (and writes
`${status}-${kitName}-photo.png` under `OG_PREVIEW=1` for the by-eye check; never committed).

- [ ] **Step 10: Run them to see them fail**

Run: `pnpm test 'src/app/b/\[id\]/og/image.test.ts'`
Expected: FAIL: `ogImage` ignores a second argument, `OG_PLATE_PX` is not exported.

If the first test fails because the renderer cannot decode WebP (an error from `ImageResponse`, or no red box while the
plate's `<img>` is in the tree), stop and report **BLOCKED: og-webp** with the error. The fallback, for the owner to
approve, is to transcode in `leadPhotoDataUri` with sharp to PNG (`limitInputPixels: 12e6`, `failOn: "error"`) before
building the data URI.

- [ ] **Step 11: Draw the plate in `ogImage(m, photo)`**

Values from the layout list above. The plate renders only when both `m.photo` and `photo` are set. The `<img>` has
`width`/`height` equal to the plate side and `style.objectFit = "cover"`; no tint, no filter, no border radius.

- [ ] **Step 12: Run the image tests**

Run: `pnpm test 'src/app/b/\[id\]/og/image.test.ts'`
Expected: PASS. Then `OG_PREVIEW=1 pnpm test 'src/app/b/\[id\]/og/image.test.ts'` and look at the `-photo.png` files in
`.superpowers/og-preview/`: the plate clear of the frame, the caption unclipped, the ran board unchanged.

- [ ] **Step 13: Write the failing route tests**

In `src/app/b/[id]/og/route-failure.test.ts` (no database; mocks as today): the `ogModel` mock returns
`photo: { id, prefix }` with `prefix = \`${id}/${"A".repeat(22)}\`` built from the requested id; mock
`@/domain/photos/queries` with `leadPhotos: async () => new Map()`; stub `fetch` with `vi.stubGlobal`.

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
    // the ogModel mock returns prefix "../photo-archive/x" for this case
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    expect((await get(ID)).status).toBe(200);
    expect(f).not.toHaveBeenCalled();
  });
  it("makes exactly one fetch, to the 640 variant, when the photo is fine", async () => {
    const f = vi.fn(async () => new Response(webp, { headers: { "content-type": "image/webp" } })); vi.stubGlobal("fetch", f);
    expect((await get(ID)).status).toBe(200);
    expect(f.mock.calls.map((c) => String(c[0]))).toEqual([publicVariantUrl(`${ID}/${"A".repeat(22)}`, 640)]);
  });
});
```

In `src/app/b/[id]/og/route.test.ts`, add: an open break with a live photo (Task 5 commands, as Step 1's `addPhoto`) and
`fetch` stubbed to return `webp` answers 200 and `fetch` was called with that photo's 640 URL; a draft with a photo still
answers 404 and `fetch` is not called. `afterEach(() => vi.unstubAllGlobals())`.

- [ ] **Step 14: Run them to see them fail**

Run: `pnpm test 'src/app/b/\[id\]/og/'`
Expected: FAIL: the route reads no lead and never fetches.

- [ ] **Step 15: Wire the route**

In `route.tsx`, inside the existing transaction: `lead = (await leadPhotos(tx, [id])).get(id) ?? null`, passed as
`OgPage.lead`. After `ogModel`: `photo = m.photo ? await leadPhotoDataUri(id, m.photo.prefix) : null`, outside the
transaction, then `ogImage(m, photo)`. The doc comment gains: the only network call is the lead's 640 variant on the
project's own Storage host; the renderer gets a data URI. A thrown `leadPhotos` falls into the existing catch (404),
as any other read failure does today.

- [ ] **Step 16: Run the OG suite and the gates**

Run: `pnpm test 'src/app/b/\[id\]/og/' src/domain/breaks/og.test.ts && pnpm exec tsc --noEmit && pnpm lint`
Expected: PASS, no type errors, no lint warnings.

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
missing file is not an error, and a crash between a removal and its row update is finished by the next run.

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
   **Deleted drafts** (`deleteDraft` removes the rows) fall under this rule: their files have no row.
3. **Archive retention**: rows in `photo-archive` with `path` set and `coalesce(hidden_at, removed_at) < now − 180 days`,
   whose break is not under hold: remove the three variants, then `dropPhotoFiles` (path → null; the Removed mark stays
   with no image, spec §6).
4. **Cancelled breaks**: breaks with status `cancelled` whose latest `break.cancelled` event is older than 180 days, not
   under hold. Every row with `path` set is handled: its variants are removed from its bucket (and from `photos-draft`
   and `photo-archive`, in case), then `dropPhotoFiles`. A cancelled break with no `break.cancelled` event is left
   alone, since there is no date to count from (no cancel command exists yet; `src/domain/lines/queries.ts` dates
   cancellations the same way).

**Holds** (the reports plan plugs in here): `src/domain/photos/holds.ts` exports
`breaksUnderHold(tx: Tx): Promise<ReadonlySet<string>>`. It always returns an empty set today, with a doc comment
saying the reports plan replaces its body with "break ids with an open report on the break or on anything in it"
(platform spec §12). Rules 3 and 4 skip those breaks. `runPhotoCleanup` takes it through `deps.holds` so tests can
supply one. Account anonymisation (spec §5.6, last line) is the admin runbook's and is not in this job.

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
  - Task 1: `PhotoStorage` (`list`, `remove`, `copy`), `photoStorage()`, `BUCKETS`, `VARIANT_WIDTHS`, `variantPath`,
    `createMemoryStorage` (with the clock of contract change 3).
  - Task 2: `break_photos` (`path` nullable, change 2), `photo_uploads`, `events`.
  - Task 3: `deleteDraft`. Task 5: `issueUploadTicket`, `recordProcessedPhoto`, `removePhoto`, `hidePhoto`,
    `breakPhotos`, `leadPhotos`. `SYSTEM` from `src/domain/types.ts`.
- Produces:
  - `src/db/client.ts`: `type TxRunner = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>`; `inTransaction: TxRunner` (`db.transaction`).
  - `src/jobs/job-lock.ts`: `withHeldJobLock<T>(name: string, work: () => Promise<T>): Promise<T | "locked">`
    (key `hashtext('job:' || name)`, the same key scheme as `withJobLock` in `tick.ts`).
  - `src/domain/photos/holds.ts`: `breaksUnderHold(tx: Tx): Promise<ReadonlySet<string>>`.
  - `src/domain/photos/retention.ts`: `dropPhotoFiles(tx: Tx, photoIds: readonly string[]): Promise<void>` (sets
    `path = null`; used by the job and the script).
  - `src/jobs/photo-cleanup.ts`:
    - `type PhotoCleanupResult = { incoming: number; tickets: number; orphans: number; archive: number; cancelled: number; done: boolean }` (files removed per rule, tickets deleted; `done` false when the time budget ran out);
    - `type PhotoCleanupDeps = { run?: TxRunner; holds?: (tx: Tx) => Promise<ReadonlySet<string>>; batchSize?: number; budgetMs?: number }` (defaults `inTransaction`, `breaksUnderHold`, 100, 240 000);
    - `runPhotoCleanup(storage: PhotoStorage, now: Date, deps?: PhotoCleanupDeps): Promise<PhotoCleanupResult | "locked">`.
  - `src/lib/cron-auth.ts`: `cronAuthorized(req: Request): boolean` (the tick route's timing-safe Bearer check, moved).
  - `GET /api/photos/cleanup`: 401 `{ error: "unauthorized" }` without the secret; else 200 with the result JSON.
    `maxDuration = 300`, `dynamic = "force-dynamic"`, Node runtime. Logs one line
    `{"job":"photo-cleanup","ms":…,"result":…}`.
  - `vercel.json`: `{ "crons": [{ "path": "/api/tick", "schedule": "* * * * *" }, { "path": "/api/photos/cleanup", "schedule": "17 9 * * *" }] }`.
  - `src/photos/hide.ts`:
    - `parseHideArgs(argv: readonly string[]): { photoId: string; reason: string; purge: boolean } | { error: string }`;
    - `type HideOutcome = { status: "hidden" | "already-hidden" | "purged"; breakId: string }`;
    - `hidePhotoAndFiles(storage: PhotoStorage, p: { photoId: string; reason: string; purge: boolean; now: Date }, run?: TxRunner): Promise<HideOutcome>`. Throws `NotFound` for an unknown id.
  - `scripts/hide-photo.ts <photo id> <reason> [--purge]`: exit 0 and one line (`hidden <id>`, `already hidden <id>`,
    `purged <id>`), exit 2 and the usage on bad arguments, exit 1 on any failure.
  - Event `photo.purged` (audit-only, inserted with `processed_at` set): payload `{ photoId, reason, buckets }`. The hide itself is Task 5's `photo.hidden`.

- [ ] **Step 1: Write the failing cleanup tests**

`src/jobs/photo-cleanup.test.ts`. Each test runs in `withTx` and passes `run: (fn) => fn(tx)`, so the job's reads and
writes see the test's rows and roll back with them; the lock still goes through `db`. `T0 = new Date("2026-10-21T09:17:00Z")`.
`clock` is a mutable `Date` the memory storage reads (`createMemoryStorage(() => clock)`), so `clock = hoursAgo(25)`
before a `put` makes a file 25 h old. Helpers in the file:
- `variants(bucket, prefix)` puts the three `variantPath(prefix, w)` files;
- `has(storage, bucket, path)` is `storage.files.has(\`${bucket}/${path}\`)`;
- `addPhoto(tx, host, breakId)` as Task 10 Step 1, plus `variants(BUCKETS.draft | BUCKETS.public, prefix)` for where the row says.
Backdating rows uses direct SQL (`update break_photos set removed_at = …`, `insert into events (break_id, type, created_at) values (…, 'break.cancelled', …)`).

```ts
describe("runPhotoCleanup (photos spec §5.6)", () => {
  it("removes incoming files and unconsumed tickets older than 24 hours, and keeps younger ones (Review Focus 3)", …);
    // ticket A issued at T0−25h, never consumed, its incoming file put at T0−25h → file gone, row gone
    // ticket B issued at T0−23h, unconsumed, file at T0−23h → both kept
    // ticket C consumed at T0−30h → row kept; result.incoming === 1, result.tickets === 1
  it("removes published and draft files that no live row names, after 24 hours", …);
    // photos/{b}/{r1}-* with no row, 25h → gone (3 files counted)
    // photos/{b}/{r2}-* for a live photos row, 25h → kept
    // photos/{b}/{r3}-* with no row, 23h → kept
    // photos/{b}/junk.txt, 25h → gone
  it("keeps a failed open's public copy while the row is still a draft, and drops the draft copy once the break is open", …);
    // draft row r4 in photos-draft + copies in photos (25h) → both kept
    // open break row r5 in photos, a stale photos-draft copy (25h) → draft copy gone, public kept
  it("removes a deleted draft's photos", …);
    // makeBreak + addPhoto (photos-draft, files 25h old), deleteDraft(tx, host, id) leaving the files → files gone
  it("removes an archive copy no row names (a crash before a hide or remove committed)", …);
  it("drops archived photos after 180 days, keeps them before, and keeps them while the break is under hold", …);
    // removed after the first claim (removePhoto → archive), removed_at = T0−181d → files gone; breakPhotos(holder).removed[0].prefix === null
    // another at T0−179d → kept
    // a third at T0−181d on a break in holds → kept; result.archive === 3
    // a hidden photo (hidePhoto SYSTEM, files moved to archive), hidden_at = T0−181d → gone
  it("drops a cancelled break's photos 180 days after the cancel, not before, not under hold, not without a cancel event", …);
    // status = 'cancelled', a 'break.cancelled' event at T0−181d, one live row in photos + one removed in archive → every file gone, both rows path null, leadPhotos has no entry
    // same at T0−179d → kept; same at T0−181d under hold → kept; cancelled with no event → kept
  it("works through more than one batch in a run", …);
    // batchSize 2, five orphan prefixes 25h old → all 15 files gone, done === true
  it("stops at the time budget and finishes on the next run", …);
    // budgetMs 0 → done === false and some orphans left; a second run with the default budget leaves none
  it("is idempotent: a second run removes nothing, and a file already gone is not an error", …);
    // run twice → second result all zeros; a row due for archive drop whose files are already missing → still dropped
  it("returns locked while another run holds the lock, and touches nothing", async () => {
    await db.transaction(async (holder) => {
      await holder.execute(sql`select pg_advisory_xact_lock(hashtext('job:photo-cleanup'))`);
      const storage = createMemoryStorage(() => clock);
      expect(await runPhotoCleanup(storage, T0)).toBe("locked");
    });
  });
});

describe("breaksUnderHold", () => {
  it("is empty until the reports plan gives it open reports", async () => withTx(async (tx) => expect((await breaksUnderHold(tx)).size).toBe(0)));
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test src/jobs/photo-cleanup.test.ts`
Expected: FAIL: `./photo-cleanup` does not exist.

- [ ] **Step 3: Implement the lock, the holds hook, `dropPhotoFiles` and `runPhotoCleanup`**

`withHeldJobLock`: `db.transaction` → `pg_try_advisory_xact_lock(hashtext('job:' || name))` → if not got, `"locked"`;
else `await work()` and return it. The holder transaction runs no other statement. `runPhotoCleanup` wraps the four
rules in `withHeldJobLock("photo-cleanup", …)`. Each batch: read (`run`) → Storage (no transaction) → write (`run`).
Before each batch it checks `Date.now() - started < budgetMs`, else it returns with `done: false`. Storage listing uses
`storage.list(bucket, "")` (contract change 1: recursive, full paths) and filters by `createdAt` in the job. A batch
removes all of one prefix's variants in one `remove` call.

- [ ] **Step 4: Run the cleanup tests**

Run: `pnpm test src/jobs/photo-cleanup.test.ts`
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
it("answers 200 with locked when another run holds the lock", …); // mock returns "locked" → body "locked"
it("is scheduled daily beside the minute tick", () => {
  expect(JSON.parse(readFileSync("vercel.json", "utf8")).crons).toEqual([
    { path: "/api/tick", schedule: "* * * * *" },
    { path: "/api/photos/cleanup", schedule: "17 9 * * *" },
  ]);
});
```

- [ ] **Step 6: Run them to see them fail**

Run: `pnpm test src/lib/cron-auth.test.ts src/app/api/photos/cleanup/route.test.ts`
Expected: FAIL: the modules do not exist; `vercel.json` has one cron.

- [ ] **Step 7: Add `cronAuthorized`, the route and the cron entry**

Move the tick route's check into `cronAuthorized`, and have both routes call it. The cleanup route mirrors `/api/tick`:
`runPhotoCleanup(photoStorage(), new Date())`, then logs and returns JSON. Update `vercel.json` as in Interfaces.

- [ ] **Step 8: Run them**

Run: `pnpm test src/lib/cron-auth.test.ts src/app/api/photos/cleanup/route.test.ts`
Expected: PASS.

- [ ] **Step 9: Write the failing hide tests**

`src/photos/hide.test.ts`, in `withTx` with `run = (fn) => fn(tx)` and a memory storage. `addPhoto` as Step 1.

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
  it("hides a published photo: row hidden, photo.hidden written, public variants gone, a copy in the archive", …);
    // every VARIANT_WIDTHS path: absent from photos, present in photo-archive; leadPhotos skips it;
    // breakPhotos for a holder lists it in neither live nor removed (a hidden photo is never shown)
  it("hides a draft's photo the same way, from photos-draft", …);
  it("hides a photo the host had removed after the first claim, leaving its files in the archive", …);
  it("purges: every copy in every bucket gone, the row's path null, photo.purged written with the reason", …);
    // no file under the prefix in any of the four buckets; the event has processed_at set
  it("purges a photo hidden earlier, removing the archive copy", …);
  it("does nothing to a photo already hidden without --purge, and says so", …); // status "already-hidden", files unchanged
  it("leaves the photo visible when the archive copy fails: the copy runs before the hide commits", …);
    // storage.copy rejects → throws; hidden_at still null; public files still there
  it("throws NotFound for an unknown photo id", …);
});
```

- [ ] **Step 10: Run them to see them fail**

Run: `pnpm test src/photos/hide.test.ts`
Expected: FAIL: `./hide` does not exist.

- [ ] **Step 11: Implement `hidePhotoAndFiles`, `parseHideArgs` and the script**

Order inside `hidePhotoAndFiles`. Each storage step runs with no transaction open:
1. Read the row (`path`, `bucket`, `hidden_at`, `break_id`); throw `NotFound` if there is none.
2. If it is already hidden and `purge` is false, return `already-hidden`.
3. If it is not hidden: copy each variant to `photo-archive`, unless it is already there. Then, in one
   transaction, run `hidePhoto(tx, SYSTEM, { photoId, reason, now })`. Then remove the variants from `from`.
4. With `purge`: remove the variants from all four buckets. Then, in one transaction, run `dropPhotoFiles` and
   insert `photo.purged`.
`scripts/hide-photo.ts` follows `scripts/verify-draws.ts`: dotenv first, its own `postgres` client with `max: 1`, a
`TxRunner` over that client, and `photoStorage()`. It prints the usage
`Usage: pnpm exec tsx scripts/hide-photo.ts <photo id> <reason> [--purge]` on a parse error.

- [ ] **Step 12: Run them**

Run: `pnpm test src/photos/hide.test.ts`
Expected: PASS.

- [ ] **Step 13: Write the runbook and the README lines**

No runbook file exists yet: the platform spec says "admin runbook", and README carries operational notes. Create
`docs/runbooks/photos.md` with these sections, in plain words:
- **Hide a photo**: the command with and without `--purge`, where the photo id comes from (the break page's image URL
  holds the prefix; `select id from break_photos where path = '<prefix>'`), and what each mode leaves behind.
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
- **Cleanup**: the daily `/api/photos/cleanup` (09:17 UTC), what it removes (the four rules) and the hold hook
  (`breaksUnderHold`), and how to run it by hand: `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/photos/cleanup`.

In `README.md`: add a Scripts row `| pnpm exec tsx scripts/hide-photo.ts <id> <reason> [--purge] | Hide (or purge) a photo; see docs/runbooks/photos.md |`.
To the Deploy bullet about `CRON_SECRET`, add: "and to `/api/photos/cleanup` (daily, 09:17 UTC)". Task 12 owns the
rest of the README; keep these two lines when it edits.

- [ ] **Step 14: Run the gates**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:concurrency`
Expected: all PASS, no lint warnings. Then the script, against the local stack, on a throwaway photo:
`pnpm exec tsx scripts/hide-photo.ts not-a-uuid x; echo $?` prints the usage and `2`.

- [ ] **Step 15: Commit**

```bash
git add src/db/client.ts src/jobs/job-lock.ts src/jobs/photo-cleanup.ts src/jobs/photo-cleanup.test.ts \
  src/domain/photos/holds.ts src/domain/photos/retention.ts src/lib/cron-auth.ts src/lib/cron-auth.test.ts \
  src/app/api/tick/route.ts src/app/api/photos/cleanup vercel.json src/photos/hide.ts src/photos/hide.test.ts \
  scripts/hide-photo.ts docs/runbooks/photos.md README.md
git commit -m "feat(photos): daily cleanup cron, hide script and photos runbook"
```

---


### Task 12: Budget, copy audit, e2e, README (model: Sonnet; Reviewer: Opus)

Spec §11 and Review Focus 2 and 5. First, `scripts/measure-first-load.mjs`: Plan C's measurement read
`app-build-manifest.json`, which Turbopack no longer writes, so there is no working number today. This task restores it,
records the number on the commit this branch started from (before any photo code), and asserts the allowance after the
plan. Then the copy audit learns the photo copy, the photos e2e runs the whole journey, and the README catches up.

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
  construction; the script also proves it by scanning the first-load chunks for the viewer's marker.

**Files:**
- Create: `scripts/measure-first-load.mjs`, `scripts/measure-first-load.d.mts`, `scripts/first-load-base.json`
- Create: `tests/scripts/measure-first-load.test.ts`
- Create: `e2e/photos.spec.ts`, `e2e/photo-helpers.ts`
- Modify: `package.json` (script `budget`), `.github/workflows/ci.yml` (run it after `pnpm build`)
- Modify: `src/lib/copy-audit.test.ts`
- Modify: `e2e/helpers.ts` (`composeBreak` gains `photos`, `condition`; `axeViolations`, `ranBreak`, `signedIn` moved here), `e2e/layout.spec.ts` (imports them), `e2e/global-setup.ts` (new tables, empty the buckets, Storage probe)
- Modify: `README.md`, `docs/superpowers/plans/2026-10-14-plan-c-deferred-findings.md` (Budget section: the Turbopack base and this plan's figure)
- Test fixtures: `tests/fixtures/photos/lead-a.jpg`, `lead-b.jpg`, `lead-c.jpg` (Task 4's folder; created here only if absent)

**Interfaces:**
- Consumes: Task 8's `PhotoViewer` root `<dialog>` carrying `data-photo-viewer-root` (the marker; see "Contract changes"), the plate button named "Prize photos, N", the Prizes block (`h2` "Prizes"); Task 7's strip (an "Add photos" button, a file input, tiles with `data-testid="photo-tile"` whose menus offer "Make lead", "Tag", "Describe", "Move earlier", "Move later", "Remove", the "Edit photos" sheet); Task 5's notice sentences; Task 1's buckets script and Storage probe; Task 11's cleanup route and runbook; `setFlight`, `withDb` (`e2e/db.ts`).
- Produces:
  - `measureFirstLoad(o: { dist?: string; route?: string; forbid?: string[] }): { js: number; css: number; chunks: { file: string; gz: number; kind: "js" | "css" }[]; forbidden: { marker: string; file: string }[] }`
    (defaults `dist = ".next"`, `route = "/b/[id]"`); `checkAgainstBase(m: { js: number }, base: { js: number; allowanceJs: number }): { ok: boolean; over: number }`.
  - CLI: `node scripts/measure-first-load.mjs [--route "/b/[id]"] [--dist .next] [--forbid <marker>]… [--json] [--check] [--write-base <file> --commit <sha>]`; exit 1 on `--check` over the allowance or a forbidden marker found.
  - `scripts/first-load-base.json`: `{ route, commit, js, css, allowanceJs }`.
  - `e2e/photo-helpers.ts`: `addPhotos(page: Page, files: string[]): Promise<void>` (sets the strip's file input and waits until no tile shows "Finishing…" or a progress ring), `tileMenu(page: Page, index: number, item: "Make lead" | "Tag" | "Describe" | "Move earlier" | "Move later" | "Remove"): Promise<void>`, `describeTile(page, index, alt)`, `tagTile(page, index, place: "Top spot" | "2nd place" | string | "No tag")`, `PHOTO(name: string): string` (absolute path in `tests/fixtures/photos`).
  - `composeBreak(page, o)` gains `photos?: string[]` (attached after the price fields and before submitting) and `condition?: "New in box" | "New, opened" | "Used"` (default "New in box", required by Task 3's form).

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
  expect(checkAgainstBase({ js: 12_100 }, { js: 8_000, allowanceJs: 4_036 })).toEqual({ ok: false, over: 64 });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test tests/scripts/measure-first-load.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `scripts/measure-first-load.mjs` (with `.d.mts` types)**

Node only, no dependencies. Read the manifest with `vm.runInNewContext` (a sandbox `{ globalThis: {} }`-style object so the file's
`globalThis.__RSC_MANIFEST = …` fills it), take the single entry's `entryJSFiles` and `entryCSSFiles`. An entry key counts when it
is `[project]/src/app/<dir>/layout` or `[project]/src/app/<dir>/page` and `<dir>` is empty or a whole-segment prefix of the route's
directory (`b/[id]`); everything else (`error`, `global-error`, `loading`, `not-found`) does not. Add `rootMainFiles` and
`polyfillFiles` from `build-manifest.json`. Gzip each distinct file once with `zlib.gzipSync(buf, { level: 9 })`. The CLI runs only
when the file is the entry point (`import.meta.url` against `process.argv[1]`), prints `js`, `css` and the per-chunk table, and
with `--write-base` writes `{ route, commit, js, css, allowanceJs: 4036 }` to the given file.

The allowance, from the existing Mosaic §11 ruling: `/b/[id]` first-load JS may be 12 288 B gzip over the pre-Plan-C base; Plan C used
8 252 B of it (deferred findings, Budget), so 4 036 B remain over today's number, whatever method measures it. That remainder is the
photos allowance. The plate and the Prizes block are server-rendered and the viewer is lazy, so the expected growth is near zero; a
result above the allowance is a finding to fix by moving code out of the first load, not a number to raise.

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm test tests/scripts/measure-first-load.test.ts` Expected: PASS.

- [ ] **Step 5: Record the base on the commit this branch started from, before any photo code**

The script is not in that commit, so copy it in untracked:

```bash
export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH
BASE=$(git merge-base HEAD main)
git worktree add "$TMPDIR/base-build" "$BASE"
cp .env.local "$TMPDIR/base-build/" && cp scripts/measure-first-load.mjs "$TMPDIR/base-build/scripts/"
cd "$TMPDIR/base-build" && pnpm install --frozen-lockfile && pnpm build
node scripts/measure-first-load.mjs --json
node scripts/measure-first-load.mjs --write-base "$OLDPWD/scripts/first-load-base.json" --commit "$(git rev-parse --short HEAD)"
cd "$OLDPWD" && git worktree remove --force "$TMPDIR/base-build"
```

Run with the sandbox off (the build fetches Google Fonts; a build that cannot is BLOCKED: fonts). Expected: a JSON with `js` in the
region of 130 000 B (Plan C's own figure was 133 937 B under another method, so the two are not comparable; only this base is used
from now on) and a `scripts/first-load-base.json` naming `BASE`'s short sha. Sanity: `js` is over 50 000 and the chunk list contains
the layout and page chunks; if the list is empty the manifest layout changed and the script must be fixed, not the base.

- [ ] **Step 6: Wire `pnpm budget` and CI**

`package.json` script: `"budget": "node scripts/measure-first-load.mjs --check --forbid data-photo-viewer-root"`. In
`.github/workflows/ci.yml` add `- run: pnpm budget` after `- run: pnpm build`. Commit:

```bash
git add scripts/measure-first-load.mjs scripts/measure-first-load.d.mts scripts/first-load-base.json tests/scripts package.json .github/workflows/ci.yml
git commit -m "build: measure /b/[id] first-load JS under Turbopack and hold the allowance"
```

- [ ] **Step 7: Write the failing copy-audit tests**

In `src/lib/copy-audit.test.ts`, first widen `COPY_MODULE` so photo copy is read by the caps and state-word rules (add these
alternatives inside its group, before the closing `)`): `domain\/photos\/types|components\/photos\/(shrink|strip-state)|app\/photos\/actions|api\/photos\/finalise\/route`.
Any photo module whose file name contains `copy` is already forced into the list by the existing "keeps every copy module" test.
Add the new modules to that test's `known` list (each must exist). Then add a block:

```ts
const PHOTO_PATH = /(^|\/)photos?(\/|-)|photo[^/]*\.tsx?$/;
const RE_PHOTO = { verified: /\b(verified|authentic(?:ated)?|genuine|certified|guaranteed|proof|checked by)\b/i };
const photoSegs = segments.filter((g) => PHOTO_PATH.test(g.path));

describe("copy audit, photos (spec §10, §11)", () => {
  it("reads the photo modules at all (a guard against a path that silently matches nothing)", () => {
    expect(photoSegs.some((g) => g.text === "Lead photo replaced")).toBe(true);
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

Imports at the top of the file: `noticeFor`, `CONDITION_LABEL` from `@/domain/photos/types` and `defaultAlt` (the alt-text default
Task 7 owns: `defaultAlt(p: { itemName: string | null; title: string }): string`, in `src/components/photos/strip-state.ts`; if
Task 7 named it otherwise, import that). `RE` is declared after the existing first `describe`, so place this block after it.

- [ ] **Step 8: Run them to see them fail**

Run: `pnpm test src/lib/copy-audit.test.ts`
Expected: FAIL (the new modules are unlisted, or an unexported name). If it fails on a real sentence, change the sentence in its
module and say so in the report; do not loosen a rule.

- [ ] **Step 9: Make them pass**

Fix whatever the audit finds in photo copy (the strip's and finalise route's strings come from Tasks 6 and 7). Run: `pnpm test src/lib/copy-audit.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/copy-audit.test.ts
git commit -m "test(copy): audit photo copy, notice sentences and default alt text"
```

- [ ] **Step 11: The e2e plumbing**

- `e2e/global-setup.ts`: add `break_photos, photo_uploads, photo_notices_seen` to the `truncate` list (a missing table fails the run), empty the four buckets through the service role (`photoStorage().list` then `remove`, per `PREFIX` batch), and first probe Storage: on failure throw `Storage is not reachable at SUPABASE_URL. Start the local stack (pnpm supabase start) and create the buckets (README, "Photos and Storage").` The photos spec cannot be skipped: a missing Storage is a failed run, as a missing database is.
- `e2e/helpers.ts`: move `axeViolations` and `ranBreak` and `signedIn` out of `e2e/layout.spec.ts` unchanged (exported), and update that file's imports; extend `composeBreak` and add `e2e/photo-helpers.ts` as listed under Interfaces.
- Fixtures: if `tests/fixtures/photos/lead-a.jpg`, `lead-b.jpg` and `lead-c.jpg` do not exist, create three solid-colour 1200 × 900 JPEGs (well under 100 KB each) once with `sharp` and commit them.

Run: `pnpm exec tsc --noEmit` Expected: clean. Run `pnpm test:e2e e2e/layout.spec.ts` Expected: PASS (the move changed nothing).

- [ ] **Step 12: Write `e2e/photos.spec.ts`**

`test.describe.configure({ mode: "serial" })`, `const run = Date.now()`, users `ph${run}@e2e.test` (host), `pb${run}@e2e.test` (buyer), an anonymous context for strangers; every `signedIn` page through `loginAs`. Tests, each with the assertions listed (all UI is reached by role and name or by `photo-helpers`; spec §9 words are the names):

1. `"a host adds photos from the composer and opens the break; the photo shows on the feed card, the plate and the Prizes block, served from photos"`:
   `/host/new`, fill the form, `addPhotos(page, [lead-a, lead-b])`, `describeTile(0, "Chronos on a desk")`, `tagTile(0, "Top spot")`, open the break.
   - On `/breaks?host=ph${run}`: the break's `[data-testid="break-card"]` has exactly one `img`, `alt=""`, `src` containing `/storage/v1/object/public/photos/`, and the kit board (`thumb`) still renders with `data-tone` cells in the corner.
   - Card geometry: `card-media` contains both boxes; the plate and the corner board intersect; the intersection is at most a third of the plate's area; no card text moves between a card with and one without a photo (the title's left edge equals the left edge on a photo-less card of the same page).
   - On the break page: the button named `/Prize photos, 2/` is visible with its `img` `src` under `photos/`; the "Prizes" block shows the photo under "Top spot" with `alt="Chronos on a desk"`.
2. `"a prize's condition shows in the Prizes block"`: the Prizes block text contains "New in box" after the item name.
3. `"a draft's photo is not readable without the host's signed URL"`: compose a draft with one photo; read the strip tile's `img` `src` (a signed URL, contains `token=`); with `page.request`: that URL returns 200 and `image/webp`; the same object path under `/storage/v1/object/public/photos-draft/` returns a non-2xx, and under `/storage/v1/object/public/photos/` returns a non-2xx; an anonymous context cannot read the draft page (existing rule) and its HTML has no `photos-draft`.
4. `"the viewer works by keyboard and returns focus"` (Review Focus 5, part): focus the plate, `Enter` opens `getByRole("dialog")` at the lead; its caption matches `/Photo 1 of 2/`; `ArrowRight` moves to `/Photo 2 of 2/` and the polite live region says so; `Escape` closes it and `document.activeElement` is the plate button.
5. `"the viewer at the edges"` (Review Focus 5): a one-photo break: open the viewer; no "Previous" and no "Next" button; then at 320 × 640 and at 844 × 390 with the dialog open, `document.documentElement.scrollWidth <= window.innerWidth` and the `img` fits inside the viewport (`boundingBox` within it). The break page's layout case: the longest title the composer accepts (120 characters) and a 40-character handle with a plate, at 390 × 664 and 360 × 640: the plate is inside the title band (its right edge at most 16 px from the viewport edge), the media row below it is on one line, `legend` bottom is at or above the sticky bar's top at 390 × 664 (Mosaic §8 budget), and nothing scrolls sideways.
6. `"after a buyer claims, the host replaces the lead; the buyer sees the notice, on /me too, and the removed lead marked Removed; a stranger does not"`:
   buyer claims two lines (as `layout.spec.ts` does). Host: "Edit photos" sheet, `addPhotos([lead-c])`, `tileMenu(last, "Make lead")`, `tileMenu(1, "Remove")` on the old lead; the confirm shows exactly "Buyers in this break will still see this photo, marked Removed." and is accepted.
   - Buyer's break page (reloaded): the plate shows "Updated" and sits inside the first viewport (`y + height <= viewport height`); the Prizes block contains "Lead photo replaced" with a time; the old lead is in the Prizes block as a plate whose text matches `/Removed [A-Z][a-z]{2} \d{1,2}/`, its `img` `src` containing `token=` (a signed URL, never a public one).
   - Buyer's `/me`: the card's `my-photo-notice` contains "Lead photo replaced"; after the break page has rendered (the buyer opened it in the step above; `expect.poll` on a `/me` reload up to 5 s) the notice is gone and the plate (the new lead) is still there.
   - Stranger's break page: no "Removed" text, no `img` whose `src` contains `photo-archive` or `token=`, and the foot of the Prizes block says "Lead photo replaced".
7. `"removing the only photo after a claim: no plate, the feed falls back to the kit thumbnail, the notice says what was removed, and the buyer still sees it marked Removed"` (Review Focus 2): a break with one photo tagged "Top spot" and one buyer claim; the host removes it (with the confirm). Then: the break page has no button matching `/Prize photos/`; the feed card has no `img` and still has `thumb` at 96 px (`width:108px`); the buyer's Prizes block reads "Top-spot photo removed" and shows the Removed plate; the buyer's `/me` card shows "Top-spot photo removed" and no plate; the stranger sees neither the sentence's photo nor "Removed".
8. `"a draft's photos and tags survive a re-save that removes an 'or' alternative"`: a draft with prize "Chronos 22g", an "or" alternative "Phantom 24g", two photos tagged "Top spot" and to the alternative (`tagTile`); open the draft editor, remove the alternative, Save: still 2 tiles, the first tag reads "Top spot", the second reads "No tag"; the Describe text of both is unchanged.
9. `"Delete draft removes the draft's photos"`: a draft with a photo; note its object path from the strip `src`; Delete draft (confirm); the draft is gone from `/host`; the object path under `photos-draft` no longer resolves through the service role (`photoStorage().list` of its prefix is empty after the cron's cleanup is not needed: Delete draft removes them itself).
10. `"axe finds no WCAG 2.1 A or AA violation on every page the photos touch"`: with `axeViolations` on: `/`, `/breaks`, `/h/ph${run}`, a break page with the plate and Prizes block (anonymous and holder), the viewer open, the pay sheet with its plate (holder with an owed line), `/me` with the notice, `/host`, `/host/new` with two tiles and a tile menu open, the "Edit photos" sheet, and the result page of a `ranBreak` made with photos (anonymous and holder; the Prizes block under the full order). Expect `[]`.

Review Focus 2 and 5 are tests 7, 4, 5.

- [ ] **Step 13: Run the photos spec until it is green**

Run: `/usr/sbin/lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill; pnpm test:e2e e2e/photos.spec.ts` (sandbox off; local Storage up and the buckets created)
Expected: 10 passed. A failure that is a real product defect is fixed in the owning task's file and reported; the spec's selectors are changed only when the owning task named them differently.

- [ ] **Step 14: The budget after the plan, and the whole suite**

Run: `pnpm build && pnpm budget` (sandbox off)
Expected: prints the first-load JS and CSS, `js - base.js <= 4036`, exit 0, no forbidden marker (the viewer is not in the first load). If it is over: one round, move the cause out of the first load (a `next/dynamic` or a server-computed prop), rebuild and re-measure; if still over, record the figure and the largest chunks in the deferred findings and report it, as Plan C did. Then, in order: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm test:concurrency`, `pnpm test:ci`, `pnpm test:e2e` (full, on `breaks_e2e`).
Expected: all green, no flake tolerated.

- [ ] **Step 15: Commit the e2e**

```bash
git add e2e tests/fixtures/photos
git commit -m "test(e2e): the photos journey, axe on every touched page"
```

- [ ] **Step 16: README and the budget record**

`README.md`:
- "Local setup": after the `pnpm supabase start` line, say Storage runs with the stack (enabled in `supabase/config.toml`) and add a "Photos and Storage" subsection: create the four buckets with Task 1's buckets script (the exact `pnpm exec tsx scripts/<name>.ts` command and what it creates: `incoming` private 5 MB, `photos-draft` private, `photos` public `image/webp`, `photo-archive` private; no policies for `anon` or `authenticated`); it is idempotent and is also run once against production; the preflight now includes a Storage probe (Docker, every `supabase_*` container including Kong and Storage, auth health, Mailpit, then Storage); the e2e fails, not skips, when Storage or the buckets are missing and empties them before each run.
- sharp: a direct, pinned dependency for the finalise route (`/api/photos/finalise`, Node runtime); it ships native binaries, so after `pnpm install` on a new machine the build script must be approved (`pnpm approve-builds` or the repo's `onlyBuiltDependencies` entry, whichever Task 4 used); nothing outside that route and `src/photos/process.ts` imports it.
- The new cron: the daily photo cleanup route and schedule exactly as `vercel.json` names them (copy path and schedule from that file), what it removes (spec §5.6), that it is separate from the minute tick and needs `CRON_SECRET` like it, and a link to Task 11's runbook for `scripts/hide-photo.ts`.
- Scripts table: `pnpm budget` ("Measure `/b/[id]` first-load JS from the last build and fail past the allowance; run after `pnpm build`").
- UI conventions: one bullet on the plate (never the board's language; paper and board surfaces), and one on `e2e/photos.spec.ts`.

`docs/superpowers/plans/2026-10-14-plan-c-deferred-findings.md`, Budget section: add "Under Turbopack the Plan C measurement stopped working
(`app-build-manifest.json` is no longer written). `scripts/measure-first-load.mjs` reads the route's client-reference manifest and
the root files instead; on `<BASE sha>` it measures js `<N>`, css `<M>` (not comparable with the figures above). Plan D's allowance is
the 4 036 B left of the 12 288 B; after Plan D js is `<N2>` (`+<N2-N>` B)." filled with the real numbers.

Run: `pnpm lint` Expected: clean.

- [ ] **Step 17: Commit**

```bash
git add README.md docs/superpowers/plans/2026-10-14-plan-c-deferred-findings.md
git commit -m "docs: Storage, buckets, sharp, the photo cron and the first-load budget"
```

---

