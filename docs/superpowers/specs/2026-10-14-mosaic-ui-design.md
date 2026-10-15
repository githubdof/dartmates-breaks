# Breaks UI, second design: "Mosaic"

Status: draft for the owner's review (2026-10-14), revised after the three-lens spec review
(`.superpowers/design/spec-review-play.md`, `spec-review-visual.md`, `spec-review-product.md`) and the
controller's rulings (`.superpowers/design/spec-edit-rulings.md`). Supersedes the visual direction of
`2026-10-13-ui-design.md` ("the grid is the dartboard numbers ring laid flat", paper and ink). Everything in
that document that is not contradicted here still stands: the shell, the sheets as native dialogs, the claim
bar's behaviour, the ledger, the copy rules in its §6, the accessibility floor in its §7, the 50-line budget.
§1.1 lists every part of it this design replaces. Platform rules: `2026-10-13-dart-breaks-platform-design.md`
(gambling-neutral copy, hosts carry legal responsibility, holders never reach anonymous viewers).

Prototype the owner approved: `mockups/2026-10-14-mosaic-board.html` (open it in a browser; it is the
interactive board at 390 px with the claim, tick, draw and stranger-view demos). Panel reports (git-ignored
scratch): `.superpowers/design/panel2-play.md`, `panel2-visual.md`, `panel2-product.md`; the earlier
direction verdict `.superpowers/design/2026-10-14-panel-verdict.md`.

## 1. Why a second design

The owner used the shipped UI and found it quiet to the point of reading as a spreadsheet: "Something like
this should almost be game like." Asked what was missing, they chose all three of feel of play (leading),
visual world, and game structure. A panel ranked three directions and refined the winner; the owner then
asked for colour that goes beyond a palette, and chose **Mosaic**: colour comes from people and from
progress, not from a theme.

### 1.1 What this replaces in the first design

Each row names the first design's text and what stands now. Anything not listed carries over unchanged.

| First design | This design |
|---|---|
| §3 Colour: `paper`, `card`, `ink`, `ink-2`, `wire-*`, `green`, `red` | Unchanged in value and use on paper surfaces. The board gets new tokens with new names (§4); no existing token changes value. |
| §3 "Green means exactly two things: my lines and confirmed money" | Stands on paper. On the board, "mine" is the inner ring, green marks 2nd and 3rd place rings only, and red marks the top-spot ring and, in host view, the overdue edge. Flight faces are never red or green (§3). |
| §3 Type: titles and display in Barlow Condensed 26/28 and 34/36 | On wall routes, titles, the caller banner, the checkout count and the result display are Big Shoulders Display 800 (§4 type table). Paper surfaces keep the first design's type, except the checkout count in the break page's bar. |
| §3 "No caps labels" | Stands. The won cell carries no place word at all; its ring carries the place (§5). |
| §3 Motion ("Two moments only", "120 ms fill", "the top spot's card lifts and turns green") | Replaced in full by §7. Carried over and restated there: reduced motion, Skip, Replay once per viewer, the `aria-hidden` deal layer, the result in the DOM first. |
| §4 Cells share 1 px `wire-strong` borders | On wall boards `--board-steel` is the wire. Paper surfaces keep `wire-strong`. `columnsFor` and the cell sizes are unchanged (§5). |
| §4 States table (paid = ink face; sent = 2 px dashed edge; mine = 10 pt corner flag; selected = 3 px inset and check; overdue = red 2 px border and "!"; reserved = double rule and "m"; bonus = ink face and "+") | Replaced row by row by §5: paid is the holder's colour; the dashed sent edge is retired; the two-tone ring replaces the flag; brackets replace the inset and check; overdue keeps the red edge and "!" on the Mosaic face; reserved keeps the double rule and "m"; the bonus ink face and "+" are retired (black now means won). |
| §4 Struck line (red line-through) | Kept as the sniped state, drawn in ink (§5, §7). |
| §4 Legend: five swatches with words | Member and kit legends drawn as mini cells (§5). "You have 4, 11 and 27." stays under the legend and becomes the Show mine toggle. |
| §4 Grid group label "Lines, 19 of 50 open" | "Lines, 12 to go" (§5 accessibility). |
| §5.2 Landing hero "fully black with the one green winning cell" | The kit board of the most recent ran break with its black bull cells, on the wall (§8). Caption unchanged. |
| §5.3 Feed sort chips "Newest, Filling fast, Almost full"; card "19 of 50 left" with the fill bar | Chips "Newest" and "Closest to full" (fewest open lines first, today's `almost` sort); "Filling fast" and "Almost full" are retired. Cards sit on the wall with "12 to go"; the fill bar is dropped because the framed thumbnail is the fill (§8). |
| §5.4 Media row "19 of 50 left" and the pixel budget | The media row reads "50 lines, $5 a line"; the count is "12 to go" in the claim bar; the budget is the §8 table. The bar never shows "You hold …". |
| §4 Taken: "ink-2 on a small card chip" | Ink on the cream chip (§5). |
| §4 Overdue "!" bottom-right | The "!" takes the glyph's place top-right and the overdue cell shows no flight (§5). |
| §4 Selected "ink, weight 600" and check glyph | Brackets (§5); the number keeps weight 600. |
| §5.4 Media row thumbnail, "Pay within 24 hours." line with host and trust line, status pill beside the count | No thumbnail while there are no photos; "Hosted by @jim" with the swatch on the media row; "Pay within 24 hours." moves to the claim sheet; the status pill sits beside the checkout count in the bar (§8). |
| §5.5 Ledger header "19 of 50 paid" | Unchanged; it counts paid lines, not open ones, so "N to go" does not replace it. |
| §5.5 Ledger | Unchanged: paper, ink and hatch mini cells, no flight, no kit, no glyph. The ledger header gains the host record (§9). |
| §5.7 Result: "the winning line as one large green cell"; "JavaScript then plays the deal once (§3 motion)" | "Top spot: line 7" in display type above the winner's handle, the board in the viewer's view with the black bull cells, and the full order; JavaScript then plays the reveal once (§7). |
| §5.8 `/me` "my cells" | Your own lines only, drawn as on the board in your flight (§8). No other holder's data, no heat. |
| §5.9 Host profile | Gains the host record and the kit (§8, §9). |
| §6 Feed sort "Almost full"; preview caption "19 of 50 left, $5 a line" | Sort "Closest to full"; caption "12 to go, $5 a line" (§6). The count everywhere is "N to go". |
| §7 Focus ring "2 px green at 2 px offset, everywhere" | On the board, the ink and cream double ring (§5); elsewhere as the first design. The 44 pt tap target holds (cells 44.75 px at 390). |

Binding text elsewhere that this design amends (the amendments are written by §12 task 19):

- Plan B Global Constraints, holders: "Holders, flights and the overdue flag are decided only in `shapeGrid`";
  the `feedThumbs` line gains "and no flight"; the link-preview line is rewritten as below.
- Plan B Global Constraints, green: "Green keeps its two meanings on paper: mine, and money the host
  confirmed. On the board, mine is the inner ring; green marks 2nd and 3rd place rings; red marks the
  top-spot ring and the host-view overdue edge. Flight faces are never red or green."
- Plan B Global Constraints, fonts: `fonts.ts` adds Big Shoulders Display 800; the BLOCKED: fonts rule applies
  to it.
- Plan B Global Constraints, host profile: the public data gains the host record counts (§9) and the kit.
- Plan B Global Constraints, motion: "No animation library. Per-cell motion is CSS on `transform` and `opacity`
  (Mosaic §7); the one JS tween is the reveal's dart path (`requestAnimationFrame`). Honours
  `prefers-reduced-motion`."
- Plan B Global Constraints, selected: "Selected cells show the four corner brackets (Mosaic §5), number at weight
  600; 700 is not loaded."
- Plan B Global Constraints, link preview: "`ogModel(page, now)` emits per cell only number, tone and, on won cells,
  place, plus the break's `kit` and `heat`; no holder, handle or flight (pinned by `og.test.ts`)."
- Platform spec §9 stall copy: shown as the first design's "Closed 3 days ago, not drawn yet." (no em-dash, no
  "Filled").

