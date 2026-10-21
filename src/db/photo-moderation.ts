import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";

/**
 * Lets this transaction hide photos and drop their files on a break whose photos are frozen (drawing, drawn,
 * cancelled): migration 0005's break_photos_guard then allows hidden_at, position, bucket and path (to null), and
 * nothing else (photos spec §10). For hidePhoto and the cleanup only; never on a host's request.
 */
export async function allowPhotoModeration(tx: Tx): Promise<void> {
  await tx.execute(sql`select set_config('breaks.photo_moderation', 'on', true)`);
}
