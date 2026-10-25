# Plan C (Mosaic): deferred findings and pre-deploy notes

Plan: `2026-10-14-plan-c-mosaic.md`. Spec: `../specs/2026-10-14-mosaic-ui-design.md`, with
`../specs/2026-10-13-dart-breaks-platform-design.md`. Every task was reviewed; what follows was deliberately
deferred or recorded under the one-round fix-loop rule (recorded ruling 8).

## Notes for the deployment plan (there is no deployment yet)

1. **Migration 0004, then the backfill.** Migrations belong to the future deploy pipeline (a migrate-before-deploy
   CI job). When it exists, it applies `0004_flights_kits` before the deploy, then `scripts/verify-draws.ts` runs
   once with `DATABASE_URL` set to the hosted database so existing draws get `draws.verified_at`.
2. **Fonts.** Five font files reach browsers; Big Shoulders is one variable file, not preloaded, fetched where its
   text first renders (the wall routes). The OG route reads three static TTFs from disk: they must ship with the
   deployment bundle.
3. **`/dev/components`** opens in a production build only when `E2E_SECRET` is set (the e2e density check);
   `assertDeployEnv` refuses `E2E_SECRET` on Vercel.

## For the next plans

### Game-structure plan
- Show mine (Mosaic §13): the "You have ..." line becomes the `aria-pressed` toggle with the house-lights overlay.

### Reputation plan
- Levels, tiers, streaks, trophies and win counts stay out until it lands (Mosaic §9).

### Smaller items, any plan
- The domain's `filling` sort and `FeedBreak.paidLastDay` are unused since Task 15a (the chips are Newest and
  Closest to full): drop them with their `feed.test.ts` case.

## Parked findings