## 2. The one memorable element

**When you join a break, the board fills with the flights of the people in it.** Every line you hold carries
your flight. A claimed line shows the holder's flight on cream; when the host ticks it paid, the line floods
with the holder's colour. An empty board is cream and quiet; a full board is a crowd, inside the host's kit,
under a lamp that comes all the way up when the last line is paid. The picture of a filled break is
different every time.

Everyone else (anyone not holding a line in that break) sees the board fill in the host's kit: claimed lines
hatched with a band of the kit's light colour, paid lines in the kit's dark colour, inside the kit's surround.

What gets quieter so this can carry the page: the wall is neutral near-black; the wire is steel; there is
no texture, no sheen, no title underline; the ledger, sheets, forms, `/host` and the claim bar stay on
today's bright paper with no new motion beyond the count's text swap.

## 3. Rules the design carries

- **Play borrows from darts as a sport**: the board, the flight, the throw, the caller, the checkout
  countdown, league records. **Nothing comes from games of chance**: no wheels, reels, flips, scratches,
  near misses, confetti, sound, vibration, flashing, odds, "1 in N", gold, levels, streaks, win totals, "You
  won!". The draw is an audited record being read out, then thrown.
- **Nothing travels across the cells.** No sweep, ripple, chase or sequential highlight, at any time. During
  the reveal only the targeted cell changes. The exceptions are the uniform dim at set-up and the uniform
  lift at the end, which are one class on the board.
- **The winner's colour stays in its cell and the banner.** The board never floods with it, and the kit and
  frame never change for a result.
- **Flights and kits are a fixed free set.** All 32 flights and all 15 kits are open to every member and
  host from day one. None is earned, unlocked, rare, seasonal, bought, tied to Pro or given for winning or
  for volume, and a kit is never tied to a host's results. Flights are glyphs in square cells, never round
  tokens, never stacked or counted ("6 flights in"). The won disc is the one circle on the board, and it is
  the bull. Copy says "This is your flight"; never "lucky colour".
- **Counts are text swaps.** "12 to go" changes digit for digit. It is never rolled like an odometer, and no
  count or "last lines" prompt ever pulses.
- **Heat has no name.** The words hot, heat, warm, fire, cold, streak, on fire and filling fast never appear
  in UI copy, alt text, share text or feed sorts. Heat is never per viewer, never on `/me`, and is frozen
  from Closed on (§4).
- **Kits carry no betting words**: never "back", "favourite" or "pick your side" near a kit.
- **Flights are holder data.** They reach only the viewers who already see holders (§6), and no surface ever
  puts a flight beside a handle in text, with the one member-view exception in §6.
- **Shape first.** Every state is told apart without colour (§5). On the board the face only adds hue; the
  hatch, the glyph, the ring and the marks carry state. The wire never carries state.
- **Animate on change, never on mount.** Moments come from a pure `cellMoments(prev, next)` over the same
  viewer's previous and next `GridCell`s. Refresh, back navigation, first paint, a change of view (kit view
  ↔ member view, §6) and a change in the line count (a bonus line added) show the final state still. Any
  transition not listed in §7 sets still. A refresh that arrives mid-animation snaps that cell to its new
  final state. State is set before any animation starts; no animation ever holds up an input; the host
  never waits for motion (Paid answers on pointerup, before the network).
- **Records, not rewards.** A checkout count, a host record, a plain history. Levels, tiers, streaks,
  trophies and win counts are out of this design and gated on the reputation plan.
- **"Won" and "wins" stay** (the community's words). Banned: "winnings", "jackpot", win rates, odds,
  celebrations. The caller says "takes the top spot" because that is what a caller says. These bans, the heat
  words, "You won", streak, level, "lucky colour" and caps chips are enforced by `src/lib/copy-audit.test.ts`
  (§12 task 17).

## 4. Tokens

Board tokens are new names. No existing token in `tokens.css` changes value. Each new token is mapped in
`@theme inline` and pinned in `tokens.test.ts`. Every hex below appears in this document only here; other
sections name the token.

### Surfaces and ink

| Token | Value | Role |
|---|---|---|
| `--board-wall` | `#17161A` | The page behind the board on wall routes (§8); `theme-color` there |
| `--board-wall-2` | `#221F26` | Empty slots in the board's last row, deal chips |
| `--board-cream` | `#FBF7EE` | Open cell face; the bull disc; number chips; the glint |
| `--board-cream-2` | `#EEE8DA` | Reserved-for-mini face |
| `--board-ink` | `#15130F` | Numbers on cream and on light faces; keylines; the "yours" ring; the board focus ring |
| `--board-ink-2` | `#5A5246` | Reserved-for-mini number on `--board-cream-2` (6.3:1); the hatch at 35 % |
| `--board-steel` | `#7A7D84` | Wire between cells and the innermost 1 px of the frame (4.4:1 on the wall, 3.9:1 on cream) |
| `--board-ring` | `#0F0E0C` | The 6 px numbers ring of the frame; the won cell's face |
| `--board-text` | `var(--board-cream)` | Titles and body text on the wall (16.8:1) |
| `--board-text-2` | `#D4CEC3` | Captions on the wall (11.5:1) |
| `--board-text-3` | `#B3ADA3` | Meta on the wall, "Hosted by" (8.1:1) |
| `--paper` / `--card` / `--ink` / `--ink-2` | `#F6F5F1` / `#FFFFFF` / `#000000` / `#5C5A55` | Work surfaces, unchanged (first design §3) |
| `--red` / `--green` | `#C8102E` / `#1E7A4C` | Unchanged values. On the board: `--red` the top-spot ring and the host-view overdue edge; `--green` the 2nd and 3rd place rings. On paper: the first design's rules. Red ring on the cream disc 5.5:1, green 5.0:1. |

### The flight set: eight colours in two tiers, four dart shapes (32 flights)

| Tier | Name | Face | Number ink | Contrast at 18 px / 600 |
|---|---|---|---|---|
| Dark | Petrol | `#0B5E7A` | `--board-cream` | 6.8:1 |
| Dark | Blue | `#2340C4` | `--board-cream` | 7.6:1 |
| Dark | Plum | `#82195F` | `--board-cream` | 8.7:1 |
| Light | Yellow | `#F7C51B` | `--board-ink` | 11.5:1 |
| Light | Orange | `#F5913A` | `--board-ink` | 8.0:1 |
| Light | Lime | `#AED445` | `--board-ink` | 10.9:1 |
| Light | Sky | `#7CC4EE` | `--board-ink` | 9.7:1 |
| Light | Pink | `#F4A0C4` | `--board-ink` | 9.4:1 |

Ink rule: cream numbers on faces with luminance below 0.186, ink above; any colour whose better ink falls
under 5.0:1 is excluded. Excluded on purpose: red and bottle-green faces (they clash with the board's own
ring rule: red and green appear only as rings and marks); black and near-black (the numbers ring, the won
face); cream and beige (the open face); greys (read as disabled); browns (read as sisal); every mid tone
between luminance 0.15 and 0.24; board red `#E8102E` and `#16A34A` with white numbers; gold and metallic
tones (casino); neon tones (glow on the wall). No face patterns: stripes and dots are gone (dots read as
bingo). A dark-tier glyph on the wall is under 3:1, so any glyph drawn on the wall carries a cream keyline.

Shapes. Each glyph is one silhouette in a 16 × 16 box, with aspect ratios spaced so they survive blur:
**standard** 15 × 11 (wide, shallow notch at the top, ratio 1.36), **pear** 13 × 13 (teardrop, round top,
1.0), **kite** 10 × 15 (diamond, 0.67), **slim** 6 × 15 (0.40). "Glyph size" is the box size. Strokes use
`vector-effect: non-scaling-stroke`, so the 1.25 px keyline stays 1.25 px at every size, and the outlined
glyph (yours, not sent) uses a 2 px ink stroke at every size. One SVG sprite, `<use>`. Glyph sizes by cell
size are in §5.

Pairs to watch under colour-blind simulation: yellow/lime and petrol/plum. The shape axis covers them; §5
adds a per-break collision rule.

Default flight: every member has a stored flight from the start. The `users` row draws a random flight from
the 32 when it is created, on the server, so a board is varied before anyone has chosen; migration 0004
backfills existing members the same way (§10). The default is never derived from the user id: owner ids and
handles are public on every result page, so a hash would publish everyone's flight. Members change it on
`/account` ("Your flight"); a change applies everywhere at once (a flight is identity, not per break). The
palette may grow but never reorders or renames a stored key.

### The host kit

One colour from the dark tier and one from the light tier (3 × 5 = 15 kits). The kit is the board's
**surround**, like the rubber surrounds pubs fit around a board. The frame is one `box-shadow` stack, 12 px in
all, spread into the page gutter so the grid keeps its full width (§5):

```css
box-shadow: 0 0 0 1px var(--board-steel), 0 0 0 7px var(--board-ring),
            0 0 0 11px var(--kit-dark), 0 0 0 12px var(--kit-light);
```

From the cells outward: 1 px steel, the 6 px numbers ring, a 4 px surround in the kit's dark colour, a 1 px
pinstripe in the kit's light colour (7.7:1 or more on the wall, so the board's edge always shows). Spread,
never `border` or `padding`. `--kit-dark` and `--kit-light` are set per break from the kit.

