"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { getCaller } from "@/auth/session";
import { action, type ActionFailure, type ActionResult } from "@/lib/action";
import { parseInput } from "@/lib/parse-input";
import { DomainError } from "@/domain/errors";
import {
  describePhoto, issueUploadTicket, markPhotoNoticeSeen, removePhoto, reorderPhotos, retagPhoto,
} from "@/domain/photos/commands";
import { dropUploadTicket, peekPhoto } from "@/domain/photos/peek";
import { MAX_PHOTOS, type PhotoLocation } from "@/domain/photos/types";
import { copyVariants, removeVariants } from "@/photos/variants";
import { BUCKETS } from "@/storage/buckets";
import { photoStorage } from "@/storage/photo-storage";

// The photo actions (photos spec §5.2, §6). No Storage call runs inside a transaction (plan ruling 28); every file
// move writes the new copy, commits, then deletes the old one.

const INTERNAL: ActionFailure = { ok: false, code: "INTERNAL", message: "Something went wrong. Please try again." };
const COULD_NOT_REMOVE: ActionFailure = { ok: false, code: "INTERNAL", message: "Couldn't remove the photo. Try again." };
const STALE = "The photos just changed. Try again.";
const ALT = "Describe the photo in 1 to 120 characters.";

const breakId = z.uuid({ error: "Break not found" });
const photoId = z.uuid({ error: "Photo not found" });
const slot = z.uuid({ error: "Pick one of this break's prizes, or no tag." }).nullable();
const alt = z.string({ error: ALT }).trim().min(1, { error: ALT }).max(120, { error: ALT });
const order = z.array(z.uuid({ error: STALE }), { error: STALE }).min(1, { error: STALE }).max(MAX_PHOTOS, { error: STALE })
  .refine((ids) => new Set(ids).size === ids.length, { error: STALE });

const log = (what: string) => (e: unknown) => console.error(`photos: ${what}`, e);

function revalidate(id: string): void {
  revalidatePath(`/b/${id}`);
  revalidatePath("/host");
}

/** Raised inside the removal when the photo must go to the archive and its copy is not there yet (plan ruling 24). */
class ArchiveFirst extends DomainError {
  constructor() { super("ARCHIVE_FIRST", "Couldn't remove the photo. Try again.", 409); }
}

/**
 * One upload for the break's host (spec §5.2): the upload is granted and committed first, then the upload URL is
 * signed outside any transaction (plan ruling 28). If signing fails the grant is dropped again.
 */
export async function requestPhotoUpload(id: string): Promise<ActionResult<{ ticketId: string; uploadUrl: string; token: string }>> {
  const v = parseInput(breakId, id);
  if (!v.ok) return v;
  const r = await action((tx, c) => issueUploadTicket(tx, c, { breakId: v.data, now: new Date() }));
  if (!r.ok) return r;
  try {
    const signed = await photoStorage().createSignedUpload(r.data.incomingName);
    return { ok: true, data: { ticketId: r.data.ticketId, uploadUrl: signed.url, token: signed.token } };
  } catch (e) {
    log("signing an upload")(e);
    // A failure here is logged by `action`; an unsigned grant also lapses on its own after 5 minutes.
    await action((tx, c) => dropUploadTicket(tx, c, r.data.ticketId));
    return INTERNAL;
  }
}

/**
 * Removes a photo (spec §6). After any claim its files are copied to `photo-archive` before the removal commits, and
 * a removal never commits without that copy (plan ruling 24); the old copy goes after the commit.
 */
