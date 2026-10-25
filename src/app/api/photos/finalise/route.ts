import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { getCaller } from "@/auth/session";
import { DomainError, NotOpen, PhotosNotReady, UploadExpired, UploadUsed } from "@/domain/errors";
import { recordProcessedPhoto } from "@/domain/photos/commands";
import { peekUploadTicket } from "@/domain/photos/peek";
import type { PhotoLocation } from "@/domain/photos/types";
import type { Caller } from "@/domain/types";
import { parseInput } from "@/lib/parse-input";
import { MAX_INCOMING_BYTES, UnsupportedImage, processPhoto } from "@/photos/process";
import { photoSrc } from "@/photos/urls";
import { copyVariants, newPhotoPrefix, putVariants, removeVariants } from "@/photos/variants";
import { BUCKETS, type BucketName } from "@/storage/buckets";
import { StorageNotFound, TooLarge, photoStorage, type PhotoStorage } from "@/storage/photo-storage";

// POST /api/photos/finalise (photos spec §5.3): turns the caller's upload in `incoming` into three re-encoded variants
// and records the photo. No Storage call runs inside a transaction (plan ruling 28). The rule for every file: write
// the new copy, commit, then delete the old one; when a commit may have landed without saying so, re-read before
// deleting anything.

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const REFUSED = "This request was refused.";
/** The body is three short fields: anything past 2 KB is refused unread (plan ruling 30). */
const MAX_BODY_BYTES = 2048;

const Body = z.object({
  ticketId: z.uuid({ error: "This upload could not be found. Try again." }),
  slot: z.uuid({ error: "Pick one of this break's prizes, or no tag." }).nullable(),
  alt: z.string({ error: "Describe the photo in 1 to 120 characters." }).trim()
    .min(1, { error: "Describe the photo in 1 to 120 characters." }).max(120, { error: "Describe the photo in 1 to 120 characters." }),
});

const reply = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const log = (what: string) => (e: unknown) => console.error(`finalise: ${what}`, e);

/** Every failure as the wire answers it (plan Task 6, Step 9). */
function failure(e: unknown): Response {
  if (e instanceof DomainError) return reply(e.status, { error: e.message });
  if (e instanceof UnsupportedImage) return reply(415, { error: "This photo can't be used. Pick a JPEG, PNG or WebP." });
  if (e instanceof TooLarge) return reply(413, { error: "This photo is over 5 MB. Pick a smaller one." });
  if (e instanceof StorageNotFound) return reply(409, { error: "The photo didn't arrive. Try again." });
  console.error(e);
  return reply(500, { error: "Something went wrong. Please try again." });
}

/** The body as text, or null once it passes `cap` bytes (the stream is cancelled, the rest never read). */
async function readCapped(req: Request, cap: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const isJson = (contentType: string | null) => contentType?.split(";")[0].trim().toLowerCase() === "application/json";

export async function POST(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  if (origin !== null && origin !== new URL(req.url).origin) return reply(403, { error: REFUSED });
  if (!isJson(req.headers.get("content-type"))) return reply(415, { error: REFUSED });
  const text = await readCapped(req, MAX_BODY_BYTES);
  if (text === null) return reply(413, { error: REFUSED });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return reply(400, { error: REFUSED });
  }

  const caller = await getCaller();
  if (!caller) return reply(401, { error: "Sign in to continue" });
  if (caller.banned) return reply(403, { error: "This account is suspended" });
  const parsed = parseInput(Body, raw);
  if (!parsed.ok) return reply(400, { error: parsed.message });
  const input = parsed.data;

  // A refusal here (missing, or another user's upload) returns before any Storage call: their file is never touched.
  let upload: Awaited<ReturnType<typeof peekUploadTicket>>;
  try {
    upload = await db.transaction((tx) => peekUploadTicket(tx, caller, { ticketId: input.ticketId, now: new Date() }));
  } catch (e) {
    return failure(e);
  }

  const storage = photoStorage();
  try {
    return await finalise(storage, caller, input, upload);
  } catch (e) {
    return failure(e);
  } finally {
    await storage.remove(BUCKETS.incoming, [upload.incomingName]).catch(log("removing the incoming file"));
  }
}