Next to "Hosted by @jim" sits a 20 × 10 px swatch split dark | light. There is no title underline. Default
kit for a host without a choice: Blue with Yellow. Hosts set it on `/account` (host section); `/host/new`
nudges a host who has not.

### Type

Barlow 400/500/600 for body and Barlow Condensed 600 for cell numbers (unchanged), plus **Big Shoulders
Display 800** on wall routes. Five font files in the app. Big Shoulders is one variable file, Display cut
pinned, not preloaded: the `opsz` axis is fixed at its maximum (`font-variation-settings: "opsz" 72`) wherever
Big Shoulders is drawn, so every size in the table below takes the Display cut; weight 800, latin subset,
`display: swap`. Task 1 confirms the family's export name in `next/font/google` before anything else (Google
has reorganised the family). (Amended by the Plan C panel fix pass.)

| Role | Face | Size / line |
|---|---|---|
| Break title (wall) | Big Shoulders Display 800 | 32 / 32, two lines max |
| Caller banner | Big Shoulders Display 800 | 26 / 28 |
| Checkout count ("12 to go", paper bar) | Big Shoulders Display 800 | 22 / 24, tabular |
| Result headline, landing display | Big Shoulders Display 800 | 40 / 40 |
| Grid numbers | Barlow Condensed 600 | 18 / 1, never below 16 |

Big Shoulders is sentence case, used at most three times per page, never on buttons or labels.

### Heat (the lamp)

A radial lamp behind the board, one warm white `rgb(255 232 200)` that only brightens: its hue never
changes, so a new break never looks cold and nothing on the board ever reads as hot or cold. Five literal
steps that CSS and the link preview share (owner's decision, 2026-10-14):

| Step | When | Colour |
|---|---|---|
| 0 | under 25 % claimed | `rgba(255,232,200,0.06)` |
| 1 | 25 % claimed or more | `rgba(255,232,200,0.095)` |
| 2 | 50 % claimed or more | `rgba(255,232,200,0.13)` |
| 3 | 75 % claimed or more, up to every line claimed | `rgba(255,232,200,0.165)` |
| 4 | the break is closed (every line paid) | `rgba(255,232,200,0.20)` |

Counting: numbered lines only (bonus lines never count); claimed = taken, sent, paid or reserved for a mini,
which matches `listFeed.open`. `heatStep(open, total, closed)` = `closed ? 4 : Math.min(3, Math.floor(4 *
(total - open) / total))`, a pure function in `flights.ts`. `closed` is true from Closed on (closed, running
draw, ran), so heat is frozen through the draw and after. A release steps the lamp back down. Tests pin the
step edges (12 of 50 claimed = 0, 13 of 50 = 1, 50 of 50 claimed and not closed = 3, closed = 4) and the
constraints: one colour for every step, alpha rising monotonically and never above 0.20. A step change
transitions the lamp layer's `opacity` over `--dur-lamp` (the gradient's colour is fixed, so one layer is
enough), only when the step changes, never on mount. The lamp never pulses and is never labelled.

### Space, shape, motion

Space and shape as in the first design §3. Motion: §7 replaces the first design's §3 Motion in full. The
first design's `--animate-deal` and `--animate-lift` in `globals.css` are retired with it. The complete
motion token set:

| Token | Value | Used by (§7) |
|---|---|---|
| `--dur-press` | 70ms | Select, pointerdown |
| `--dur-unpress` | 120ms | Select, release |
| `--dur-drop` | 160ms | Claim commits: the flight drops |
| `--dur-squash` | 80ms | Claim commits, each throw |
| `--dur-settle` | 120ms | Claim commits: settle |
| `--dur-glint` | 220ms | Claim commits: the glint |
| `--dur-others` | 120ms | Others claim |
| `--dur-sent` | 180ms | I've sent it |
| `--dur-set` | 140ms | Paid, paid undone |
| `--dur-seat` | 100ms | Paid: the flight seats |
| `--dur-release` | 200ms | Release or give back |
| `--dur-strike` | 200ms | Line sniped |
| `--dur-banner` | 180ms | Every caller banner |
| `--dur-lights` | 300ms | House lights down, the lift after the reveal |
| `--dur-beat` | 300ms | Beat before 3rd and 2nd |
| `--dur-beat-top` | 800ms | Beat before the top spot |
| `--dur-throw` | 260ms | The dart's flight |
| `--dur-throw-settle` | 140ms | Each throw: settle |
| `--dur-shake` | 120ms | Each throw: shake |
| `--dur-gap` | 550ms | From one throw's settle to the next beat |
| `--dur-lamp` | 600ms | Lamp step crossfade |
| `--dur-reduced` | 150ms | The longest fade under reduced motion |
| `--stagger-own` | 50ms | Your own cells |
| `--stagger-others` | 30ms | Other cells |
| `--ease-in` | `cubic-bezier(.55,0,1,.45)` | Drop, throw |
| `--ease-out` | `cubic-bezier(.2,.7,.3,1)` | Others, set, press, strike, lights, banner, glint |
| `--ease-over` | `cubic-bezier(.3,1.5,.5,1)` | Unpress, settle, seat, banner overshoot |
| `--ease-inout` | `ease-in-out` | Lamp, sent, release, paid undone |

The read-out chips' spacing is computed, not a token: `min(30ms, 1500ms / lines)`, in `reveal-plan.ts`.

## 5. The grid

Eight columns at 390: the page column stays 358 px (390 − 2 × 16) and the board pulls 3.5 px into each
gutter (`margin-inline: -3.5px`), so the board is 365 px wide: eight 44.75 px cells on 1 px steel wires (a
45.75 px pitch), 7 rows, 319 px tall at 50 lines, so the 44 pt tap target holds. The 12 px frame is the
`box-shadow` spread into the 16 px gutter (15.5 px into it, half a pixel left to the screen edge), never a
border or padding: a 12 px border would leave 334 px and `columnsFor` would drop to 7 columns. `columnsFor` is
unchanged and reads the 358 px column. At 360 it is 7 columns of 47 px cells. (Amended by the Plan C panel fix
pass.) No ancestor within 12 px of the grid may clip overflow. Render tests at 390 and 360 assert the
column count. The 50-line budget and the bonus-line rule are unchanged. Empty slots in the last row are
`--board-wall-2`, not wire.

