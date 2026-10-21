# Photos: design

Status: draft for the owner's approval (2026-10-21), revised after a review panel (domain fidelity, security and
abuse, data and performance) and a builder check. The owner left the builder check's three open questions to my
judgment (decisions 14 to 16).
Authority order: this document for photos, then `2026-10-14-mosaic-ui-design.md` (Mosaic) for everything else
on screen, then `2026-10-13-ui-design.md` and `2026-10-13-dart-breaks-platform-design.md` (the platform spec).
§13 lists what this document amends in them.

## 1. Intent

Hosts show the items they are putting up. In the Facebook groups this app replaces, a break post leads with
photos of the darts; a buyer deciding whether to put $5 to $30 into a break wants to see that the item is real,
its condition, and what the top spot wins against 2nd place. Today the app shows no photo anywhere: the board
stands in for one.

The owner moved this plan ahead of minis (2026-10-21) and delegated the UX to a panel of three (a buyer, a host,
and the Mosaic design system with safety and performance). This document is the merged result, with the owner's
ruling on editing (§6).

## 2. Goals, non-goals, anti-goals

**Goals**
- A host adds photos of the items from a phone in seconds, on a poor connection, without saving or opening ever
  waiting on an upload.
- A buyer sees the lead photo where they choose between breaks (the feed, a shared link) and can open every
  photo from the break page, knowing which prize each one shows.
- Buyers who have claimed lines can trust the photos: a removal, a new lead, or a photo moved to another prize
  after the first claim is visible, specific, and recorded.
- One upload pipeline (upload ticket, signed upload, server re-encode, storage, cleanup) that later plans reuse
  for award, shipping and report photos.

**Non-goals (this plan)**
- Award-winner and proof-of-shipping photos (the reputation plan), report attachments (the reports plan), DM
  and thread images (the messaging plan), avatars. They reuse the pipeline; their screens are theirs.
