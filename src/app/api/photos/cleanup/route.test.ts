import { afterEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runPhotoCleanup } from "@/jobs/photo-cleanup";
import { GET } from "./route";

const sentinel = vi.hoisted(() => ({ storage: "sentinel" }));
vi.mock("@/jobs/photo-cleanup", () => ({
  runPhotoCleanup: vi.fn(async () => ({ incoming: 1, tickets: 0, orphans: 3, archive: 0, cancelled: 0, failed: 0, done: true })),
}));
vi.mock("@/storage/photo-storage", () => ({ photoStorage: () => sentinel }));

const secret = process.env.CRON_SECRET!;
const req = (authorization?: string) => new Request("http://localhost/api/photos/cleanup", { headers: authorization === undefined ? {} : { authorization } });

afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); });

describe("GET /api/photos/cleanup", () => {
  it("refuses a request without the cron secret, and runs nothing", async () => {
    const none = await GET(req());
    expect(none.status).toBe(401);
    expect(await none.json()).toEqual({ error: "unauthorized" });
    expect((await GET(req("Bearer " + "x".repeat(secret.length)))).status).toBe(401);
    expect(runPhotoCleanup).not.toHaveBeenCalled();
  });
  it("runs the cleanup once with the storage and the current time, and answers its result", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await GET(req(`Bearer ${secret}`));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ incoming: 1, tickets: 0, orphans: 3, archive: 0, cancelled: 0, failed: 0, done: true });
    expect(runPhotoCleanup).toHaveBeenCalledTimes(1);
    expect(runPhotoCleanup).toHaveBeenCalledWith(sentinel, expect.any(Date));
    expect(JSON.parse(log.mock.calls[0][0] as string)).toMatchObject({ job: "photo-cleanup", ms: expect.any(Number), result: { orphans: 3 } });
  });
  it("answers 200 with locked when another run holds the lock", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(runPhotoCleanup).mockResolvedValueOnce("locked");
    const r = await GET(req(`Bearer ${secret}`));
    expect(r.status).toBe(200);
    expect(await r.json()).toBe("locked");
  });
  it("answers 500 with the counts when a Storage step failed, so the cron shows red", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const counts = { incoming: 0, tickets: 0, orphans: 2, archive: 3, cancelled: 0, failed: 1, done: true };
    vi.mocked(runPhotoCleanup).mockResolvedValueOnce(counts);
    const r = await GET(req(`Bearer ${secret}`));
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual(counts);
  });
  it("is scheduled daily beside the minute tick, and vercel.json keeps every other key (ruling 39)", () => {
    const v = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(v.crons).toEqual([
      { path: "/api/tick", schedule: "* * * * *" },
      { path: "/api/photos/cleanup", schedule: "17 9 * * *" },
    ]);
    expect(v.functions["src/app/api/photos/finalise/route.ts"]).toEqual({ maxDuration: 30 }); // Task 6's, untouched
    expect(Object.keys(v).sort()).toEqual(["crons", "functions"]);
  });
  it("runs on Node for up to 300 seconds, never cached", async () => {
    const m = await import("./route");
    expect([m.runtime, m.maxDuration, m.dynamic]).toEqual(["nodejs", 300, "force-dynamic"]);
  });
});