### Glyph sizes and marks

- Glyphs sit top-right. Cells under 48 px (every phone at 390 and 360): every glyph is 14 px at a 2 px
  inset, and the "yours" ring, not the glyph size, says yours. 48–55 px cells: 14 px, yours 16 px, 3 px
  inset. 56 px and up: 20 px, 3 px inset. Won cells follow their own size rule below.
- Every glyph sits on a 1 px cream knockout, so the hatch never crosses a glyph.
- Hatch: 45°, `--board-ink-2` at 35 %, 1 px every 4 px. Hatched cells keep the shipped cream chip behind the
  number (`cell.tsx` `chip`), so the hatch never crosses a numeral.
- The "yours" ring: a 4 px two-tone ring inset 2 px from the cell edge. On cream and light faces, ink
  outside, cream inside; on dark faces, cream outside, ink inside. One band is always 3:1 or more against
  the face.
- Selected brackets: four 8 px corner ticks, 2 px `--board-ink`, inset 3 px.
- The sent mark: a 2 px `--board-ink` rule, 10 px long, under the number's chip, on a 1 px cream knockout, like
  the glyphs.

### States, shape first

| State | Face | Number | Glyph (top-right) | Extra mark |
|---|---|---|---|---|
| Open | cream | ink | none | none |
| Selected | cream | ink | none | the brackets |
| Sniped (was selected, now taken by someone else; client-only, until the next tap) | as Claimed, others (kit view: the kit-view claimed cell) | ink on chip, with a 2 px ink strike through the number | as Claimed, others (kit view: the kit-view claimed cell) | none |
| Claimed, others (sent or not) | cream + hatch | ink on chip | holder's flight, filled in its colour, 1.25 px ink keyline | none |
| Yours, not sent | cream + hatch | ink on chip | your flight, **outlined**: 2 px ink stroke, hollow | the yours ring |
| Yours, sent | cream + hatch | ink on chip | your flight filled in your colour, 1.25 px ink keyline | the yours ring and the sent mark |
| Overdue (host and admin only) | as Claimed, others, or as yours when self-claimed | ink on chip | none: a 12 px / 600 `--red` "!" takes the glyph's place | 2 px `--red` inset edge |
| Paid, others | holder's colour (the overlay) | cream or ink per tier | flight filled in the number's ink, no keyline | none |
| Yours, paid | your colour | per tier | as above | the yours ring |
| Reserved for a mini | `--board-cream-2`, no hatch | `--board-ink-2` | none | 3 px double steel rule inset 2 px and the "m" micro label top-left (as today) |
| Bonus (number above N) | as its state | as its state | as its state | none; the "Bonus" row label carries it |
| Won, top spot | `--board-ring` | ink, on the bull disc | holder's flight (size rule below), 1.25 px cream keyline | cream bull disc with a double ring: 2 px red, 1 px cream, 2 px red |
| Won, 2nd | `--board-ring` | ink, on the disc | as above | cream disc with a single 3 px green ring |
| Won, 3rd | `--board-ring` | ink, on the disc | as above | cream disc with a 3 px green ring dashed in four segments |

Notes on the table:

- Other people's sent lines show as claimed. The member view does not distinguish sent from unsent on other
  holders' lines anywhere in the member view: the board, the List view and the holder popover all say
  "taken" for them (the host sees sent in the ledger). The first design's dashed sent edge is retired; your
  own sent lines carry the filled glyph and the sent mark.
- Sniped is the end state of the strike in §7. It is dropped from the bar and announced; the next tap
  anywhere on the board clears it to Claimed, others.
- The bonus ink face and "+" of the first design are retired, since black now means won; `render.test.ts`
  changes deliberately in task 7.
- Paid faces against the open face are 1.5:1 to 2.2:1 for the light tier. That passes because the face never
  carries state: the hatch leaves, the glyph fills and the number changes ink.

Won cell size rule (the disc is centred; the glyph clears it):

| Cell size | Disc | Number | Glyph |
|---|---|---|---|
| under 56 px (every phone) | 26 px | 16 px (top spot 14 px) | 10 px at a 2 px inset |
| 56–67 px | 30 px | 18 px | 14 px at a 3 px inset |
| 68 px and up | 30 px | 18 px | 20 px at a 3 px inset |

There is no place word in the cell at any size and no caps chip anywhere. The ring
shape carries the place (double for the top spot, single for 2nd, dashed for 3rd); the result headline, the
caller banner and the accessible name carry the words.

Rings are drawn inside the disc's edge. Under 56 px the top-spot number is 14 px (2nd and 3rd keep 16 px, inside a
20 px centre); the 10 px glyph clears the 26 px disc. Render tests cover 44, 56 and 68 px cells, and the
`/dev/components` page is checked by eye at 390 for the top spot with a two-digit line.

The kit view (§6) for non-members: claimed (sent or not) = cream + hatch + chip + an ink standard flight + a
5 px kit-light band along the bottom edge with a 1 px ink keyline on its top edge (y 39–44 at 44 px, clear of
the numerals); paid = kit-dark face, cream number, cream standard flight; won = the same black face, bull
disc and ring as the member view, with a cream standard flight in place of the holder's flight. The won cell
is black in every view. Reserved and bonus are as in the member view. The link preview draws the same states
without the hatch and glyph (§6).

Per-break collision rule: when two holders in one break share a flight, or share a shape in a watched colour
pair, the later one to claim is shown in that break with the next shape in the cyclic order standard → pear →
kite → slim, starting from the holder's own shape, that is not already used by that colour or its watched
pair (a second blue kite shows as slim); "later" is by each holder's earliest claim in the break, ties by
owner id; if all four are used, the flight shows unchanged. The cream knockout under a glyph is drawn only on
hatched (taken or sent) cells. The board's group label is "Lines"; a banner that is not a call (the draw
start, "Board's full. Game on.") carries a `--kit-dark` left rule. Member view only, the same for every member viewer (so screenshots agree), computed by
`shapeGrid` from claim order, with nothing stored. This is not rare: with 32 flights, a break with seven
holders shares a flight about half the time. The popover always disambiguates by handle.
Your own lines may show the substituted shape; the yours ring still marks them, and the "This is your flight" line
and `/account` show your stored flight. The shapes are recomputed from the current holders, so a release can change
a later holder's shape back; that change sets still.

### Legend and "show mine"

Member legend: open, taken, sent, paid, yours, each drawn as a mini cell beside its word (paid has no single
colour, so its mini cell is in the viewer's own colour). The "sent" mini cell is drawn as yours, sent (ring,
filled glyph, sent mark), since other people's sent lines show as taken. Kit legend: open, taken, paid. Words separated by spaces, no middle dots.

When the viewer holds lines, the line "You have 4, 11 and 27." sits under the legend. It is the Show mine
toggle: a button with `aria-pressed`, the same on every input. On, it applies the house-lights overlay (§7:
`--board-wall` at 55 % over each cell, with your glyph above it) to every cell that is not yours; off, it
removes it. It sets still in both directions and turns itself off when a claim commits or the reveal starts.
The claim bar never shows "You hold …". Show mine ships in the follow-up game-structure plan, not this one
(§13); in this plan the "You have …" line is plain text under the legend.

### Grid and list

The first design's Grid | List control stands. List rows carry handles as text, never glyphs. The popover on
a taken cell ("Line 7: @mike, paid") is text only.

### Accessibility

Accessible names never carry a handle or a flight for any viewer: "Line 7, open", "Line 7, taken",
"Line 7, paid", "Line 9, yours, sent", "Line 7, just taken" (sniped), "Line 7, taken, overdue" (host and
admin), "Line 23, top spot", "Line 9, 2nd place", "Line 31, 3rd place". The place comes from a new
`place: 1 | 2 | 3 | null` on `CellData` (result page only; the place is public there). The grid group is
labelled "Lines, 12 to go". The holder popover and the List view carry handles only where §6 allows.

