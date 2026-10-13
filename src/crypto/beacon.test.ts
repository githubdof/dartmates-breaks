import { describe, it, expect, afterEach, vi } from "vitest";
import { FakeBeacon, DrandBeacon, roundAfter, beaconFromEnv, QUICKNET } from "./beacon";

describe("beacon rounds", () => {
  it("computes the first round at or after time + delay", () => {
    const t = new Date((QUICKNET.genesis + 100 * QUICKNET.period) * 1000); // exactly round 101
    expect(roundAfter(t, 0)).toBe(101);
    expect(roundAfter(t, 60)).toBe(121);
    expect(roundAfter(new Date(t.getTime() + 1000), 0)).toBe(102);
  });
  it("fake beacon is deterministic per round", async () => {
    const f = new FakeBeacon();
    const a = await f.fetch(5), b = await f.fetch(5), c = await f.fetch(6);
    expect(a!.randomness).toEqual(b!.randomness);
    expect(a!.randomness).not.toEqual(c!.randomness);
  });
});

describe("DrandBeacon (stubbed fetch)", () => {
  const ok = (round: number) =>
    new Response(JSON.stringify({ round, randomness: "ab".repeat(32), signature: "sig" }), { status: 200 });

  it("returns null for a future round without calling any relay", async () => {
    const fetchFn = vi.fn();
    const b = new DrandBeacon(fetchFn as unknown as typeof fetch);
    expect(await b.fetch(b.roundAt(new Date()) + 10)).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("tries relays in order and returns the first good answer", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
      .mockResolvedValueOnce(ok(42));
    const v = await new DrandBeacon(fetchFn as unknown as typeof fetch).fetch(42);
    expect(v!.signature).toBe("sig");
    expect(v!.randomness).toEqual(new Uint8Array(32).fill(0xab));
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual(
      QUICKNET.relays.slice(0, 3).map((r) => `${r}/${QUICKNET.chainHash}/public/42`),
    );
  });
  it("returns null when every relay fails", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("down"));
    expect(await new DrandBeacon(fetchFn as unknown as typeof fetch).fetch(42)).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(QUICKNET.relays.length);
  });
});

describe("beaconFromEnv", () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  it("returns the fake beacon when BEACON=fake", () => {
    vi.stubEnv("BEACON", "fake");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(beaconFromEnv()).toBeInstanceOf(FakeBeacon);
  });
  it("refuses the fake beacon in production", () => {
    vi.stubEnv("BEACON", "fake");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => beaconFromEnv()).toThrow(/production/);
  });
  it("defaults to drand", () => {
    vi.stubEnv("BEACON", "");
    expect(beaconFromEnv()).toBeInstanceOf(DrandBeacon);
  });
});
