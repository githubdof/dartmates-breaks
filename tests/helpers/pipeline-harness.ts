import { vi } from "vitest";
import type { Tx } from "@/db/client";
import type { Caller } from "@/domain/types";
import type { BucketName } from "@/storage/buckets";
import type { PhotoStorage } from "@/storage/photo-storage";

// The shared harness of the photo pipeline's route and action tests (photos plan Task 6). Each test file registers
// the mocks with these factories (vi.mock calls must sit in the test file itself), sets `h.current` to its withTx
// transaction, `h.caller` to the signed-in caller and `h.mem` to a fresh memory store. No runtime import of
// @/storage/photo-storage here: that module's mock factory imports this one.

type Mem = PhotoStorage & { files: Map<string, Buffer> };

export const h = {
  /** The test's withTx transaction: db.transaction runs a savepoint inside it. Null: the real db.transaction. */
  current: null as Tx | null,
  caller: null as Caller | null,
  mem: null as unknown as Mem,
  /** Set by commitThenFail: the next savepoint is released, then db.transaction rejects. */
  failAfterCommit: false,
  /** "tx:begin", "tx:end" and every storage op, in order. */
  timeline: [] as string[],
  /** Every storage op, in order. */
  ops: [] as string[],
  /** Rejects the storage ops it selects; `n` counts that op so far, from 1. */
  failOn: (() => false) as (op: string, n: number) => boolean,
};

/** Call from inside a mocked command: its transaction commits (the savepoint is released), then db.transaction rejects. */
export const commitThenFail = () => { h.failAfterCommit = true; };

/** The `@/db/client` mock: db.transaction runs `fn` in a savepoint of `h.current`, so a throw rolls back as for real. */
export function mockDb<M extends { db: unknown }>(real: M & { db: { transaction: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T> } }): M {
  return {
    ...real,
    db: {
      transaction: async <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => {
        const current = h.current;
        if (!current) return real.db.transaction(fn);
        h.timeline.push("tx:begin");
        try {
          const out = await current.transaction(fn);
          if (h.failAfterCommit) {
            h.failAfterCommit = false;
            throw new Error("connection reset after commit");
          }
          return out;
        } finally {
          h.timeline.push("tx:end");
        }
      },
    },
  };
}

/** Every export that is a plain function wrapped as `vi.fn(realExport)`; classes and values are kept as they are. */
export function wrapAll<M extends Record<string, unknown>>(real: M): M {
  return Object.fromEntries(Object.entries(real).map(([k, v]) =>
    [k, typeof v === "function" && !/^class[\s{]/.test(Function.prototype.toString.call(v)) ? vi.fn(v as (...a: unknown[]) => unknown) : v])) as M;
}

/** The memory store, recording each op on `h.ops` and `h.timeline` and rejecting those `h.failOn` selects. */
export function recording(mem: Mem): PhotoStorage {
  const counts = new Map<string, number>();
  const run = async <T>(op: string, call: () => Promise<T>): Promise<T> => {
    const n = (counts.get(op) ?? 0) + 1;
    counts.set(op, n);
    h.ops.push(op);
    h.timeline.push(op);
    if (h.failOn(op, n)) throw new Error(`storage ${op} failed (test)`);
    return call();
  };
  return {
    createSignedUpload: (name) => run("sign:incoming", () => mem.createSignedUpload(name)),
    download: (bucket, path, max) => run(`download:${bucket}`, () => mem.download(bucket, path, max)),
    put: (bucket, path, body, type) => run(`put:${bucket}`, () => mem.put(bucket, path, body, type)),
    copy: (from, to) => run(`copy:${to.bucket}`, () => mem.copy(from, to)),
    remove: (bucket, paths) => run(`remove:${bucket}`, () => mem.remove(bucket, paths)),
    signedReadUrl: (bucket, path, seconds) => run(`signedRead:${bucket}`, () => mem.signedReadUrl(bucket, path, seconds)),
    list: (bucket, prefix) => run(`list:${bucket}`, () => mem.list(bucket, prefix)),
  };
}

/** Storage ops that ran between a tx:begin and its tx:end (panel ruling 28: must be empty). */
export function storageInsideTx(): string[] {
  let depth = 0;
  return h.timeline.filter((e) => (e === "tx:begin" ? (depth++, false) : e === "tx:end" ? (depth--, false) : depth > 0));
}

/** The memory store's key of a file (ruling 11). */
export const key = (bucket: BucketName, path: string) => `${bucket}/${path}`;

/** The memory store's keys under `bucket`, sorted. */
export const filesIn = (bucket: BucketName) => [...h.mem.files.keys()].filter((k) => k.startsWith(`${bucket}/`)).sort();

/** Back to a clean slate between tests (call from afterEach, after vi.clearAllMocks()). */
export function resetHarness(): void {
  h.current = null;
  h.caller = null;
  h.failAfterCommit = false;
  h.timeline.length = 0;
  h.ops.length = 0;
  h.failOn = () => false;
}