Focus ring on the board: a 2 px `--board-ink` outline at 0 offset with a 2 px cream ring outside it
(`outline: 2px solid var(--board-ink)` over `box-shadow: 0 0 0 4px var(--board-cream)`), so one band always
contrasts with whatever it borders. On paper the first design's 2 px green ring stands (this amends its §7 on
the board only). Contrast of every flight face against both inks is pinned by `flights.test.ts`; axe runs
over the member view, the kit view, the result page, `/account` and the host's break view with an overdue
line.

## 6. Who sees flights (the visibility rule)

**Flights are holder data.** `shapeGrid` sets a cell's `flight` under exactly the condition that sets its
`holder` today (`showHolders`: the break's host, an admin, or a viewer who currently holds a line in that
break). Every other viewer, and every surface built without a viewer (link preview, feed, landing, host
profile), sees the board in the host's kit and the fill heat, with no flight, no grouping and no name on the
cells.

| Viewer | Others' flights | Own lines | Handles (popover, List) | `shapeGrid` per cell |
|---|---|---|---|---|
| Anonymous | none (kit view) | n/a | none | `holder: null, flight: null, mine: false, overdue: false` |
| Signed in, no line here | none (kit view) | n/a | none | same |
| Holder | every holder's flight | own flight + ring | yes | `holder, flight, mine, overdue: false` |
| Host | yes | own if self-claimed | yes | `holder, flight, mine, overdue` |
| Admin | yes | n/a | yes | as host |

- **Why.** Once a break has run, the result page shows every line's handle (and owner id, for the verifier)
  to anyone. A stable flight shown to strangers would turn that list into a key that follows buyers from
  break to break. That is why flights stay holder data, why a flight is never derived from the user id (§4),
  and why **no surface puts a flight next to a handle**: the List view, the popover, the ledger, the result
  page's entry list and the stranger's caller banner show handles as text with no glyph. Flights live on the
  board; handles live in text.
- **The one exception: the member view's caller banner.** On the result page in the member view,
  the call carries the winner's flight glyph and colour beside the handle (§7). Those viewers already see
  every holder's flight on the cells and every holder's handle in the popover, so the banner tells them
  nothing new. Kit-view viewers get the text call with no glyph.
- **The view switch never animates.** When a claim makes the viewer a holder, the response re-renders the
  board in the member view in one frame. Only the viewer's own newly claimed cells play "Claim commits" (§7);
  every other cell takes its member-view state still. The reverse (the viewer's last line given back or
  released) plays the viewer's own release moment, then re-renders in the kit view still. `cellMoments`
  compares only cells rendered in the same view.
- **Caching and client data.** Flights never appear in a response cached across viewers. The OG route
  (`public, s-maxage=300`) never reads the session; feed, landing and host-profile thumbnails are never
  personalised. A kit-view cell renders no `data-flight` and no `--fc`. The client receives `flight` only
  where `shapeGrid` set it, as palette keys, never hex. `GridModel.kit` and `GridModel.heat` are always set
  (public); `feedThumbs` stays unchanged and selects no owner.
- **Result page and reveal for strangers.** The throw lands exactly as for members: the cell turns black with
  the bull disc and ring and a cream standard flight. The winner's handle stays public, as in the first
  design §5.7, and the caller banner is text with it: "Line 23. @mike takes the top spot." Its left rule is
  `--red` for the top spot and `--green` for 2nd and 3rd, with no glyph.
- **The link preview model.** `ogModel(page, now)` keeps its entry point and still shapes for no viewer
  (built on `shapeGrid(page, null, now)`). Its input is typed as a line-state-only subset of `BreakPage`, so
  the type system keeps handles and flights out of the preview. It adds `kit: { dark, light }`, `heat: 0–4`
  and per cell `tone: "open" | "taken" | "paid" | "reserved" | "won"` with `place: 1 | 2 | 3` on won cells;
  sent folds into taken and bonus lines are dropped, as today. No flight, holder or handle field exists on
  `OgModel`; a unit test asserts its keys.
