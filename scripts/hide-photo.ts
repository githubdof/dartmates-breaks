// Usage: pnpm exec tsx scripts/hide-photo.ts <photo id> <reason> [--purge]   (ENV_FILE picks the env file, default
// .env.local; an explicit DATABASE_URL wins over it). Hides a photo from everyone and moves its files to photo-archive;
// with --purge, deletes every copy. See docs/runbooks/photos.md before purging. Exit 0 with one line, 2 on bad
// arguments, 1 on any failure.
import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local", quiet: true });
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import type { TxRunner } from "../src/db/client";

const USAGE = "Usage: pnpm exec tsx scripts/hide-photo.ts <photo id> <reason> [--purge]";
const SAID = { hidden: "hidden", "already-hidden": "already hidden", purged: "purged" } as const;

// photo-storage.ts is marked server-only for Next's bundler; this script is server code too, so the marker resolves to
// nothing here. The app modules load inside main: imports are hoisted above config(), and src/db/client.ts reads the
// environment as it loads.
require.cache[require.resolve("server-only")] = { exports: {} } as NodeJS.Module;

// No top-level await: package.json has no "type": "module", so tsx emits CJS (as src/db/migrate.ts notes).
async function main(): Promise<number> {
  const { hidePhotoAndFiles, parseHideArgs } = await import("../src/photos/hide");
  const args = parseHideArgs(process.argv.slice(2));
  if ("error" in args) {
    console.error(args.error);
    console.error(USAGE);
    return 2;
  }
  const { photoStorage } = await import("../src/storage/photo-storage");
  const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  try {
    const db = drizzle(client, { schema });
    const run: TxRunner = (fn) => db.transaction(fn);
    const r = await hidePhotoAndFiles(photoStorage(), { ...args, now: new Date() }, run);
    console.log(`${SAID[r.status]} ${args.photoId}`);
    return 0;
  } finally {
    await client.end();
  }
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e);
    process.exit(1);
  },
);
