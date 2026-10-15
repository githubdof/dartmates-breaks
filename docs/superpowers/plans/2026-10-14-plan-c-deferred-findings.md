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

- The Mosaic spec §7 keyframe list named ten keyframes with `press` among them; the implementation uses eleven (adds `squash-throw`, offsets 36.36 % against `squash`'s 40 %) and does press as a transform transition. Spec §7 amended in place.
- The Replay/Skip row sits above the headline on the result page; §8 lists "full order, Replay, Share, Skip".
- `FEED_SORTS` still contains the dead "filling" sort.
- The OG route loads winner handles and item names it never uses, and a missing font gives an uncaught 500.
- The flight picker's cells are about 43.6/44.6 px rather than 44.75 (no board bleed), and the focus ring is painted over by the next cell.
- The kit thumbnail's cells inline their own 1 px steel wire instead of the `.thumb-frame > .bc` rule.
- `stalledSince` ignores breaks stuck in `drawing`.
- A give-back that throws keeps its numbers recorded (deliberate, bounded to the buyer's own lines).
- Replay is a silent no-op under reduced motion (spec-conformant, no feedback).
- The result route has no axe coverage yet (Task 20 adds it).
- Mosaic §10 wording on prize places aligned with `placesOf` (a list that need not be contiguous, lowest place first, top spot last); amended in place.

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
  - Reach of the rules: the caps, heat, streak, level, winnings and "his" rules read all `.ts` and `.tsx` copy; the caps rule reads only `.tsx` and the copy modules (`*-copy.ts`, `share-text`, `claim-bar-state`, `reveal-plan`, `board-moments`, `selection`, `status-word`, `domain/breaks/og.ts`), so a new copy module with another name must be added to `COPY_MODULE`. Word text beside a JSX expression is read ("Drawing {n} lines"); copy assembled from a variable (`{label}`) is read where the variable is defined.

### Render tests (Task 18)
- `MyBreakCard`'s error, offline and disabled states (Plan B test backlog) need a click and a failed server action;
  `react-dom/server` renders only the first state. They need an interaction test (jsdom and Testing Library, or a
  Playwright component test), which this plan does not add. Covered today: owing, paid, ran with unsent lines, the
  flight and the steel wire, the history row; the e2e covers the sent failure on `/me` (`layout.spec.ts`).

### Axe (Task 20)

### E2E (Task 20)

## Budget (Mosaic §11, Task 20)

## Open bug reports (not yet reproduced)

- **Safari, pay sheet mini cells:** carried from Plans A and B; `MiniCells` keeps the first design's cell (moved
  verbatim to `PaperCell` in Task 7), so re-check when the owner next sees it.
