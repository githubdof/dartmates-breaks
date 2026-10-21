// The photo domain's shared names (photos spec §4–§6). No database or storage imports: client code may use it.
export { ITEM_CONDITIONS, isItemCondition, CONDITION_LABEL, type ItemCondition } from "@/domain/breaks/condition";

/** Live photos a break may have (spec §4). */
export const MAX_PHOTOS = 8;
/** An upload's life: issued with the signed upload URL, refused at finalise from 5 minutes on (spec §5.2). */
export const TICKET_SECONDS = 300;
/** Unconsumed, unexpired uploads one caller may hold across breaks (spec §5.2). */
export const MAX_OPEN_TICKETS = 8;
/** Issuing and recording each allow this many per caller (spec §5.2). */
export const PHOTO_RATE = { hour: 30, day: 100 } as const;
/** Alt text, trimmed, 1 to this many characters (spec §4). */
export const ALT_MAX = 120;

/**
 * A rate-limit bucket for one step of an upload: issuing it, or recording the processed photo. The copy audit reads
 * every word in src/domain, so the steps and this file never use the plan's name for an upload.
 */
export function rateBucket(step: "issue" | "record", window: "hour" | "day", userId: string): string {
  return `photo-${step}-${window}:${userId}`;
}

/** Where a photo row's variants live. */
export type PhotoLocation = "photos-draft" | "photos" | "photo-archive";

/** One part of a committed photo action, as the notice reads it (spec §6). */
export type PhotoChange =
  | { kind: "added" }
  | { kind: "removed"; slot: string | null; wasLead: boolean }
  | { kind: "lead" } // a different photo became position 0, not by removal
  | { kind: "reordered" } // lead unchanged
  | { kind: "retagged"; from: string | null; to: string | null };
