import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTx } from "../../tests/helpers/db";
import { hitRateLimit, pruneRateLimits } from "./rate-limit";

describe("hitRateLimit", () => {
  it("counts hits per bucket in fixed windows and says when to retry", async () => {
    await withTx(async (tx) => {
      const bucket = `test:${randomUUID()}`;
      const now = new Date("2026-10-14T12:00:10Z");
      const hit = (at = now) => hitRateLimit(tx, { bucket, limit: 2, windowSeconds: 60, now: at });
      expect(await hit()).toEqual({ allowed: true, hits: 1, retryAfter: 50 });
      expect((await hit()).allowed).toBe(true);
      expect(await hit()).toEqual({ allowed: false, hits: 3, retryAfter: 50 });
      expect((await hitRateLimit(tx, { bucket: `${bucket}:other`, limit: 2, windowSeconds: 60, now })).allowed).toBe(true);
      expect(await hit(new Date("2026-10-14T12:01:00Z"))).toEqual({ allowed: true, hits: 1, retryAfter: 60 });
    });
  });
  it("prunes windows older than a day", async () => {
    await withTx(async (tx) => {
      const bucket = `test:${randomUUID()}`;
      await hitRateLimit(tx, { bucket, limit: 5, windowSeconds: 60, now: new Date("2026-10-12T12:00:00Z") });
      await hitRateLimit(tx, { bucket, limit: 5, windowSeconds: 60, now: new Date("2026-10-14T11:59:00Z") });
      expect(await pruneRateLimits(tx, new Date("2026-10-14T12:00:00Z"))).toBeGreaterThanOrEqual(1);
      const [r] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from rate_limits where bucket = ${bucket}`);
      expect(r.n).toBe(1);
    });
  });
});