type Input = z.infer<typeof Body>;
type Upload = Awaited<ReturnType<typeof peekUploadTicket>>;

async function finalise(storage: PhotoStorage, caller: Caller, input: Input, upload: Upload): Promise<Response> {
  if (upload.consumed) throw new UploadUsed();
  if (upload.expired) throw new UploadExpired();
  const putBucket: "photos-draft" | "photos" =
    upload.breakStatus === "draft" ? BUCKETS.draft
    : upload.breakStatus === "open" || upload.breakStatus === "filled" ? BUCKETS.public
    : (() => { throw new NotOpen(upload.breakStatus); })();

  const body = await storage.download(BUCKETS.incoming, upload.incomingName, MAX_INCOMING_BYTES);
  const processed = await processPhoto(body);
  const prefix = newPhotoPrefix(upload.breakId);
  const drop = (bucket: BucketName) => removeVariants(storage, bucket, prefix).catch(log(`removing ${bucket} variants`));
  try {
    await putVariants(storage, putBucket, prefix, processed.variants);
  } catch (e) {
    await drop(putBucket); // nothing names them yet
    throw e;
  }

  const record = (location: "photos-draft" | "photos") => db.transaction((tx) => recordProcessedPhoto(tx, caller, {
    ticketId: input.ticketId, prefix, location, width: processed.width, height: processed.height, slot: input.slot, alt: input.alt, now: new Date(),
  }));
  /**
   * A record that failed with something other than a refusal may still have committed: re-read the upload. Used, the
   * row names `kept`'s copies, so only `others` go; unused, every copy goes; the re-read failing, nothing goes (Task
   * 11's cleanup removes unnamed files after 24 hours).
   */
  const settleUnknown = async (e: unknown, kept: BucketName, others: BucketName[]): Promise<never> => {
    let consumed: boolean;
    try {
      consumed = (await db.transaction((tx) => peekUploadTicket(tx, caller, { ticketId: input.ticketId, now: new Date() }))).consumed;
    } catch (again) {
      log("re-reading the upload")(again);
      throw e;
    }
    await Promise.all((consumed ? others : [kept, ...others]).map(drop));
    throw e;
  };

  let recorded: { photoId: string; location: PhotoLocation };
  try {
    recorded = await record(putBucket);
  } catch (e) {
    if (e instanceof PhotosNotReady && putBucket === BUCKETS.draft) {
      // The break opened while the photo was processing (plan ruling 7): publish the variants, record once more.
      recorded = await recordAfterOpen(storage, prefix, drop, () => record(BUCKETS.public), settleUnknown);
    } else if (e instanceof DomainError) {
      await drop(putBucket);
      throw e;
    } else {
      return settleUnknown(e, putBucket, []);
    }
  }

  revalidatePath(`/b/${upload.breakId}`);
  const src = await photoSrc(storage, { location: recorded.location, prefix, width: processed.width, height: processed.height, alt: input.alt }, 160);
  return reply(200, { photoId: recorded.photoId, src });
}

/** Copies the draft variants to `photos` and records there; the draft copies go once the row names `photos`. */
async function recordAfterOpen(
  storage: PhotoStorage,
  prefix: string,
  drop: (bucket: BucketName) => Promise<void>,
  recordPublic: () => Promise<{ photoId: string; location: PhotoLocation }>,
  settleUnknown: (e: unknown, kept: BucketName, others: BucketName[]) => Promise<never>,
): Promise<{ photoId: string; location: PhotoLocation }> {
  try {
    await copyVariants(storage, prefix, BUCKETS.draft, BUCKETS.public);
  } catch (e) {
    log("copying to photos")(e);
    await Promise.all([drop(BUCKETS.draft), drop(BUCKETS.public)]);
    throw new PhotosNotReady();
  }
  let recorded: { photoId: string; location: PhotoLocation };
  try {
    recorded = await recordPublic();
  } catch (e) {
    if (!(e instanceof DomainError)) return settleUnknown(e, BUCKETS.public, [BUCKETS.draft]);
    await Promise.all([drop(BUCKETS.draft), drop(BUCKETS.public)]);
    throw e;
  }
  await drop(BUCKETS.draft);
  return recorded;
}
