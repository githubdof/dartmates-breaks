# Photos runbook

What an admin does with break photos: hiding one, purging one, revoking a host, anonymising an account, and the daily
cleanup. Photos spec §5.6 and §10.

Every command below runs from the repository root. `pnpm exec tsx` scripts read `.env.local` unless `ENV_FILE` names
another file (`ENV_FILE=.env.production`); an explicit `DATABASE_URL` wins over the file.

## Hide a photo

```bash
pnpm exec tsx scripts/hide-photo.ts <photo id> "<reason>"
pnpm exec tsx scripts/hide-photo.ts <photo id> "<reason>" --purge
```

Quote a reason of several words. The script prints one line (`hidden <id>`, `already hidden <id>` or `purged <id>`)
and exits 0; bad arguments print the usage and exit 2; any failure exits 1.

**Finding the photo id.** The break page's image URL holds the photo's prefix: in
`…/storage/v1/object/public/photos/<break id>/<22 characters>-640.webp` the prefix is `<break id>/<22 characters>`.
Then:

```bash
psql "$DATABASE_URL" -Atc "select id from break_photos where path = '<prefix>'"
```

**What each mode leaves behind.**

- A hide takes the photo off every page for everyone, writes a `photo.hidden` event, and keeps one copy of its files
  in `photo-archive`, for the holders' records and any report. A hide never removes anything from `photo-archive`: a
  photo the host removed after a claim already has its only copy there.
- `--purge` removes every copy from every bucket and leaves the row with no image (`path` null), with a
  `photo.purged` event recording the reason and the buckets it removed from. Purging a photo hidden earlier removes
  the archive copy the hide kept.

## What still shows after a hide

- Public variants are served with a one-hour cache lifetime, so browsers and the Storage CDN may keep serving a hidden
  photo for up to an hour.
- The link preview is cached five minutes (`s-maxage=300`).
- Social sites keep their own copy of a preview for as long as they choose.

## Response target

Act on a photo report within 24 hours. Act as soon as it is seen when it is apparently illegal content or someone's
personal data.

> These targets are the plan's proposal (ruling 17). **The owner confirms or changes them.**

## Purge and legal reporting

`--purge` is for content that must not be kept. Before purging apparently illegal content, check the duty to report
and preserve it: in the US, providers must report apparent child sexual abuse material to NCMEC's CyberTipline and
preserve it (18 U.S.C. § 2258A). Purging first can breach that duty.

1. Hide the photo without `--purge`.
2. Report it.
3. Get legal advice.
4. Purge only once preservation is no longer required.

This runbook is not legal advice.

## Revoking a host

There is no revoke command yet. Until there is, when a host's role is taken away by SQL (README "Roles"), hide every
photo of their breaks:

```bash
psql "$DATABASE_URL" -Atc "select p.id from break_photos p join breaks b on b.id = p.break_id where b.host_id = '<user id>' and p.hidden_at is null" | while read id; do pnpm exec tsx scripts/hide-photo.ts "$id" "host revoked"; done
```

The revoke command, when it is built, must do the same.

## Account anonymisation

When a host's account is anonymised (spec §5.6), delete their photos and archive copies.

1. Check that no report is open on any of their breaks. Today, with no reports table, that is the moderation inbox;
   once the reports plan lands, it is `breaksUnderHold` (`src/domain/photos/holds.ts`). While a report is open, the
   deletion waits, and is done when the last report on their breaks closes.
2. Purge every photo of every break they hosted that still has files: drafts and deleted drafts included, hidden or
   not.

   ```bash
   psql "$DATABASE_URL" -Atc "select p.id from break_photos p join breaks b on b.id = p.break_id where b.host_id = '<user id>' and p.path is not null" | while read id; do pnpm exec tsx scripts/hide-photo.ts "$id" "account anonymised" --purge; done
   ```

3. Re-run the query: it must print nothing.

A deleted draft's files have no row; the cleanup's orphan rule removes them within a day. Content under a preservation
duty (see "Purge and legal reporting") is not purged until that duty ends.

## Cleanup

`/api/photos/cleanup` runs daily at 09:17 UTC (`vercel.json`), with the same `CRON_SECRET` as `/api/tick`. It works in
batches of 100 for up to four minutes; what it has not reached by then it finishes on the next run (the answer then
says `"done": false`). One run at a time: a second one answers `"locked"`. It removes, in order:

1. **Incoming**: uploads in `incoming` older than 24 hours, and upload grants never used that lapsed more than 24 hours
   ago (used ones stay, as history).
2. **Orphans**: files in `photos`, `photos-draft` and `photo-archive` older than 24 hours that no photo row keeps,
   including a deleted draft's photos and files whose names are no photo's.
3. **Archive retention**: photos removed or hidden more than 180 days ago. The row stays (a Removed mark with no
   image); its archive files go.
4. **Cancelled breaks**: 180 days after a break's latest cancel event, every photo of the break loses its files (the
   rows move to `photo-archive` with no path, and a `photo.expired` event records them).

It never deletes the last copy a row relies on: when the bucket a row relies on lacks a file another bucket holds, the
run copies it into the row's bucket first and deletes nothing for that photo; the next run finds the bucket complete.
A file no bucket holds any more is logged (`"missing"`) and skipped.

Opening a break goes through the same gate: the draft originals and, for a refused open, the `photos` copies are
removed only after a fresh read of the rows, so two opens of one draft racing each other never lose a live photo.

### Two known windows where a removed photo can lose its archive copy

Both are rare and need two things to happen within moments of each other. Each can only lose the **archive copy of a
photo being removed**. A live photo is never affected.

- **Two removals of one claimed photo (a double tap).** If the second removal's copy to `photo-archive` fails or races
  the first while the first removal's archive copy has not committed yet, the second removal's cleanup can delete
  files the first removal's row then names.
- **A removal during cleanup's re-read.** The cleanup re-reads a prefix's rows, then lists and deletes. A removal that
  starts in that gap, on a prefix that also has an orphan archive copy over 24 hours old, can have its fresh archive
  copy deleted.

What a host and the break's holders see in either case: the photo's "Removed" mark with no image. The cleanup logs
`"missing"` for that prefix, and the hide script tolerates the missing files. There is nothing to repair; if a report
needs the image, it is gone.

A Storage call that fails (a listing, a removal, a copy) is logged with its bucket and prefix, counted in `failed`, and
retried on the next run; the rest of the run goes on. When `failed` is above 0 the route answers 500 with the counts,
so the cron shows red in Vercel. Look for the `"error"` log lines of that run.

Rules 3 and 4 skip breaks under hold (`breaksUnderHold` in `src/domain/photos/holds.ts`). It holds nothing today; the
reports plan makes it return every break with an open report on the break or on anything in it.

Each run logs one line, `{"job":"photo-cleanup","ms":…,"result":…}`. To run it by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/photos/cleanup
```
