# Plan D (photos): deferred findings

Plan D was executed subagent-driven. Every task was reviewed, and a whole-branch review closed with "mergeable" after one
fix wave (I1–I6). Nothing below blocks the merge. These items are the follow-ups, most useful first.

## Before the first deployment

- **Vercel settings.** sharp runs in two functions:
  - `/api/photos/finalise` does one decode of up to 12 MP at `sharp.concurrency(1)`.
  - `/b/[id]/og` does a small transcode of the 640 px variant.

  Under Fluid compute a per-function `memory` key is not honoured, so `vercel.json` has none. `/api/photos/cleanup`
  declares `maxDuration = 300`. Check the project's memory and duration settings in the dashboard.
- **OG transcode parity.** `src/app/b/[id]/og/photo.ts` does not set `sharp.concurrency(1)` and `cache(false)` the way
  `src/photos/process.ts` does. Set them there too.
- **Open race residual.** A refused open (a photo finished between its copy and its lock) that races a committing open
  within one Storage listing can lose both copies of that photo. The runbook names it. To close it, leave the draft
  originals to the daily orphans rule instead of deleting them on success (`src/photos/publish.ts`).
- **Production Postgres must be 15+**, because migration 0005 uses `on delete set null (col)`.

## Behaviour worth fixing

- A retry after a committed finalise uploads a duplicate photo: the client asks for a new grant. On a 5xx, retry the
  finalise with the same grant first (`upload-client.ts`, `finalise/route.ts`).
- Grants of failed uploads count against the 8 for 5 minutes, so a retried 8th photo is refused with the cap message.
  Delete the grant on a definitive refusal.
- `deleteDraft` deletes hidden photo rows and their `photo-archive` copy, which loses a moderation copy.
- A failed lazy-strip chunk load reaches the break page's error boundary. Add a small boundary inside the sheet.
- Browser Back from the composer during an upload aborts it with no prompt; App Router Back fires no `beforeunload`.
  A same-tab external link prompts twice.
- If an upload fails while Save or Open is waiting, the press is dropped with no message. It also compares the
  overall failed count, not the count at press time (`src/app/host/new/form.tsx`).
- `firedThisPageView` outlives a page view in a single-page-app session. Key it by `breakId + notice.iso`.
- The title plate is `loading="lazy"` above the fold. Make the 64 px title plate eager.
- The viewer's observer is not re-attached when the photo set changes at the same count.
- `aria-busy` on viewer plates is shared by every plate.
- Two quick reorders can roll back to a stale order if the first fails after the second succeeds (`saveOrder`).
- `savedSlots` only grows, so a saved prize later blanked stays marked saved.
- A flushed removal that fails after the sheet closes is silent.
- Photo cards lose the corner board's heat glow: all of it lay outside the clipped box. This is consistent with §8.0
  (never tint the image), but it is a design call.
- The cleanup's time budget is checked per batch, not per prefix. Its re-read-to-remove window could be narrowed with
  an age re-check on a listing taken after the re-read.
- A link preview can take up to about 10 s on a slow photo (2 s fetch plus up to 8 s transcode), as specified.

## Performance and size

- `/b/[id]` first-load JS is 206,802 B gzip against a limit of 207,156 B (base `ba809fd`: 203,120 B), leaving 354 B.
  `EditPhotosSheet` and `NoticeSeen` are still static client imports on the page; making them lazy would recover a few
  hundred bytes.
- `/me` runs one `breakPhotos` per current break; batch it when `/me` grows.
- `finishClaim` writes `breaks` on every claim; add `and first_claimed_at is null`.
- The host's draft rows are signed three times per page render.

## Code and test hygiene

- Several tests were written alongside the code, with no recorded RED: the strip-state modules, lead-srcs, the viewer
  unit tests, and the I6 flake fixes (intermittent by nature; each passed 10 of 10).
- Storage fake: it does not enforce bucket size and MIME limits, and a direct `files.set` over a key keeps the old date.
  The contract suite's 1.1 s sleep also runs on the fake.
- `timedFetch` replaces a `Request`'s own signal. `list()` can yield an Invalid Date when both timestamps are null.
- The guard raises "frozen" for an unknown break instead of an FK error.
- `src/domain/photos/test-helpers.ts` imports from `tests/helpers`.
- The per-user advisory-lock SQL is duplicated between photos and lines.
- e2e helpers:
  - `tagTile` reads the composer's title input and ignores "or" alternatives.
  - The slot poll checks for a non-null slot rather than the exact slot.
  - One selector uses an XPath `following-sibling`.
  - `composeBreakWithPhotos` duplicates `composeBreak`'s fill lines.
- `scripts/measure-first-load.mjs`:
  - `realpathSync` throws when `argv[1]` is not a file.
  - A value starting with `--` can't be passed.
  - `--write-base ""` skips silently.
  - No tests cover `--html-url` on a non-ok response, or the symlink path.
- The OG preview infers "ran" from won cells: a drawn break with no visible places gets the 200 px plate. This is
  harmless.

Minis' photos (spec decision 13) are deferred until minis exist.
