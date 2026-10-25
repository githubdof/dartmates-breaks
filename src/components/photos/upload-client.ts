import type { ActionResult } from "@/lib/action-result";
import type { PhotoSrc } from "@/photos/urls";

export type RequestUpload = (breakId: string) => Promise<ActionResult<{ ticketId: string; uploadUrl: string; token: string }>>;

export class UploadError extends Error {
  constructor(message: string, readonly retryable: boolean) { super(message); this.name = "UploadError"; }
}
export const NETWORK_FAILED = "The upload didn't finish. Check your connection.";
export const UPLOAD_REFUSED = "This photo couldn't be uploaded. Pick it again.";

/** A network error (0), 408, 429 and any 5xx can work on a second try; every other status is final. */
export const isRetryableStatus = (status: number) => status === 0 || status === 408 || status === 429 || (status >= 500 && status <= 599);

const aborted = () => new DOMException("The upload was cancelled.", "AbortError");

function put(url: string, blob: Blob, signal: AbortSignal, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const cancel = () => xhr.abort();
    const settle = (fn: () => void) => { signal.removeEventListener("abort", cancel); fn(); };
    xhr.upload.addEventListener("progress", (e) => {
      const p = e as ProgressEvent;
      if (p.lengthComputable && p.total > 0) onProgress(p.loaded / p.total);
    });
    xhr.addEventListener("load", () => settle(() => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new UploadError(isRetryableStatus(xhr.status) ? NETWORK_FAILED : UPLOAD_REFUSED, isRetryableStatus(xhr.status)));
    }));
    for (const type of ["error", "timeout"]) xhr.addEventListener(type, () => settle(() => reject(new UploadError(NETWORK_FAILED, true))));
    xhr.addEventListener("abort", () => settle(() => reject(aborted())));
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "false");
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", blob);
    signal.addEventListener("abort", cancel, { once: true });
    xhr.send(body);
  });
}

export async function uploadPhoto(p: {
  breakId: string; blob: Blob; slot: string | null; alt: string; signal: AbortSignal; request: RequestUpload;
  onProgress(fraction: number): void; onFinishing(): void;
}): Promise<{ photoId: string; src: PhotoSrc }> {
  if (p.signal.aborted) throw aborted();
  let grant: Awaited<ReturnType<RequestUpload>>;
  try {
    grant = await p.request(p.breakId);
  } catch {
    if (p.signal.aborted) throw aborted();
    throw new UploadError(NETWORK_FAILED, true);
  }
  if (p.signal.aborted) throw aborted();
  if (!grant.ok) throw new UploadError(grant.message, false);

  await put(grant.data.uploadUrl, p.blob, p.signal, p.onProgress);
  p.onFinishing();

  let res: Response;
  try {
    res = await fetch("/api/photos/finalise", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticketId: grant.data.ticketId, slot: p.slot, alt: p.alt }),
      signal: p.signal,
    });
  } catch {
    if (p.signal.aborted) throw aborted();
    throw new UploadError(NETWORK_FAILED, true);
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (isRetryableStatus(res.status)) throw new UploadError(NETWORK_FAILED, true);
    const error = (json as { error?: unknown } | null)?.error;
    throw new UploadError(typeof error === "string" && error ? error : UPLOAD_REFUSED, false);
  }
  const ok = json as { photoId?: unknown; src?: PhotoSrc } | null;
  if (!ok || typeof ok.photoId !== "string" || !ok.src) throw new UploadError(UPLOAD_REFUSED, false);
  return { photoId: ok.photoId, src: ok.src };
}
