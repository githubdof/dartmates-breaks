import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PhotoSrc } from "@/photos/urls";
import { isRetryableStatus, NETWORK_FAILED, uploadPhoto, UploadError } from "./upload-client";

class FakeXHR {
  static last: FakeXHR | undefined;
  upload = new EventTarget(); status = 0; method = ""; url = ""; headers: Record<string, string> = {}; body: unknown; aborted = false;
  private events = new EventTarget();
  constructor() { FakeXHR.last = this; }
  open(m: string, u: string) { this.method = m; this.url = u; }
  setRequestHeader(k: string, v: string) { this.headers[k] = v; }
  send(b: unknown) { this.body = b; }
  abort() { this.aborted = true; this.events.dispatchEvent(new Event("abort")); }
  addEventListener(t: string, f: EventListener) { this.events.addEventListener(t, f); }
  removeEventListener(t: string, f: EventListener) { this.events.removeEventListener(t, f); }
  progress(loaded: number, total: number) { this.upload.dispatchEvent(Object.assign(new Event("progress"), { loaded, total, lengthComputable: true })); }
  respond(status: number) { this.status = status; this.events.dispatchEvent(new Event("load")); }
  fail() { this.events.dispatchEvent(new Event("error")); }
}
const ticket = { ok: true as const, data: { ticketId: "t1", uploadUrl: "http://127.0.0.1:54321/storage/v1/object/upload/sign/incoming/n.jpg?token=abc", token: "abc" } };
const psrc: PhotoSrc = { src: "https://x.test/p-160.webp", srcSet: "https://x.test/p-160.webp 160w", width: 160, height: 120, alt: "A" };
const start = (o: Partial<Parameters<typeof uploadPhoto>[0]> = {}) => {
  const onProgress = vi.fn(); const onFinishing = vi.fn(); const ctrl = new AbortController();
  const p = uploadPhoto({ breakId: "b1", blob: new Blob(["j"], { type: "image/jpeg" }), slot: "s1", alt: "A", signal: ctrl.signal, request: vi.fn().mockResolvedValue(ticket), onProgress, onFinishing, ...o });
  // A rejection nobody has awaited yet is not an unhandled one in these tests.
  p.catch(() => {});
  return { p, onProgress, onFinishing, ctrl };
};
const xhr = async () => { await vi.waitFor(() => expect(FakeXHR.last).toBeDefined()); return FakeXHR.last!; };
beforeEach(() => { FakeXHR.last = undefined; vi.stubGlobal("XMLHttpRequest", FakeXHR); });
afterEach(() => vi.unstubAllGlobals());

it("isRetryableStatus: network, 408, 429 and 5xx retry; other 4xx are final", () => {
  for (const s of [0, 408, 429, 500, 502, 503, 504]) expect(isRetryableStatus(s)).toBe(true);
  for (const s of [400, 401, 403, 404, 409, 410, 413, 415, 422]) expect(isRetryableStatus(s)).toBe(false);
});
it("the happy path: PUT with progress, then finalise, then the photo", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ photoId: "p1", src: psrc }), { status: 200 })));
  const { p, onProgress, onFinishing } = start();
  const x = await xhr();
  expect([x.method, x.url]).toEqual(["PUT", ticket.data.uploadUrl]);
  expect(x.headers["x-upsert"]).toBe("false");
  expect((x.body as FormData).get("cacheControl")).toBe("3600");
  expect((x.body as FormData).get("")).toBeInstanceOf(Blob);
  x.progress(50, 100);
  expect(onProgress).toHaveBeenLastCalledWith(0.5);
  x.respond(200);
  await expect(p).resolves.toEqual({ photoId: "p1", src: psrc });
  expect(onFinishing).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("/api/photos/finalise", expect.objectContaining({ method: "POST", body: JSON.stringify({ ticketId: "t1", slot: "s1", alt: "A" }) }));
});
it.each([
  ["a network error", (x: FakeXHR) => x.fail()],
  ["500", (x: FakeXHR) => x.respond(500)],
  ["503", (x: FakeXHR) => x.respond(503)],
  ["408", (x: FakeXHR) => x.respond(408)],
  ["429", (x: FakeXHR) => x.respond(429)],
])("%s on the PUT is retryable, with the connection sentence", async (_, act) => {
  const { p } = start();
  act(await xhr());
  await expect(p).rejects.toBeInstanceOf(UploadError);
  await expect(p).rejects.toMatchObject({ retryable: true, message: "The upload didn't finish. Check your connection." });
});
it.each([400, 403, 413])("%i on the PUT is final", async (status) => {
  const { p } = start();
  (await xhr()).respond(status);
  await expect(p).rejects.toMatchObject({ retryable: false, message: "This photo couldn't be uploaded. Pick it again." });
});
it("finalise: a rejected fetch, a 502 and a 429 are retryable; a 410 is final with the server's sentence", async () => {
  const cases: [() => Promise<Response>, boolean, string][] = [
    [() => Promise.reject(new TypeError("Failed to fetch")), true, NETWORK_FAILED],
    [async () => new Response("{}", { status: 502 }), true, NETWORK_FAILED],
    [async () => new Response(JSON.stringify({ error: "Slow down" }), { status: 429 }), true, NETWORK_FAILED],
    [async () => new Response(JSON.stringify({ error: "This upload took too long. Try again." }), { status: 410 }), false, "This upload took too long. Try again."],
  ];
  for (const [res, retryable, message] of cases) {
    FakeXHR.last = undefined;
    vi.stubGlobal("fetch", vi.fn(res));
    const { p } = start();
    (await xhr()).respond(200);
    await expect(p).rejects.toMatchObject({ retryable, message });
  }
});
it("a refused grant is final with its message, and nothing is uploaded", async () => {
  const { p } = start({ request: vi.fn().mockResolvedValue({ ok: false, code: "NOT_FOUND", message: "This break could not be found." }) });
  await expect(p).rejects.toMatchObject({ retryable: false, message: "This break could not be found." });
  expect(FakeXHR.last).toBeUndefined();
});
it("a grant request that throws (offline) is retryable", async () => {
  const { p } = start({ request: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) });
  await expect(p).rejects.toMatchObject({ retryable: true, message: NETWORK_FAILED });
});
it("Cancel aborts the PUT and rejects with AbortError, not UploadError", async () => {
  const { p, ctrl } = start();
  const x = await xhr();
  ctrl.abort();
  await expect(p).rejects.toMatchObject({ name: "AbortError" });
  expect(x.aborted).toBe(true);
});
