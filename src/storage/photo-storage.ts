import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { BUCKETS, BUCKET_SETTINGS, type BucketName } from "./buckets";
import { STORAGE_TIMEOUT_MS, timedFetch } from "./timed-fetch";

/** A download went past the caller's `maxBytes`. */
export class TooLarge extends Error {}
/** A download named an object that does not exist. */
export class StorageNotFound extends Error {}

export { STORAGE_TIMEOUT_MS, timedFetch } from "./timed-fetch";

/** The only way the app talks to Supabase Storage (photos spec §5.5). Every call is the service role. */
export interface PhotoStorage {
  /** A signed upload URL into `incoming`, no overwrite. Storage fixes its life at 2 hours; the ticket enforces 5 minutes. */
  createSignedUpload(name: string): Promise<{ url: string; token: string }>;
  /** The object's bytes. `TooLarge` past `maxBytes` (on Content-Length and while streaming); `StorageNotFound` when missing. */
  download(bucket: BucketName, path: string, maxBytes: number): Promise<Buffer>;
  /** Writes or overwrites the object, cached one hour; an overwrite makes its age fresh. */
  put(bucket: BucketName, path: string, body: Buffer, contentType: "image/webp"): Promise<void>;
  /** Copies an object; onto an existing destination it re-puts the source's bytes, so its age is fresh (ruling 25). */
  copy(from: { bucket: BucketName; path: string }, to: { bucket: BucketName; path: string }): Promise<void>;
  /** Removes the paths; missing ones are not an error. */
  remove(bucket: BucketName, paths: string[]): Promise<void>;
  /** A read URL signed for `seconds`. */
  signedReadUrl(bucket: BucketName, path: string, seconds: number): Promise<string>;
  /** Every object under the folder `prefix` ("" = the whole bucket), recursively, by full path; `createdAt` is its last write. */
  list(bucket: BucketName, prefix: string): Promise<{ name: string; createdAt: Date }[]>;
}

const PAGE = 1000;

function fail(op: string, where: string, cause: unknown): Error {
  const message = cause instanceof Error ? cause.message : String(cause);
  return new Error(`storage ${op} ${where}: ${message}`, { cause });
}

/** The real implementation over a service-role client of its own whose `global.fetch` is `timedFetch(timeoutMs)`;
 *  `download`'s direct fetch uses the same `timedFetch`. Tests point it at a stalled server. */
export function createPhotoStorage(cfg: { url: string; serviceRoleKey: string; timeoutMs: number }): PhotoStorage {
  const fetchT = timedFetch(cfg.timeoutMs);
  const storage = createClient(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchT },
  }).storage;

  async function download(bucket: BucketName, path: string, maxBytes: number): Promise<Buffer> {
    const where = `${bucket}/${path}`;
    const objectPath = path.split("/").map(encodeURIComponent).join("/");
    try {
      const res = await fetchT(`${cfg.url}/storage/v1/object/authenticated/${bucket}/${objectPath}`, {
        headers: { apikey: cfg.serviceRoleKey, Authorization: `Bearer ${cfg.serviceRoleKey}` },
      });
      if (!res.ok) {
        const text = await res.text();
        if ((res.status === 400 || res.status === 404) && /not found/i.test(text)) throw new StorageNotFound(where);
        throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
      }
      const length = res.headers.get("content-length");
      if (length !== null && Number(length) > maxBytes) {
        await res.body?.cancel();
        throw new TooLarge(`${where} is ${length} bytes, over ${maxBytes}`);
      }
      if (!res.body) return Buffer.alloc(0);
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new TooLarge(`${where} is over ${maxBytes} bytes`);
        }
        chunks.push(value);
      }
      return Buffer.concat(chunks);
    } catch (e) {
      if (e instanceof TooLarge || e instanceof StorageNotFound) throw e;
      throw fail("download", where, e);
    }
  }

  async function put(bucket: BucketName, path: string, body: Buffer, contentType: "image/webp"): Promise<void> {
    const { error } = await storage.from(bucket).upload(path, body, { contentType, cacheControl: "3600", upsert: true });
    if (error) throw fail("put", `${bucket}/${path}`, error);
  }

  return {
    async createSignedUpload(name) {
      const { data, error } = await storage.from(BUCKETS.incoming).createSignedUploadUrl(name, { upsert: false });
      if (error) throw fail("createSignedUpload", `${BUCKETS.incoming}/${name}`, error);
      return { url: data.signedUrl, token: data.token };
    },

    download,
    put,

    async copy(from, to) {
      const { error } = await storage.from(from.bucket).copy(from.path, to.path, { destinationBucket: to.bucket });
      if (!error) return;
      const statusCode = "statusCode" in error ? String(error.statusCode) : "";
      if (statusCode === "409" || /already exists/i.test(error.message)) {
        // The destination is there: re-put it with the source's bytes, so its age is fresh (ruling 25).
        const body = await download(from.bucket, from.path, BUCKET_SETTINGS[to.bucket].fileSizeLimit);
        await put(to.bucket, to.path, body, "image/webp");
        return;
      }
      throw fail("copy", `${from.bucket}/${from.path} -> ${to.bucket}/${to.path}`, error);
    },

    async remove(bucket, paths) {
      for (let i = 0; i < paths.length; i += PAGE) {
        const batch = paths.slice(i, i + PAGE);
        const { error } = await storage.from(bucket).remove(batch);
        if (error) throw fail("remove", `${bucket}/${batch[0]} (+${batch.length - 1})`, error);
      }
    },

    async signedReadUrl(bucket, path, seconds) {
      const { data, error } = await storage.from(bucket).createSignedUrl(path, seconds);
      if (error) throw fail("signedReadUrl", `${bucket}/${path}`, error);
      return data.signedUrl;
    },

    async list(bucket, prefix) {
      const out: { name: string; createdAt: Date }[] = [];
      const dirs = [prefix];
      for (let dir = dirs.pop(); dir !== undefined; dir = dirs.pop()) {
        for (let offset = 0; ; offset += PAGE) {
          const { data, error } = await storage.from(bucket).list(dir, { limit: PAGE, offset });
          if (error) throw fail("list", `${bucket}/${dir}`, error);
          for (const entry of data) {
            const name = dir ? `${dir}/${entry.name}` : entry.name;
            if (entry.id === null) dirs.push(name);
            else out.push({ name, createdAt: new Date((entry.updated_at ?? entry.created_at)!) });
          }
          if (data.length < PAGE) break;
        }
      }
      return out;
    },
  };
}

/** The app's Storage: the service role from the environment, every request aborted after `STORAGE_TIMEOUT_MS`. */
export function photoStorage(): PhotoStorage {
  return createPhotoStorage({
    url: env().SUPABASE_URL,
    serviceRoleKey: env().SUPABASE_SERVICE_ROLE_KEY,
    timeoutMs: STORAGE_TIMEOUT_MS,
  });
}
