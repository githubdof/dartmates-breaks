import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { FakeBeacon, DrandBeacon, roundAfter, beaconFromEnv, beaconValueFrom, QUICKNET } from "./beacon";

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
  // quicknet: randomness = sha256(signature); a 48-byte G1 signature like the real chain's.
  const signature = "a1".repeat(48);
  const randomness = bytesToHex(sha256(hexToBytes(signature)));
  const ok = (round: number, body: Partial<{ randomness: string; signature: string }> = {}) =>
    new Response(JSON.stringify({ round, randomness, signature, ...body }), { status: 200 });
  beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });

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
    expect(v!.signature).toBe(signature);
    expect(bytesToHex(v!.randomness)).toBe(randomness);
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual(
      QUICKNET.relays.slice(0, 3).map((r) => `${r}/${QUICKNET.chainHash}/public/42`),
    );
    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(JSON.parse(vi.mocked(console.warn).mock.calls[0][0] as string)).toEqual({ beacon: "relay_failed", relay: QUICKNET.relays[0], round: 42, error: "Error: down" });
  });
  it("skips a relay whose randomness is not sha256(signature) and uses the next one", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(ok(42, { randomness: "ab".repeat(32) }))
      .mockResolvedValueOnce(ok(42));
    const v = await new DrandBeacon(fetchFn as unknown as typeof fetch).fetch(42);
    expect(bytesToHex(v!.randomness)).toBe(randomness);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const warned = JSON.parse(vi.mocked(console.warn).mock.calls[0][0] as string) as { error: string };
    expect(warned.error).toMatch(/sha256\(signature\)/);
  });
  it("skips a relay whose randomness is not 32 bytes", async () => {
    const short = bytesToHex(sha256(hexToBytes(signature))).slice(0, 62);
    const fetchFn = vi.fn().mockResolvedValue(ok(42, { randomness: short }));
    expect(await new DrandBeacon(fetchFn as unknown as typeof fetch).fetch(42)).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(QUICKNET.relays.length);
    expect(console.warn).toHaveBeenCalledTimes(QUICKNET.relays.length);
  });
  it("accepts a real quicknet round (round 1000 from api.drand.sh)", () => {
    const real = {
      randomness: "fe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd",
      signature: "b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39",
    };
    expect(bytesToHex(beaconValueFrom(real).randomness)).toBe(real.randomness);
  });
  it("uses the global fetch by default", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok(42));
    const v = await new DrandBeacon().fetch(42);
    expect(bytesToHex(v!.randomness)).toBe(randomness);
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it("returns null when every relay fails", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("down"));
    expect(await new DrandBeacon(fetchFn as unknown as typeof fetch).fetch(42)).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(QUICKNET.relays.length);
  });
});

describe("beaconFromEnv", () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  it("returns the fake beacon when BEACON=fake off Vercel", () => {
    vi.stubEnv("BEACON", "fake");
    vi.stubEnv("VERCEL_ENV", "");
    expect(beaconFromEnv()).toBeInstanceOf(FakeBeacon);
  });
  it.each(["production", "preview", "development"])("refuses the fake beacon on Vercel (%s)", (vercelEnv) => {
    vi.stubEnv("BEACON", "fake");
    vi.stubEnv("VERCEL_ENV", vercelEnv);
    expect(() => beaconFromEnv()).toThrow(/refused on Vercel/);
  });
  it("defaults to drand", () => {
    vi.stubEnv("BEACON", "");
    expect(beaconFromEnv()).toBeInstanceOf(DrandBeacon);
  });
});
