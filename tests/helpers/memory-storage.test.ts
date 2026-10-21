import { it, expect } from "vitest";
import { BUCKETS } from "@/storage/buckets";
import { createMemoryStorage } from "./memory-storage";
import { photoStorageContract } from "./photo-storage-contract";

photoStorageContract("memory fake", () => createMemoryStorage());

it("keys files by bucket and path, and dates them by the clock it was given", async () => {
  let t = new Date("2026-10-01T00:00:00Z");
  const s = createMemoryStorage(() => t);
  await s.put(BUCKETS.public, "b/x-160.webp", Buffer.from("x"), "image/webp");
  expect([...s.files.keys()]).toEqual(["photos/b/x-160.webp"]);
  expect(await s.list(BUCKETS.public, "b")).toEqual([{ name: "b/x-160.webp", createdAt: t }]);
  // A copy onto an existing destination re-dates it to the clock's now (ruling 25).
  await s.put(BUCKETS.archive, "b/x-160.webp", Buffer.from("old"), "image/webp");
  t = new Date("2026-10-02T00:00:00Z");
  await s.copy({ bucket: BUCKETS.public, path: "b/x-160.webp" }, { bucket: BUCKETS.archive, path: "b/x-160.webp" });
  expect(await s.list(BUCKETS.archive, "b")).toEqual([{ name: "b/x-160.webp", createdAt: new Date("2026-10-02T00:00:00Z") }]);
  expect(s.files.get("photo-archive/b/x-160.webp")?.toString()).toBe("x");
});