- **The link preview image.** Solid colours only (Satori draws no patterns, so the band replaces the hatch):
  the wall; one lamp, `radial-gradient(ellipse at center, <step colour>, transparent 70%)` at the current
  step, colours in comma `rgba()`; cream open cells; claimed cells with a 7 px kit-light band at the bottom
  and a 1 px ink keyline on its top edge; kit-dark paid cells with cream numbers; reserved cells on
  `--board-cream-2` with a 2 px steel inner border (so they no longer differ by number colour only); won
  cells on `--board-ring` with a cream disc at 0.48 × the cell, a ring at 0.05 × the cell (double red for the
  top spot, single green for 2nd, dashed green for 3rd) and an ink number, no glyph; empty last-row slots in
  `--board-wall-2`. Wire and gaps in `--board-steel` (the route's `WIRE_STRONG` goes). The frame scaled ×2 as
  one box shadow on the grid box: 2 px steel, 12 px numbers ring, 8 px kit dark, 2 px kit light, 24 px in
  all (the 64 px padding leaves 40 px). If a snapshot shows Satori ignoring the spread, the frame becomes
  nested boxes and `GRID_PX` drops to 452. Satori takes literal values, so the route reads them from
  `flights.ts` and a `board-tokens.ts` constant module that `tokens.test.ts` checks against `tokens.css`, never
  retyped.
- **The link preview text.** Fonts are static TTFs read from disk at module load (Big Shoulders Display 800,
  Barlow Condensed 600, Barlow 500); they are not shipped to browsers. Title: Big Shoulders 800,
  `--board-text`, 60 px (44 px past 40 characters, three lines max, as today). Caption: Big Shoulders 800,
  40 px, `--board-text-2`: open "12 to go, $5 a line"; closed "Closed. Every line is paid."; running draw
  "Running draw"; ran "Ran Oct 14. Anyone can check the draw."; cancelled "Cancelled". "Hosted by @jim":
  Barlow 500, 28 px, `--board-text-3`, with a 40 × 20 kit swatch. Wordmark "Breaks": Barlow Condensed 600,
  32 px, `--board-text`. A closed break is a solid board in the host's dark colour, laced with steel, inside
  the host's surround: recognisably the host's from across a Facebook feed.

## 7. Moments (feel of play)

This section replaces the first design's §3 Motion in full. Carried over from it: every moment honours
`prefers-reduced-motion`; the result is in the DOM before any animation; the deal layer is `aria-hidden`;
**Skip** shows throughout the reveal; the reveal plays once per viewer and later visits offer **Replay the
draw**. Durations and easings are the §4 tokens. Caps count cells animating at once; cells past a cap set
still.

| Moment | What changes on screen | Duration and easing | Stagger and cap | Reduced motion | Announced (polite) |
|---|---|---|---|---|---|
| Select (tap, before claim) | The cell dips under the thumb; the brackets appear at once; the bar total updates at once. | `scale(.94)` over `--dur-press` `--ease-out` on pointerdown; back over `--dur-unpress` `--ease-over`. | One cell. | No scale. | The bar's region: "3 lines selected, $15". |
| Line sniped | A 2 px ink strike draws across the number left to right (`scaleX` 0 → 1); the cell deselects and leaves the bar; it stays struck until the next tap. | `--dur-strike` `--ease-out`. | Every sniped cell at once, at most 8. | Strike shown at once. | "Line 7 was just taken." |
| Claim commits (yours) | The hatch is set at once; your outlined flight drops 6 px into its corner; the cell squashes; the four wire segments around the cell glint once in `--board-cream` at 70 % opacity, fading to 0; the yours ring appears at landing. The bar's "12 to go" drops by one per landing (a text swap). | Drop `--dur-drop` `--ease-in`; squash to `scale(.96)` over `--dur-squash`, linear; settle `--dur-settle` `--ease-over`; glint `--dur-glint` `--ease-out`, never repeated. The pay sheet opens at the last landing or at 400 ms, whichever comes first. | `--stagger-own`, at most 5. | Final state at once, no glint. | "You have lines 4 and 11. Pay Jim $10." Partial: "You have line 4. Line 7 was just taken. Pay Jim $5." |
| Others claim (seen on refresh) | The hatch is set at once; their flight (member view) or the ink standard flight and kit-light band (kit view) fades in. No squash, no glint: the crowd arriving never gets the thumb's impact. | `--dur-others` `--ease-out`. | `--stagger-others` in line order, at most 8 per refresh. | At once. | Not announced. |
| I've sent it | Your flight goes from outline to filled in your colour; the sent mark fades in. | `--dur-sent` `--ease-inout` cross-fade. | `--stagger-own`, at most 5. | At once. | "Sent. Jim will tick you off when it arrives." |
| Paid (any line, on the break page) | A pre-rendered overlay in the holder's colour (kit view: the kit-dark face) fades in, then the flight seats 2 px. The number and glyph switch to the face's ink at the end of the fade; during the fade the number keeps its old ink on its chip, so it is never mid-blend at rest. Never transition `background-color`. | Overlay `--dur-set` `--ease-out`; seat `--dur-seat` `--ease-over`. | `--stagger-others`, at most 8. | At once. | Own lines only: "Jim ticked you paid: lines 4 and 11." |
| Paid undone (host Undo or un-mark) | The ink switches back, then the overlay fades 1 → 0; the flight and hatch stay. | `--dur-set` `--ease-inout`. | `--stagger-others`, at most 8. | At once. | Own lines only: "Jim marked lines 4 and 11 not paid yet." |
| Release or give back | The colour drains (overlay 1 → 0), the flight lifts 8 px and fades, the hatch fades. The count goes up as a text swap. If it was the viewer's last line, the board then re-renders in the kit view still (§6). | `--dur-release` `--ease-inout`. | No stagger, at most 8. | At once. | To everyone on the page: "Lines 4 and 11 are open again." To the released buyer: "Jim released lines 4 and 11." After a give back: "You gave back lines 4 and 11." |
| Lamp step (the claimed share crosses a step, up or down) | The lamp crossfades to its new step (§4). | `--dur-lamp` `--ease-inout`. | One lamp. | Steps without the crossfade. | Not announced. |
| Board fills (the break closes: the last line is paid) | The lamp takes its top step; the caller banner "Board's full. Game on." drops in and stays; the bar shows the Closed message. Nothing travels across the cells. Plays once per viewer per break, stored like the reveal's once-per-viewer flag; later visits show it still. | Lamp `--dur-lamp` `--ease-inout`; banner `--dur-banner` `--ease-out` with a 2 px overshoot (`--ease-over`). | One board. | Lamp steps, banner at once. | "Board's full. Every line is paid. Waiting for Jim to run the draw." |
| Draw starts (host taps Run draw) | Status pill "Running draw"; caller banner "Jim is stepping up to the oche." No ambient motion, no pulse. The host's confirm is instant. | Banner `--dur-banner` `--ease-out`. | One banner. | At once. | "Jim started the draw. The result is in about a minute." |
| Draw: house lights down (set-up) | At 0 ms Skip appears and an overlay of `--board-wall` at 55 % fades in over every cell at once, with the banner "Jim's break. 50 lines. Game on."; each viewer's own glyphs stay above it (the same rule for every viewer, so strangers see none). At 300 ms the audited order reads out as chips under the board at an even tempo; the chips stay as the scorer's column. Then the first throw's beat starts. | Overlay `--dur-lights` `--ease-out`; banner `--dur-banner`; chips `min(30ms, 1500ms / lines)` apart, at most 1.5 s in all. | One board class (exempt from the caps). | Skipped; the final state is in the DOM. | Not announced (the layer is `aria-hidden`; the order is not read out). |
| Draw: each throw | The banner calls the place ("For 3rd place…", "For 2nd place…", "For the top spot…"); a beat; one neutral dart (steel barrel, cream flight) flies from the oche (bottom centre of the board's frame) in a straight line to the cell, its angle fixed once at launch and never turned, accelerating. On impact the overlay on that cell goes to 0 at once; the cell takes its won state at once; the cell (not the board) squashes, settles and shakes. Places with no prize are skipped; order 3rd → 2nd → top. | Beat `--dur-beat` (`--dur-beat-top` before the top spot); throw `--dur-throw` `--ease-in`; squash `--dur-squash` to `scale(.92)` (`scale(.9)` for the top spot); settle `--dur-throw-settle` `--ease-over`; shake `--dur-shake`, ±2 px on x (±4 px for the top spot), one cycle; `--dur-gap` from one settle to the next beat. | One cell at a time. | Final state, at most a `--dur-reduced` fade. | Not announced separately (the call announces it). |
| Draw: the call | The banner: "Line 23. @mike takes the top spot." Always the handle, never "You". Member view: the 4 px left rule takes the winner's flight colour, with their glyph at 24 px with a 1.5 px cream keyline. Kit view: text only, the rule `--red` for the top spot and `--green` for 2nd and 3rd. The banner text stays `--board-text`; Replay and Skip stay in paper style. | `--dur-banner` `--ease-out` with a 2 px overshoot (`--ease-over`). | One banner. | At once. | The call text. |
| After the reveal | The overlay lifts from every cell in one fade. The finished mosaic with its black bulls is the picture the result page and the preview keep. When the reveal ends or Skip is pressed, focus moves to Replay. | `--dur-lights` `--ease-out`. | One board class. | At once. | Not announced (the result is in the DOM under the `h1`). |
| Skip | Jumps to the final state of the reveal. | One fade, at most `--dur-reduced`. | One board. | Same. | Not announced; focus moves to Replay. |
| Replay the draw | Plays the reveal again from house lights down. | As the reveal. | As the reveal. | The final state with at most a `--dur-reduced` fade; Skip and Replay remain. | Not announced. |
| Change of view, Show mine, bonus line added, any other transition | Sets still. | None. | n/a | n/a | As the triggering action, if any. |

Totals, pinned by tests in `reveal-plan.ts`: set-up = `--dur-lights` + the read-out (at most 1.8 s); each prize =
beat + throw + squash + settle (the shake runs inside the following gap); `--dur-gap` between prizes; then
`--dur-lights` for the lift. One prize is about 1.6 s and three about 4.2 s after the read-out; with the set-up, at
most about 3.4 s and 6 s.

Caller copy (complete; nothing else is shown in the banner, and banners show one line at a time):

- "Board's full. Game on."
- "Jim is stepping up to the oche."
- "Jim's break. 50 lines. Game on."
- "For 3rd place…", "For 2nd place…", "For the top spot…"
- "Line 9. @liz takes 3rd place.", "Line 14. @dave takes 2nd place.", "Line 23. @mike takes the top spot."

The same lines for every viewer. Never "You", never the prize or its value.

Never (acceptance criteria, each with a test or a review check): cycle, flicker or highlight candidate
numbers, including for Pick for me, Claim 1 random and Take the last 3 (a random pick just lands); a dart
that wanders, curves, wobbles, lands beside a line or bounces out; any copy or motion that changes with the
viewer's holdings ("so close", "your line is still in", a longer beat when you hold more); a spinning or
turning dart or any rotation in the reveal; anything that travels across the cells (sweep, ripple, chase,
sequential highlight); the winner's colour outside its cell and the banner; confetti, sound, vibration,
flashing or strobing, prize-value counters, rolling counts; "You won!" or any banner text not in the caller
copy set. The glint is not a flash: it is cream, once, on the wire only, and never repeats.

Implementation: per-cell effects are CSS-only on `transform` and `opacity`; the one JS tween is the dart's
path (`requestAnimationFrame`, no library). Per-cell custom properties: `--face`, `--num`, `--fc` (three per
cell, at most 55 cells). `contain: paint` on each cell; `will-change` only while a cell animates; at most 8
cells animate at once outside the reveal (the house-lights dim and lift are one board class and the only
exceptions). Keyframes: `land`, `glint`, `fadein`, `set`, `seat`, `pull`, `strike`, `squash`, `squash-throw`,
`shake`; press is a transition on `transform`, not a keyframe. (Amended during Plan C execution.)
Reveal timing stays as pure functions in `reveal-plan.ts`. `theme-color` is set per route (§8) so
the in-app browser never flashes white.

## 8. Screens

Wall routes, each with the `--board-wall` page background on `html` and `body` (so overscroll never shows
paper) and `theme-color` set to the `--board-wall` value through a route `viewport` export: `/b/{id}`,
`/b/{id}/result`, `/breaks`, `/`, `/h/{handle}`, and the link preview. Every other route keeps `--paper` and
the `--paper` value as `theme-color` (`/host`, `/me`, `/account`, `/host/new`, sign-in, onboarding). Today
`globals.css` sets `html` and `body` to `--paper` unconditionally and `layout.tsx` sets one global
`themeColor`; task 1 makes both per route.

- **Break page `/b/{id}`.** The wall, the lamp, the title in Big Shoulders, the media row "50 lines, $5 a
  line", "Hosted by @jim" with the kit swatch, the framed board, the legend (member or kit wording, §5) with
  the "You have …" line, and the paper bar with the checkout
  count ("12 to go", Big Shoulders) beside the primary action. "To go" counts open numbered lines (not
  claimed, not reserved). After a claim the outcome sheet carries one line with the glyph, "This is your
  flight. Change it in your account.", shown while `users.flight_chosen_at` is null, at most once per break
  (on the viewer's first claim there). The status pill sits beside the checkout count in the bar; "Pay within
  24 hours." moves to the claim sheet's pay block.

  The reveal plays on the result page only (first design §5.7). While the draw runs, the break page shows the "Draw
  starts" banner (§7) and the "Running draw" bar; once it has run, the bar shows **See the result** and the board
  takes its final state still.

  Pixel budget at 390 × 664, 50 lines, so the whole board and legend sit above the bar on the first screen
  (`e2e/layout.spec.ts` re-measures it with the frame, the lamp and the Big Shoulders title):

  | Block | Height | Running |
  |---|---|---|
  | Header | 56 | 56 |
  | Title, two lines | 12 + 64 | 132 |
  | Media row and "Hosted by" on one line | 4 + 24 | 160 |
  | Gap, frame top, board (7 rows), frame bottom | 12 + 12 + 313 + 12 | 509 |
  | Legend | 8 + 16 | 533 |
  | "You have …" line (holders only) | 4 + 20 | 557 |
  | Sticky bar + safe area | 64 + 34 | 655 |

  The bonus row, when there is one, may push the legend past the bar; the page scrolls. While there are no
  photos the media row has no thumbnail on the wall (the board is the picture); the photo layout arrives with
  the storage plan.
- **Result `/b/{id}/result`.** "Top spot: line 7" in Big Shoulders above the winner's handle, the finished
  mosaic (member view) or the kit board (strangers) with the three black bulls, the caller's banner, the full
  order, Replay, Share, Skip, Technical details (unchanged). The entry list shows handles as text, no glyph.
  The link preview for a ran break shows the bulls on the kit board.
- **Feed `/breaks` and landing `/`.** Feed cards sit on the wall. Each thumbnail has a 6 px frame (1 px steel,
  4 px kit dark, 1 px kit light) and the lamp at the break's step behind it (kit view), then the title, "12 to
  go", "$5 a line" and the host. Sort chips: "Newest", "Closest to full". The landing hero is the kit board of
  the most recent ran break with its black bull cells, captioned as in the first design ("Ran 2 hours ago.
  Anyone can check the draw.").
- **Host profile `/h/{handle}`.** The host record (§9) under a board in the host's kit; every break card
  framed in the host's kit.
- **`/me`.** Paper. Each card shows your own lines only, drawn as on the board in your flight (light faces
  keep the ink keyline on paper; the wire is `--board-steel`), and the state line as today. No other holder's
  data, no kit, no heat, no Show mine. A plain history (§9).
- **`/account`.** Paper. "Your flight": one radio grid of the 32 flights laid out as eight columns (the dark
  tier's three colours, then the light tier's five) by four rows of shapes, each 44.75 px at 390, the current
  one ringed; above it a preview of one 88 px cell and a row of seven 44 px cells (open, taken, yours, yours
  sent, paid, yours paid, won). Host section, "Your kit": two radio groups (dark three, light five) and a
  framed four-cell board preview.
- **`/host`, the ledger, sheets, forms, onboarding.** Paper, unchanged. No kit, no flights, no glyph, no new
  motion: the host's work never slows. Ledger mini cells stay in the first design's ink and hatch.

## 9. Game structure (records, not rewards)

- The checkout count "12 to go" in the bar, the feed card, the link-preview caption and anywhere else a count
  appears. "19 of 50 left" is retired.
- The host record on `/h/{handle}` and the ledger header: "41 breaks run since Mar 2026. 40 draws verified."
  (month and year via `formatMonthYear`, as Plan B's ruling 4 writes dates; "No breaks run yet." at zero). A
  break counts as run when it has an active (not voided) draw, as `hostTrust` counts today. A draw counts as
  verified when `verifyInputs` passes on its recorded inputs, the check the result page shows as "Checked"; it is
  computed once when the draw is recorded and stored as `draws.verified_at timestamptz` (migration 0004,
  backfilled by running the check over existing draws), so `hostTrust` stays a count. No other
  state words in the sentence. When a closed break has stalled, the platform §9 stall line ("Closed 3 days
  ago, not drawn yet.") shows under it, so the record is never only good news. It extends `hostTrust`
  (`breaks/queries.ts`); no new table. It shows counts only, never prize totals, money raised or a ranking
  against other hosts.
- A plain history on `/me`: breaks with a state word each (open, sent, paid, won, shipped). No totals of lines
  bought, money spent or wins, and no win rate. A win shows once: on that break's result and as the state
  word.
- Neither flights nor kits are tied to any record (§3).
- Out of scope, gated on the reputation plan: levels, tiers, streaks, trophies, win counts, anything that
  can be read as odds or winnings.

## 10. Data

Migration `0004_flights_kits` (forward-only; the generated SQL must match exactly, per the Plan B migration
rule; applied to the local, `breaks_test` and `breaks_e2e` databases):

- `users.flight_colour text` and `users.flight_shape text`, each with a column default that draws a random
  key on the server (`(array['petrol','blue','plum','yellow','orange','lime','sky','pink'])[1 +
  floor(random() * 8)::int]` and the same over `'standard','kite','slim','pear'`). The `users` row is created
  at first sign-in, before onboarding completes, so every member has a stored flight by the time they can
  claim. The migration backfills existing rows with the same expressions, then sets both columns `NOT NULL`,
  with a `CHECK` on each set. `users.flight_chosen_at timestamptz`, nullable (null = never picked).
- `host_profiles.kit_dark text CHECK (kit_dark in ('petrol','blue','plum'))` and
  `host_profiles.kit_light text CHECK (kit_light in ('yellow','orange','lime','sky','pink'))`,
  nullable, with `CHECK ((kit_dark is null) = (kit_light is null))`; null means the default kit (Blue
  with Yellow). `host_profiles` rows are created lazily (`breaks/commands.ts`), so `updateHostKit` upserts the
  same way.
- `draws.verified_at timestamptz`, nullable, set when the draw is recorded if `verifyInputs`
  (`src/crypto/verify.ts`) passes on its recorded inputs; the migration backfills it by running the same check
  over existing draws (§9).
- `src/domain/flights.ts`: the palette with faces and inks, keyed by name (keys never reorder), `inkFor(face)`,
  `kitFor(profile)`, `heatStep(open, total, closed)` and the heat table. `flights.test.ts` pins every contrast
  pair at 5:1 or better, the tier rule for kits, the heat steps and constraints (§4), and the palette keys
  against the migration's `CHECK` lists. There is no `defaultFlight(userId)`.
- A new `updateFlight(tx, caller, { colour, shape })` (onboarded caller; sets `flight_chosen_at`) appends
  `user.profile_updated` with `changed: ["flight"]` (never the values). A new `updateHostKit(tx, caller,
  { dark, light })` (hosts and admins, since admins may host) appends `host.profile_updated` with
  `changed: ["kit"]` (never the values).
  Input is parsed by a pure, tested function in `src/app/account/parse.ts` (platform §12 "profile update field
  allowlist"). `updateProfile` is unchanged.
- `getBreakPage`'s lines select adds `ownerFlightColour` and `ownerFlightShape` from the existing `users` join,
  and its host select adds the kit from the existing `hostProfiles` join. It has one path for every caller;
  `shapeGrid` stays the only gate: `GridCell.flight` is set on the same condition as `holder`, after the
  collision rule (§5) is applied.
- `listFeed` adds a left join on `hostProfiles` and carries `kit` and `heat` per card; `hostProfile` carries
  `kit` only (it has no single break; its cards come from `listFeed({ hostHandle })`); `latestRanBreak` (the
  landing hero) returns the ranking's prize places (from `placesOf`, a list that need not be contiguous, read lowest place first, top spot last), the kit and the thumb cells, not just `topLine`;
  `ogModel` carries `kit` and `heat` (§6). (Amended during Plan C execution.)
- Account deletion (platform §12 runbook): anonymisation keeps the flight columns; they are not personal data.

## 11. Accessibility and performance floor

- WCAG 2.1 AA; axe clean on the member view, the kit view, the result page, `/account` and the host's break
  view with an overdue line. Flight contrast is asserted in `flights.test.ts`, because axe marks text over
  background images "incomplete".
- Every state in §5, including overdue, sniped and the won places, told apart with no colour; every flight
  face at 5:1 or better against its ink; text on the wall 8:1 and up; the outlined (not sent) glyph stroke
  2 px ink at every glyph size.
- `prefers-reduced-motion`: every moment in §7 instant or at most a `--dur-reduced` fade; the lamp still
  steps, without the crossfade; Replay shows the final state with at most a `--dur-reduced` fade; Skip and
  Replay remain.
- Budget: five font files in the app, plus three static TTFs read by the OG route only (not shipped to
  browsers); no texture image; at most 6 KB more CSS and 2 KB more JS than today; animation on `transform`
  and `opacity` only; no canvas, particles, blur, audio, vibration or animation library.

## 12. Implementation notes for the planner

One plan, large, 20 tasks. The first three (tokens and fonts, contrast tests, test selectors to `data-*`)
are a reversible checkpoint; migration 0004 lands right after them, before Cell. Show mine is not in this
plan (§13); the "You have …" line ships as plain text in task 10.

1. Board tokens as new names in `tokens.css` with `tokens.test.ts` pairs; Big Shoulders Display 800 in
   `fonts.ts` (confirm the export name first); per-route `theme-color` and wall backgrounds (Sonnet).
2. `flights.ts`: palette, inks, kits, `heatStep` and the heat table, with contrast and heat tests (Opus).
3. Test selectors moved to `data-*` attributes (Sonnet).
4. Migration 0004 with the random defaults, backfill, `NOT NULL` and `CHECK`s; `flight_chosen_at`;
   `draws.verified_at` and its backfill; `updateFlight`, `updateHostKit`, `parse.ts` and their events (Opus).
5. The holder gate: `getBreakPage` select, `GridCell.flight`, the collision rule in `shapeGrid`, `ogModel`'s
   line-state-only input (Plan B deferred finding); privacy unit tests (null viewer, signed-in non-holder,
   holder, host, admin; `og.test.ts` has no flight key; `feed.test.ts` has no flight) and the e2e assertion
   "no anonymous or non-holder cell has `data-flight` or `--fc`" (Opus).
6. Kit and heat through `listFeed`, `hostProfile`, `latestRanBreak` and `GridModel` (Sonnet, Opus review).
7. Cell: every §5 state, glyphs and sizes, ink per flight, the overlay face, the yours ring, the sent mark,
   the bull and its size rule, overdue on the Mosaic face; the bonus "+" removed on purpose; render tests at
   44, 56 and 68 px; `MiniCells` restyle with a Safari check (Plan B deferred finding) (Opus).
8. Grid frame, surround, empty slots, lamp; the member and kit legends; `GridPreview`; render tests at 390
   and 360 widths; the 390 × 664 density check (Sonnet).
9. `cellMoments(prev, next)`: a pure diff with unit tests (same view only; the view switch, a line-count
   change and unlisted transitions set still; refresh mid-animation snaps; the caps) (Opus).
10. Claim bar: "12 to go" as a text swap, the media row, and the plain "You have …" line under the legend
    (Sonnet).
11. Claim moments on top of `cellMoments`: press, drop, squash, glint, others' fade-in, sent cross-fade, paid
    overlay and undo, release drain, sniped strike, lamp step, board fills (Opus).
12. The reveal rewrite: draw start, house lights, chips, the neutral dart tween, bulls, the caller with the
    copy set and the member-view flight; `reveal-plan.ts` tests for the totals (Opus).
13. Result page and its copy; the entry list without glyphs (Sonnet).
14. OG route in the kit view with heat: TTF assets, the model's new keys, `ogCaption`, the last-row filler and
    reserved-by-colour-only fixes (Plan B deferred findings), one snapshot per status (open 0 %, 50 %, closed,
    ran) with the default and one other kit (Opus).
15. Feed cards, sort chips, landing hero, host profile record (Opus review) and kit framing; `BreakCard` restyle
    (Sonnet).
16. `/account` flight picker and host kit picker; `/host/new` nudge; the "This is your flight" line (Sonnet
    UI, Opus review).
17. Copy audit pass: heat words, "filling fast", winnings, "You won", streak, level, "lucky colour", caps
    chips, betting words near kits, and the wider state-word rule (Plan B deferred finding) (Sonnet, Opus
    review).
18. `/me`: your own lines in your flight and the plain history; `MyBreakCard` render tests and the "Unpaid."
    card note (Plan B deferred findings) (Sonnet).
19. Docs: the Plan B Global Constraints amendments (§1.1: holders gain flights, green and red with "flight
    faces never red or green", fonts, host-profile data, motion, selected, link preview; the platform spec §9
    stall copy), "superseded by Mosaic" notes in the first design's §3, §4, §5, §6 and §7, and the README
    (Sonnet).
20. E2E: participant and stranger views; the first claim as a stranger asserts that only the claimed cells
    carry an animation class; `/account`; the result page and the host's overdue view in axe; journey 2
    updated; fixtures give buyers flights from both ink groups (Yellow and Blue at least) and one host a kit;
    `/dev/components` shows every §5 state (Sonnet).

Reviews on Opus throughout. Rollout as one plan; it does not split cleanly into "world first, then people"
because Cell and `render.test.ts` would be touched twice.

## 13. Decisions taken by the owner (2026-10-14)

- **Show mine waits.** The yours ring and the "You have 4 and 11" line find your lines; the Show mine
  toggle ships in the follow-up game-structure plan. The "You have …" line still renders under the legend
  as plain text in this plan.
- **Hosts may share a kit.** With 15 kits, uniqueness would turn kits into a scarce good hosts race to claim,
  the kind of rarity §3 keeps out. Kits identify a break's host only alongside the handle. Every host who
  has not chosen shares the default Blue with Yellow until `/host/new` nudges them to pick.
- **The lamp only brightens.** One warm white in five alpha steps (§4 Heat); no hue change, so a new break
  never reads as cold.