- The Mosaic spec §7 keyframe list named ten keyframes with `press` among them; the implementation uses eleven (adds `squash-throw`, offsets 36.36 % against `squash`'s 40 %, and `fadeout`, the paid ghost's step-end fade) and does press as a transform transition. Spec §7 amended in place, both named.
- `FEED_SORTS` still contains the dead "filling" sort.
- The kit thumbnail's cells inline their own 1 px steel wire instead of the `.thumb-frame > .bc` rule. Left in the fix wave: the rule needs the `bc` class, which also brings `contain: paint` and `container-type: inline-size` to the thumbnail cells, so it does not apply cleanly.
- `stalledSince` ignores breaks stuck in `drawing`.
- A give-back that throws keeps its numbers recorded (deliberate, bounded to the buyer's own lines).
- Replay is a silent no-op under reduced motion (spec-conformant, no feedback).
- The result route had no axe coverage; Task 20 added it (anonymous and holder, reduced motion, the reveal at its end): no violation.
- Mosaic §10 wording on prize places aligned with `placesOf` (a list that need not be contiguous, lowest place first, top spot last); amended in place.

### Recorded by the fix wave (whole-branch review), not fixed

- The host record's "draws verified" counts a fake-beacon draw, which verifies locally. Test-only: `BEACON=fake` is refused on every deploy (`assertDeployEnv`, and `beacon.ts` on Vercel), so a production database gets one only if test data is copied into it.
- A winning bonus line sits after line N in the landing hero's thumbnail (`kitThumbCells` keeps a placed bonus line), with no "Bonus" row as on the board.
- The thumbnail's top spot under 16 px cells still waits for the single-ring spec ruling proposed under E2E (Task 20) below.
- The tautological `ENDED` test in `reveal-clock.test.ts` stays (it pins the constant, not the hook's use of it); `FINAL` is gone, the hook reads `ENDED`.
- The copy audit's remaining gaps: JSX prose after a `;` followed by an uppercase word or a line break is dropped; the "0" token for an interpolation could read "{handle} wins line {n}" as a win total; hex entities other than `&#x27;` (such as `&#x2019;`) are not decoded, and in JSX text one ends the segment it sits in.
- The flight picker keeps eight columns at 360, so its cells are 41 px there (44.75 at 390, as §8 states); the 44 pt floor holds at 390 only.
- The size pass on `/b/[id]` first-load JS (see Budget below).
- After Skip, focus moves to Replay with `preventScroll: true` (Mosaic §7 "focus moves to Replay"); Replay now sits under the full order, so on a 50-line board a keyboard user's focus lands about 2,000 px off-screen. Fix: let Skip's focus scroll and keep `preventScroll` only for the reveal's natural end (`reveal.tsx`).
- "Only N lines are open." in `src/domain/lines/commands.ts` is a count outside the "N to go" form and outside the copy audit's reach; needs a copy ruling against Mosaic §9.

## Fix-loop records (one round, then record)

### Copy audit (Task 17)

The audit now reads copy (string literals and JSX text, comments removed, `${…}` blanked), not code. The sweep over all UI copy
(the caller banner set, the reveal text, the result page, the host record, the feed and landing copy, the OG captions, the pay
sheet, the account pickers, `/host/new`, `/me`, the moment announcements, the "N to go" and "You have …" lines) found one real
hit and changed copy once; nothing else needed a decision.

- Reworded or removed: `src/components/break/frame-copy.ts`: `leftText` ("N of M left", the retired count): unused in the UI, deleted with its test line.
- Allowlisted (4, each with its reason in `ALLOW`): `src/lib/share-text.ts` "CLOSED" (the community's caps idiom); `src/components/handle-field.tsx` and `handle-field-copy.ts` "NFKC" (a Unicode normalisation form); `src/app/landing-copy.ts` and `src/domain/breaks/og.ts` "en-US" (an `Intl` locale tag); `src/app/legal/draw/page.tsx` "SHA-256", "HMAC" (algorithm names).
- Recorded, not changed:
  - `src/domain/breaks/feed.ts`: `FEED_SORTS` still contains "filling": a dead sort the UI no longer offers; dead code, left as is until a ruling.
  - `src/components/break/claim-bar-state.ts:39,41` and `src/domain/errors.ts:28,29`: "You can hold N in this break." and "Hosts can hold N in their own break.": the limit messages use "hold" where the spec's holding line says "You have …". The retired phrase is "You hold …", which these do not match; rewording them touches domain error tests and Task 16 files, so it needs a ruling.
  - The caller copy set has no handle-less call, by design.
  - Reach of the rules: the caps, heat, streak, level, winnings and "his" rules read all `.ts` and `.tsx` copy; the caps rule reads only `.tsx` and the copy modules (`*-copy.ts`, `share-text`, `claim-bar-state`, `reveal-plan`, `board-moments`, `selection`, `status-word`, `domain/breaks/og.ts`), so a new copy module with another name must be added to `COPY_MODULE`. Since the fix wave, the "N to go" (retired counts, "N spots left" included) and state-word literal rules read the copy modules too, share text among them. Word text beside a JSX expression is read ("Drawing {n} lines"); copy assembled from a variable (`{label}`) is read where the variable is defined.

### Render tests (Task 18)
- `MyBreakCard`'s error, offline and disabled states (Plan B test backlog) need a click and a failed server action;
  `react-dom/server` renders only the first state. They need an interaction test (jsdom and Testing Library, or a
  Playwright component test), which this plan does not add. Covered today: owing, paid, ran with unsent lines, the
  flight and the steel wire, the history row; the e2e covers the sent failure on `/me` (`layout.spec.ts`).

### Axe (Task 20)

- None.

### E2E (Task 20)

- `src/components/kit-thumb.tsx`, against recorded ruling 20 (the thumbnail disc at 48 %): on the feed card (12 px
  cells) and the landing hero (14 px) the top spot's 48 % disc was filled entirely by its 3 px double ring (cream
  centre measured 0 px). Stopgap in Task 20: the disc is 64 % below 16 px cells (`discPercent`), a cream centre of
  1.7 and 3 px, pinned by `kit-thumb.test.ts` and the density e2e. A 1.7 px cream dot inside a 3 px double ring still
  does not read as a double ring at 1× on feed cards. Proposed spec ruling: under 16 px cells the top spot is a single
  2 px red ring (the thumbnail is `aria-hidden` and the card carries the text), and the stopgap goes.

## Budget (Mosaic §11, Task 20)

- before: css 8620, js 125685; after: css 11628, js 133937; +3008 B CSS, +8252 B JS
- JS over the 2048 B limit by 6204 B (gzip, first-load JS of `/b/[id]`, base 42fbdd3 against 3e75b77). Where it went:
  two new shared chunks, the Mosaic cell (`Cell`, `cellLabel`, the flight colours and shapes; 3136 B) and the board
  (`Grid`, `cellMoments`, `boardMoments`, `lampLayer`, the layout tiers; 3458 B); the page chunk +1236 B (the island's
  moments wiring, the caller banner, "This is your flight"); +418 B in the shared UI chunk. No unused code, duplicate or
  server-only import was found in these chunks (no contrast maths, no OG or reveal code on the break page), so no local
  fix fits one round without removing spec'd behaviour. Ruling: the +8252 B is accepted and the size pass is deferred.
  The allowance is amended: Mosaic §11 now allows `/b/[id]` first-load JS 12 KB (12 288 B gzip) more than the base,
  the measured figure plus headroom (fix wave). Its candidates:
  - lazy-load the moment layers and the caller banner (`next/dynamic` on the first moment; nothing plays on load), without
    delaying the drop that lands from whichever render comes first;
  - keep the flight glyphs and the colour table out of the kit view (strangers, most first loads, never draw a flight);
  - compute `lampLayer` and the layout tiers on the server and pass them as props.
- Under Turbopack the Plan C measurement stopped working (`app-build-manifest.json` is no longer written).
  `scripts/measure-first-load.mjs` reads the route's client-reference manifest and the root files instead; on `ba809fd`
  it measures js 203120, css 12268 (not comparable with the figures above). Plan D's allowance is the 4 036 B left of the
  12 288 B; after Plan D js is 206803 (+3683 B), css 12571 (+303 B), 353 B inside the allowance. The absolute figure
  includes the polyfill file, which modern browsers skip as `noModule`; the delta is unaffected. Plan D first measured
  214952 B (+11832 B, 7796 B over): the host-only photo strip (upload, shrink and removal-queue code, a 13530 B gzip
  chunk) was statically imported by `EditPhotosSheet`, so every visitor downloaded it. It now loads with `next/dynamic`
  (`ssr: false`) when the host first opens the sheet; the viewer was already on demand. What stays in the page's first
  load is the photo code that renders for everyone (`Plate`, `PrizesBlock`, the viewer button) and `NoticeSeen`
  (about +3.7 KB together); the largest chunks are the framework and shared UI chunks (71805, 46238, 39520 B gzip),
  then a 18751 B page chunk. The margin is thin: the next photo feature on this page should lazy-load first.

## Open bug reports (not yet reproduced)

- **Safari, pay sheet mini cells:** carried from Plans A and B; `MiniCells` keeps the first design's cell (moved
  verbatim to `PaperCell` in Task 7), so re-check when the owner next sees it.
