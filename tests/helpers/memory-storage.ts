import { randomUUID } from "node:crypto";
import { BUCKETS, type BucketName } from "@/storage/buckets";
import { StorageNotFound, TooLarge, type PhotoStorage } from "@/storage/photo-storage";

/** PhotoStorage in memory, for `pnpm test`. `files` is keyed `${bucket}/${path}`; a test "uploads" into `incoming` by
 *  setting `files.set("incoming/" + name, body)`. `list` dates each file by `clock()` at its latest put or copy. */
export function createMemoryStorage(clock: () => Date = () => new Date()): PhotoStorage & { files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>();
  const dates = new Map<string, Date>();
  const key = (bucket: BucketName, path: string) => `${bucket}/${path}`;
  const write = (k: string, body: Buffer) => {
    files.set(k, Buffer.from(body));
    dates.set(k, clock());
  };
  const read = (bucket: BucketName, path: string): Buffer => {
    const body = files.get(key(bucket, path));
    if (!body) throw new StorageNotFound(key(bucket, path));
    return body;
  };

  return {
    files,

    async createSignedUpload(name) {
      return { url: `memory://upload/${BUCKETS.incoming}/${name}`, token: randomUUID() };
    },

    async download(bucket, path, maxBytes) {
      const body = read(bucket, path);
      if (body.length > maxBytes) throw new TooLarge(`${key(bucket, path)} is ${body.length} bytes, over ${maxBytes}`);
      return Buffer.from(body);
    },

    async put(bucket, path, body) {
      write(key(bucket, path), body);
    },

    async copy(from, to) {
      // Whether or not the destination exists: the source's bytes and a fresh date (ruling 25).
      write(key(to.bucket, to.path), read(from.bucket, from.path));
    },

    async remove(bucket, paths) {
      for (const path of paths) {
        files.delete(key(bucket, path));
        dates.delete(key(bucket, path));
      }
    },

    async signedReadUrl(bucket, path, seconds) {
      return `memory://sign/${bucket}/${path}?seconds=${seconds}`;
    },

    async list(bucket, prefix) {
      const start = prefix ? `${bucket}/${prefix}/` : `${bucket}/`;
      return [...files.keys()]
        .filter((k) => k.startsWith(start))
        .sort()
        .map((k) => {
          // A test "upload" sets `files` directly: date it the first time it is seen.
          if (!dates.has(k)) dates.set(k, clock());
          return { name: k.slice(bucket.length + 1), createdAt: dates.get(k)! };
        });
    },
  };
}
