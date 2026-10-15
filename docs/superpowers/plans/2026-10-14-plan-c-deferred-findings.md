# Plan C (Mosaic): deferred findings and pre-deploy notes

Task 19 formalises and extends this file.

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