export async function removePhotoAction(id: string): Promise<ActionResult<void>> {
  const v = parseInput(photoId, id);
  if (!v.ok) return v;
  const storage = photoStorage();
  const peek = () => db.transaction((tx) => peekPhoto(tx, v.data));
  let pre: Awaited<ReturnType<typeof peekPhoto>>;
  try {
    pre = await peek();
  } catch (e) {
    log("reading the photo")(e);
    return INTERNAL;
  }

  // The archive copy, made with the break unlocked. `from` is the bucket it was copied from.
  let archived: { prefix: string; from: PhotoLocation } | null = null;
  const archive = async (p: typeof pre): Promise<boolean> => {
    if (!p || !p.live || p.prefix === null) return false;
    try {
      await copyVariants(storage, p.prefix, p.location, BUCKETS.archive);
      archived = { prefix: p.prefix, from: p.location };
      return true;
    } catch (e) {
      log("copying to the archive")(e);
      await removeVariants(storage, BUCKETS.archive, p.prefix).catch(log("removing a partial archive copy"));
      return false;
    }
  };
  const dropArchive = async () => {
    if (archived) await removeVariants(storage, BUCKETS.archive, archived.prefix).catch(log("removing the archive copy"));
  };

  // The host (or an admin) removing a live photo of a claimed break: archive first. Anyone else gets the refusal.
  const caller = await getCaller();
  const mine = caller !== null && (pre?.hostId === caller.id || caller.role === "admin");
  if (mine && pre?.live && pre.claimed && !(await archive(pre))) return COULD_NOT_REMOVE;

  const attempt = () => action(async (tx, c) => {
    const out = await removePhoto(tx, c, { photoId: v.data, now: new Date() });
    if (out.archive && !archived) throw new ArchiveFirst(); // rolls back: the first claim landed after the read
    return out;
  });
  let r = await attempt();
  if (!r.ok && r.code === "ARCHIVE_FIRST") {
    let fresh: typeof pre;
    try {
      fresh = await peek();
    } catch (e) {
      log("reading the photo")(e);
      return COULD_NOT_REMOVE;
    }
    if (!(await archive(fresh))) return COULD_NOT_REMOVE;
    r = await attempt();
    if (!r.ok && r.code === "ARCHIVE_FIRST") {
      await dropArchive();
      return COULD_NOT_REMOVE;
    }
  }

  let gone: { prefix: string; from: PhotoLocation; archive: boolean; breakId: string };
  if (r.ok) {
    gone = { ...r.data, breakId: pre?.breakId ?? "" };
  } else {
    if (!archived) return r;
    const a: { prefix: string; from: PhotoLocation } = archived;
    if (r.code !== "INTERNAL") {
      await dropArchive(); // a refusal: the transaction rolled back
      return r;
    }
    // INTERNAL: the commit may have landed. Re-read: still live, it did not; gone, it did.
    let after: typeof pre;
    try {
      after = await peek();
    } catch (e) {
      log("re-reading the photo")(e);
      return r;
    }
    if (after?.live) {
      await dropArchive();
      return r;
    }
    gone = { prefix: a.prefix, from: a.from, archive: true, breakId: after?.breakId ?? pre?.breakId ?? "" };
  }

  if (!gone.archive && archived) {
    // Cannot happen (first_claimed_at is never cleared): nothing names the archive copy.
    console.error("photos: an archive copy was made for a removal that did not archive");
    await dropArchive();
  }
  await removeVariants(storage, gone.from, gone.prefix).catch(log(`removing ${gone.from} variants`));
  if (gone.breakId) revalidate(gone.breakId);
  return { ok: true, data: undefined };
}

/** Puts the break's live photos in `order`; the lead is order[0]. */
export async function reorderPhotosAction(id: string, ids: string[]): Promise<ActionResult<void>> {
  const v = parseInput(z.object({ breakId, order }), { breakId: id, order: ids });
  if (!v.ok) return v;
  const r = await action((tx, c) => reorderPhotos(tx, c, { breakId: v.data.breakId, order: v.data.order, now: new Date() }));
  if (r.ok) revalidate(v.data.breakId);
  return r;
}

/** Tags a photo with one of the break's prizes, or with none (null). */
export async function retagPhotoAction(id: string, to: string | null): Promise<ActionResult<void>> {
  const v = parseInput(z.object({ photoId, slot }), { photoId: id, slot: to });
  if (!v.ok) return v;
  const r = await action(async (tx, c) => {
    await retagPhoto(tx, c, { photoId: v.data.photoId, slot: v.data.slot, now: new Date() });
    return (await peekPhoto(tx, v.data.photoId))?.breakId;
  });
  return done(r);
}

/** Sets a photo's description (alt text, 1 to 120 characters). */
export async function describePhotoAction(id: string, text: string): Promise<ActionResult<void>> {
  const v = parseInput(z.object({ photoId, alt }), { photoId: id, alt: text });
  if (!v.ok) return v;
  const r = await action(async (tx, c) => {
    await describePhoto(tx, c, { photoId: v.data.photoId, alt: v.data.alt });
    return (await peekPhoto(tx, v.data.photoId))?.breakId;
  });
  return done(r);
}

/** Records that the caller saw the break's latest photo change. Revalidates nothing. */
export async function markPhotoNoticeSeenAction(id: string): Promise<ActionResult<void>> {
  const v = parseInput(breakId, id);
  if (!v.ok) return v;
  return action((tx, c) => markPhotoNoticeSeen(tx, c, { breakId: v.data, now: new Date() }));
}

function done(r: ActionResult<string | undefined>): ActionResult<void> {
  if (!r.ok) return r;
  if (r.data) revalidate(r.data);
  return { ok: true, data: undefined };
}
