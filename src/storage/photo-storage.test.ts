import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { BUCKETS } from "./buckets";
import { STORAGE_TIMEOUT_MS, createPhotoStorage, timedFetch, type PhotoStorage } from "./photo-storage";

describe("Storage calls time out (panel ruling 28)", () => {
  let server: Server, url = "";
  beforeAll(async () => {
    server = createServer((req) => { req.resume(); }); // reads the request, never answers
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });

  it("waits 5 seconds by default", () => {
    expect(STORAGE_TIMEOUT_MS).toBe(5000);
  });

  it("aborts a stalled request with a TimeoutError, and still honours the caller's own signal", async () => {
    const t0 = Date.now();
    await expect(timedFetch(100)(url)).rejects.toMatchObject({ name: "TimeoutError" });
    expect(Date.now() - t0).toBeLessThan(2000);
    const own = new AbortController();
    const pending = timedFetch(60_000)(url, { signal: own.signal });
    own.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("gives up on every PhotoStorage method when Storage stalls", async () => {
    const s: PhotoStorage = createPhotoStorage({ url, serviceRoleKey: "stalled", timeoutMs: 100 });
    const p = "0b6c2f6e-5d1a-4c4e-9a59-3f0f3c1d2e4f/AbCdEfGhIjKlMnOpQrSt_--160.webp";
    const calls: [string, () => Promise<unknown>][] = [
      ["createSignedUpload", () => s.createSignedUpload("x/in.jpg")],
      ["download", () => s.download(BUCKETS.draft, p, 1000)],
      ["put", () => s.put(BUCKETS.draft, p, Buffer.from("x"), "image/webp")],
      ["copy", () => s.copy({ bucket: BUCKETS.draft, path: p }, { bucket: BUCKETS.public, path: p })],
      ["remove", () => s.remove(BUCKETS.draft, [p])],
      ["signedReadUrl", () => s.signedReadUrl(BUCKETS.draft, p, 600)],
      ["list", () => s.list(BUCKETS.draft, "x")],
    ];
    for (const [name, call] of calls) {
      const t0 = Date.now();
      await expect(call(), name).rejects.toThrow();
      expect(Date.now() - t0, name).toBeLessThan(2000);
    }
  });
});