- A "proof shot" slot (a photo with the host's handle and date on paper). Considered, left out. No copy may
  suggest the platform has checked that a photo shows the real item.
- An admin screen. Hiding a photo is a script until the admin plan (§10).
- Photo editing (crop, rotate, filters) beyond the orientation fix the server applies.

**Anti-goals: failures even if it works**
- A photo read as part of the board's language: a flight, the lamp, the kit, a cell, a win.
- The break page's board pushed below the claim bar on a 390 × 664 phone (Mosaic §8 budget).
- A host who loses photos to a draft re-save, a closed tab or a flaky upload.
- A host quietly swapping what a prize appears to be after buyers are in.
- Location or camera data (EXIF and the like) reaching the public.
- Free public file hosting: files reachable on the public bucket that no buyer ever sees.
- The /b/[id] first-load JavaScript growing past its allowance because of the gallery (Mosaic §11).

## 3. Decisions

Marked by who made them: **owner**, **panel** (the reviewers agreed), or **my call** (the reason is given).

1. **Photos are optional** for a draft and for opening (panel). A break with no photo renders exactly as today.
2. **One set of photos per break, up to 8, in order** (my call, from the host seat). Hosts shoot a lot at once;
   per-prize slots slow the composer down. Eight covers the largest real case seen in the groups, a choice of
   sets for the top spot plus a 2nd and a 3rd prize (about five prizes), with room for a condition shot.
3. **Each photo may be tagged with one prize** (top spot, an "or" alternative, 2nd place) or left untagged ("the
   lot"). Tags say what a photo shows (my call).
4. **The first photo is the lead** (panel): the feed card photo, the break page plate, the link preview.
5. **The board stays the hero of the break page**; the lead photo is a plate beside the title (panel).
6. **The photo leads the feed card and the link preview** (my call, from the buyer seat): at feed size every kit
   board looks alike, and the item is what tells breaks apart. The card still shows how full the break is.
7. **The landing hero stays the board of a ran draw** (panel): its job is proving draws are fair.
8. **Photos never take the board's visual language** (panel): §8.0.
9. **After the first claim a host may still add, remove, replace, reorder and retag photos** (owner), with an
   audit trail and a visible notice (§6). Photos freeze when the draw is requested.
10. **Processing**: the phone shrinks each photo before upload as a speed measure; the server re-encodes every
    file with sharp as the security measure (panel). §5.
11. **Draft photos live in a private bucket** and are copied to the public bucket when the break opens (security
    review; this reverses the first draft's single public bucket, which would have given hosts unseen public
    file hosting).
12. **"Claimed" means a line of the break was ever claimed** (my call, from the data review): unpaid claims can be
    released, and the notice and the archive rule must not depend on whether a claim survived. Stored as
    `breaks.first_claimed_at`.
13. **Minis upload no prize photos** (my call, ahead of the minis plan): a mini's prizes are spots in its parent
    break, so its Prizes row shows the parent's lead plate as a link to the parent.
14. **Holders see the photos the host removed** after the first claim, marked "Removed" with the date (my call,
    delegated by the owner; from the domain review): a buyer disputing a swap is the one who needs the evidence.
    Strangers see no removed photo. A photo an admin hides is never shown to anyone. Before removing a photo once
    buyers are in, the host is told holders will still see it. §6.
15. **Photos are added after the title, line count and price are filled** (my call, delegated): a draft cannot
    exist without them, and allowing incomplete drafts would mean database and validation changes for little gain.
    The Photos section sits after the price, the order hosts already fill the form in. §9.
16. **Each prize has a condition: New in box, New (opened), or Used** (my call, delegated; from the domain review):
    buyers ask about condition first, and today it can only go in the description. §7.

## 4. Data

- **`break_photos`**: `id`, `break_id`, `position` (0 = lead), `prize_slot` (nullable: the tag, §4.1), `path`
  (the storage prefix of the variants), `bucket` (`photos-draft` or `photos`), `width`, `height` (of the largest
  variant), `alt` (1–120 characters), `created_by`, `created_at`, `hidden_at` (admin hide), `removed_at`.
  Live rows (neither removed nor hidden) are at most 8 per break and keep positions 0..n−1 with no gaps: every
  remove, hide and reorder renumbers them in one statement, so the lead is always position 0.
- **Why not `break_items.photo_paths`**: `items_mutation_guard` refuses any update to `break_items` after the
  first paid line, and `updateDraft` deletes and reinserts every item row on each save. The column is dropped by
  this plan's migration (my call: an unused column that names the wrong model invites the wrong code).
- **`photo_uploads`** (the upload ticket, from the security review): `id`, `host_id`, `break_id`,
  `incoming_name`, `expires_at`, `consumed_at`. Issued with the signed upload URL; consumed exactly once by the
  finalise step (§5.3). The client only ever sends the ticket id, never a path.
- **`breaks.first_claimed_at`**: set by the claim commands the first time any line is claimed; never cleared.
- **`breaks.photos_updated_at`** and **`breaks.photos_updated_note`**: set in the same transaction as a change
  that counts (§6), the note being the specific sentence of §6.
- **`photo_notices_seen`** (`user_id`, `break_id`, `seen_at`): written by a server action the break page's client
  fires after it renders for a holder, only when `seen_at` is older than `photos_updated_at`. Never written
  during a server render.
- **Concurrency.** Every photo command locks the break row (`SELECT … FOR UPDATE`, as `assertHostOf` already
  does) before checking ownership, status and the cap, so a finalise cannot slip past `requestDraw`, and two
  finalises cannot both take position 7. The status trigger (below) reads the break `FOR SHARE`. sharp runs
  before the lock; if the insert is then refused, the variants are deleted.
- **Status guard**: photo rows may change while the break is `draft`, `open` or `filled`. From `drawing` on they
  are frozen, by a trigger in the style of the existing guards.
- **Audit**: one `events` row per committed action (not per drag step): `photo.added`, `photo.removed`,
  `photo.reordered` (with the final order), `photo.retagged`, `photo.hidden`, with ids, positions, prize slots
  and the previous lead. Audit-only types are inserted with `processed_at` set, so they never sit in the
  unprocessed index. Storage paths in payloads are admin-only and never rendered.

### 4.1 Prize slots: a stable key for tags
Prizes have no order column and are rebuilt on every draft save, so a tag cannot point at a prize row or its
position: deleting the first "or" alternative would move the Chronos photo onto the Phantom. Each prize gets a
**`slot_key`** uuid, made by the composer when the prize field is added and carried in a hidden input. `updateDraft`
updates prizes whose slot it already has, inserts new ones and deletes only the removed ones (allowed while the
break is a draft). `break_photos.prize_slot` holds the slot key; a removed slot clears the tag. After the first paid
line prizes are add-only, so slots are stable.

## 5. Upload pipeline

### 5.1 In the browser (speed, not security)
1. "Add photos" opens a file input accepting JPEG, PNG, WebP and HEIC, multiple. iOS converts HEIC through the
   picker.
2. Each file is decoded, shrunk to at most 2048 px on the long edge and re-encoded to JPEG at quality about 0.85
   before upload: a 12 MB phone photo becomes well under 1 MB.
3. A file the browser cannot decode (HEIC on a desktop browser) is refused on the spot: "This photo can't be read
   here. Pick a JPEG or PNG." No HEIC decoding on the server (my call).
4. A tile appears at once from a local preview, with a progress ring; two uploads run at a time.

### 5.2 The ticket and the upload
1. A host-only server action locks the break, checks owner, status and the cap (counting live photos and
   unconsumed tickets), applies the rate limits, writes a `photo_uploads` ticket and returns the ticket id and a
   signed upload URL into the private **`incoming`** bucket, no overwrite. The ticket is valid 5 minutes, checked at
   finalise (Supabase fixes a signed upload URL's own lifetime at 2 hours, so the ticket is the real limit).
2. Rate limits (the existing `rate_limits` table), on both issuing and finalising: 30 an hour and 100 a day per
   host, and at most 8 unconsumed tickets per host.
3. The browser uploads straight to Storage.

### 5.3 Finalise (Node, a dedicated route handler)
`/api/photos/finalise` (own `maxDuration` about 30 s and memory setting, so sharp is not bundled into page
functions; sharp is a direct, pinned dependency; `sharp.concurrency(1)`, cache off). With the ticket id and the
chosen tag, it:
1. checks the ticket belongs to the caller, matches the break, is unexpired and unconsumed;
2. downloads the incoming file with a byte cap, checks its magic bytes are JPEG, PNG or WebP, then decodes with
   `sharp(buf, { limitInputPixels: 12e6, failOn: "error", pages: 1, animated: false })` and asserts the decoded
   format is one of the three; libvips never picks a format on its own (no SVG, TIFF, PDF, GIF, HEIF);
3. applies the orientation and writes three WebP variants, 160, 640 and 1600 px on the long edge, from one
   pipeline, with no metadata, an explicit content type and `cacheControl` of one hour;
4. writes them to **`photos-draft`** while the break is a draft, else to **`photos`**, under
   `{breakId}/{random}-{width}.webp` (128 bits of randomness);
5. locks the break, re-checks owner, status and cap, consumes the ticket, inserts the `break_photos` row, its
   event and any notice change (§6) in one transaction;
6. deletes the incoming file. If step 5 refuses, it deletes the variants.

The tile shows "Finishing…" while this runs (a cold start can add up to about a second), then swaps to the
processed image in place. Failures show the reason and Retry, with one automatic retry when the browser comes
back online; other photos are unaffected. Leaving with uploads in flight asks the browser to confirm.

### 5.4 Opening a break
Opening copies each draft photo's variants from `photos-draft` to `photos` (idempotent, before the open
transaction), then the open transaction switches the rows' `bucket` to `photos`. If a copy fails, opening fails
with "Photos are still being prepared. Try again." and nothing changes.

### 5.5 Buckets, reads and policies
- **`incoming`**: private, 5 MB per file, image types only, signed uploads only.
- **`photos-draft`**: private. The host sees draft photos through signed URLs valid 10 minutes.
- **`photos`**: public read by URL only, `image/webp` only. Not listable.
- **`photo-archive`**: private, service role only.
- `storage.objects` has **no** policies for the anon or authenticated roles on any of the four buckets; every
  write goes through the service role or a signed upload URL. Storage is enabled in `supabase/config.toml` (it
  is off today), the buckets are created locally and in production by the plan, the Storage host joins the
  content-security policy (`img-src`, `connect-src`), and the local preflight gains a Storage probe.
- Images render with plain `<img>`, `srcset` over the three variants, explicit width and height, in a fixed box
  with a solid `--board-wall-2` placeholder. Not `next/image`: its optimiser is billed per transformation and its
  client code would cost /b/[id] budget.

### 5.6 Cleanup
A **separate daily cron route** (not the minute tick, which runs draws inside transactions), in batches, outside
any transaction, with its own lock:
- `incoming` files and unconsumed tickets older than 24 hours;
- `photos` and `photos-draft` objects with no live or archived row, older than 24 hours (a crash between the
  variants and the insert);
- the photos of deleted drafts (this plan adds **Delete draft**, §9, since no delete exists today);
- `photo-archive` past 180 days, except while a report on that break is open (platform spec §12 defers deletion
  the same way);
- a cancelled break's photos 180 days after cancellation.
Account anonymisation (the admin runbook) deletes the host's photos and archive, deferred while a report is open.

## 6. Editing after buyers are in (the owner's ruling)

- Until the draw is requested, the host may add, remove, reorder and retag photos and change the lead, including
  after lines are paid. "Edit photos" opens the composer's strip in a sheet from the break page's host menu.
- **Changes that count**, once `first_claimed_at` is set: removing a photo, a new lead, and a retag that moves a
  photo to a different prize (moving the top spot's photo to 2nd changes what the top spot appears to win).
  Adding a photo and a reorder that keeps the lead do not count. An admin hide does not count (it is moderation,
  not the host's change).
- **The notice is specific**: "Lead photo replaced", "Top-spot photo removed", "A photo moved from Top spot to
  2nd place", or "Photos changed" for several at once, with the local time.
  - **Holders** see it above the fold: an "Updated" label on the plate, and the sentence in the Prizes block. On
    /me the holder's card shows the sentence until they have seen it (`photo_notices_seen`).
  - **Everyone else** sees it at the foot of the Prizes block, for the rest of the break's life.
  - When the messaging plan lands, the same change posts a system line in the break's thread.
- **Removed photos, for holders** (decision 14): a photo removed after `first_claimed_at` moves to
  `photo-archive` and stays visible to the break's holders and its host, at the foot of the Prizes block, as a
  plate marked "Removed Oct 21" (the local date), served through signed URLs valid 10 minutes. Strangers, the feed
  and the link preview never show it. Once the archive drops it (§5.6), the mark stays with no image. A photo
  removed before any claim is deleted outright. A photo an admin hides is never shown to anyone, holders included.
- **The host is told first**: removing a photo once `first_claimed_at` is set asks for confirmation: "Buyers in
  this break will still see this photo, marked Removed." (The no-confirm Undo of §9 applies before any claim.)
- From `drawing` on, photos are frozen: the result page shows what was promised.

## 7. Prize details

- The Prizes block (§8.2) shows each prize's variant options when the item has them (`variant_schema`, e.g.
  "18 or 20 g soft; 22, 24 or 26 g steel"). The composer does not collect variants today; showing them needs no
  new field.
- **Condition per prize** (decision 16): `break_items.condition`, one of `new_in_box`, `new_opened`, `used`,
  nullable for breaks made before this plan. The composer asks for it beside each prize ("New in box", "New,
  opened", "Used"; required for new breaks). It shows in the Prizes block after the item name and is frozen with
  the item by `items_mutation_guard` after the first paid line.

## 8. Surfaces

### 8.0 The plate
Every photo on a board-coloured surface sits in a **plate**: the image cropped square (`object-fit: cover`) or at
4:3 where stated, inside a 3 px `--board-wall-2` mat and a 1 px `--board-steel` keyline. A plate never takes the
kit frame, the lamp, a flight colour or a cell's size (no plate is 44.75 px or another board pitch), never
touches or overlaps the board frame, and never appears in the caller banner or the reveal. The image is never
tinted or desaturated. On paper surfaces (the composer, /me, the host dashboard) the mat is dropped and the
keyline is `--wire-strong`.

### 8.1 Feed card and host profile cards
The lead photo replaces the kit thumbnail in its slot, as a plate at the thumbnail's size. A 48 px kit board
overlaps the plate's bottom-right corner, so the card still shows how full the break is; the "N to go" count stays
in the caption. The thumbnail rules of Mosaic and the Plan C deferred findings apply to that small board. A card
for a break with no photo is unchanged. Card photos are decorative (`alt=""`): the caption names the break.

### 8.2 Break page
- **Above the fold**: the lead as a 64 px square plate (72 px with mat and keyline) at the right of the title,
  top-aligned, inside the title's 76 px band. The media row below runs the full width, so it never wraps because
  of the plate. A count shows on the plate as text ("5 photos"); holders see "Updated" there after a change that
  counts. The plate is a button named "Prize photos, 5"; it opens the viewer at the lead. No plate without photos.
  The layout test checks the longest title and handle at 390 and 360.
- **Below the board, before Details**: a **Prizes** block, open, not folded. One row per place in order (top spot,
  each "or" alternative, 2nd place): the place word, the item name, its variants (§7), and up to three 64 px
  plates of the photos tagged to it; then "Also in the photos" for untagged ones. A place with no tagged photo
  shows its name only. The notice of §6 sits in this block. This also moves the prizes out of the collapsed
  Details fold, where buyers had to dig for what the top spot wins.

### 8.3 The viewer
A native `<dialog>` shown modally, one photo at a time, with a scroll-snap strip for swiping, 44 px Previous and
Next buttons, arrow keys and Escape, through all photos in order. The caption reads the tag and the position:
"Top spot: Taylor Chronos 24g. Photo 2 of 5." Focus moves into the dialog and returns to the button that opened
it; each change is announced politely. Reduced motion: no smooth scrolling, no zoom. Its code is not in the first
load of /b/[id]: the plate is a server-rendered button whose small client island loads the viewer by dynamic import on
the first tap, preloading on hover, focus or touch (Plan D ruling: an invoker-command path would still need the same
import for the viewer's code, so it adds a second path without saving bytes); the photos load only when it opens.

### 8.4 Other surfaces
- **Landing hero**: unchanged. The feed cards under it follow §8.1.
- **Pay sheet**: a 40 px plate of the lead beside the break's title.
- **Result page**: the board and the reveal unchanged. Below the full order, the Prizes block as on the break page,
  frozen; it is the record the winner's variant pick and any later shipping dispute point to.
- **/me**: a 40 px plate of the lead on each card, and the notice of §6.
- **Host dashboard (/host)**: a 40 px plate on each row.
- **Link preview**: the lead as a plate beside the board and caption; a ran break keeps the board with its bulls
  in front and the plate smaller. `ogModel` gains `photo: { id, path } | null`, from live rows in `photos` only.
  The route builds the URL from a fixed origin and the `photos` bucket, checks the path against a strict pattern,
  fetches with a timeout and a byte cap, and hands the renderer a data URI so it makes no fetch of its own; on any
  failure it renders without the photo. `og.test.ts` gains `photo` in its key list and asserts that a hidden or
  removed photo, or a draft's, yields `photo: null`. The privacy guarantee is unchanged.

## 9. The composer

- A **Photos** strip after the price fields in /host/new and the draft editor, with the hint "Photos of the items.
  Rules and specs go in the description." (decision 15). Until the title, line count and price are valid, "Add
  photos" is disabled with the reason beside it: "Add a title and a price first." The first photo then creates the
  draft from the form as it stands.
- The composer gives the new break its id when it opens; `createDraft` accepts that id and is idempotent, so the
  first photo, a Save pressed while it uploads, and a reload all land on one draft. After the draft exists the page
  moves to the draft's edit address.
- Tiles in order, the first marked "Lead". Each tile's menu: **Make lead**, **Tag** (the prizes typed in the form,
  by slot, or "No tag"), **Describe** (the alt text, prefilled from the tag's item name or the title, editable,
  1–120 characters), **Move earlier / Move later** (for keyboard and screen-reader users; dragging also works),
  **Remove** (no confirm; Undo for 8 seconds, as in the ledger).
- Opening a break with no photo shows one quiet line above Open break: "Buyers see the lead photo first in the
  feed." It never blocks.
- **Delete draft** joins the draft editor and /host (a confirm, then the draft, its prizes, items and photos go;
  its events stay). Drafts never had a delete; photos make one necessary.

## 10. Safety and moderation

- Who uploads: the break's host only, in this plan.
- Every published file is a server re-encode with no metadata (§5.3). The client shrink is not a control.
- **Hiding a photo** until the admin plan: `scripts/hide-photo.ts <photo id> <reason>` sets `hidden_at`, deletes
  the public variants, keeps a copy in the archive and writes `photo.hidden`. With `--purge` it deletes every copy,
  the archive included (for content that must not be kept, with a note on legal reporting duties in the runbook).
  Public variants carry a one-hour cache lifetime and the link preview five minutes, so a hidden photo can still be
  served from a cache for up to an hour; the runbook states this and a response target. Revoking a host hides all
  their photos.
- Alt text and all photo copy join the copy audit (no heat words, no "You won", nothing implying the platform
  verified a photo).

## 11. Budgets and tests

- **Mosaic §11**: the plate and the Prizes block are server-rendered and the viewer stays out of the first load.
  This plan first restores a working measurement of /b/[id] first-load JS under Turbopack (the Plan C script read
  `app-build-manifest.json`, which Turbopack no longer writes), then holds the existing allowance. The 390 × 664
  layout test gains the plate case at 390 and 360.
- **Unit and domain**: the finalise steps (magic bytes, a polyglot and an SVG refused, the pixel limit, all three
  variants free of EXIF, XMP, IPTC, ICC and comments, from fixtures that bypass the browser); the ticket (another
  host's ticket, a consumed one, an expired one, a forged path); the commands (the cap, positions without gaps,
  the status freeze, tags kept by slot across a draft save, one event per action, exactly which changes set the
  notice); `ogModel`.
- **Concurrency suite**: two finalises racing for the eighth place; a finalise racing `requestDraw`; a reorder
  racing a remove.
- **E2E** (local Storage enabled): a host adds photos and opens the break; the photo shows on the feed card, the
  plate and the Prizes block, served from `photos`; a draft photo is not readable without the host's signed URL;
  the viewer works by keyboard and returns focus; after a buyer claims, the host replaces the lead and the buyer
  sees "Updated" on the plate above the fold and "Lead photo replaced" in the Prizes block and on /me, where it clears
  once seen, and the removed lead marked
  "Removed" in the Prizes block, which a stranger does not see; a prize's condition shows in the Prizes block; a
  draft's photos and tags survive
  a re-save that removes an "or" alternative; Delete draft removes its photos; axe on every touched page.

## 12. Left to the builder

- Exact pixel geometry inside the stated sizes (the corner board offset, the count's position), checked by the
  layout tests.
- The upload concurrency and retry timing beyond §5.
- Whether "replace" is its own menu item or a remove and an add (the notice reads "Lead photo replaced" when a
  removal and a new lead land within one edit session either way).
- How the restored budget measurement works.

## 13. What this amends

- **Platform spec §4.0** "no images": lifted. **§6 Data** `break_items … photo_paths[]`: dropped; photos live in
  `break_photos`. **§7** "Edits while open: title/description/photos": photos are editable until the draw is
  requested, with the audit and notice of §6. **§10 Safety** pipeline: kept, with the client shrink, the ticket,
  the four buckets and the variants of §5. **§13 Pages** "above the fold: photo, title, …": the photo is the plate
  of §8.2, not a lead image above the board.
- **UI design §5.4** "88-pt square thumbnail left … further photos live in the details fold": replaced by §8.2.
  **§5.6** "No photo field until the storage plan": replaced by §9. **§8** "photos (storage plan; fallback is the
  mini grid thumbnail)": delivered; the fallback stays for breaks without photos.
- **Mosaic §8** feed card "the framed thumbnail is the fill": with a photo, the corner board of §8.1 carries the
  fill. **§8** break page "the photo layout arrives with the storage plan": §8.2. **§6** link preview: `ogModel`
  gains `photo` (§8.4). **§11** "no texture image": item photos are content, not texture; the rule stands for the
  board.
