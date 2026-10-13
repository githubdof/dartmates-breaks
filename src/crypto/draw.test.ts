import { describe, it, expect } from "vitest";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils";
import { commitment } from "./commit";
import { serializeEntries, uuidBytes, type Entry } from "./serialize";
import { shuffle } from "./shuffle";
import { computeRanking, ALGORITHM_VERSION } from "./draw";
import vectors from "./vectors.json";
import { verifyInputs, b64ToBytes, type PublicInputs } from "./verify";

describe("commitment", () => {
  it("is domain-separated sha256 of the secret", () => {
    const secret = new Uint8Array(32).fill(7);
    expect(commitment(secret)).toMatch(/^[0-9a-f]{64}$/);
    expect(commitment(secret)).not.toBe(bytesToHex(secret));
  });
});

describe("serializeEntries", () => {
  it("encodes number as uint16be and uuid as 16 bytes, sorted by number, ignoring any handle", () => {
    const a = "00000000-0000-0000-0000-000000000001";
    const b = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    // The extra handle property (non-ASCII) must not change the bytes.
    const withHandle: Entry & { handle: string } = { number: 13, ownerId: b, handle: "Jörg" };
    const out = serializeEntries([withHandle, { number: 2, ownerId: a }]);
    expect(out).toEqual(serializeEntries([{ number: 13, ownerId: b }, { number: 2, ownerId: a }]));
    expect(out.length).toBe(2 * 18);
    expect(Array.from(out.slice(0, 2))).toEqual([0, 2]);
    expect(Array.from(out.slice(2, 18))).toEqual(Array.from(uuidBytes(a)));
    expect(Array.from(out.slice(18, 20))).toEqual([0, 13]);
  });
  it("accepts bonus numbers above 255 (uint16)", () => {
    const out = serializeEntries([{ number: 300, ownerId: "00000000-0000-0000-0000-000000000001" }]);
    expect(Array.from(out.slice(0, 2))).toEqual([1, 44]);
  });
});

describe("shuffle", () => {
  it("returns a permutation", () => {
    const p = shuffle(new Uint8Array(32).fill(1), 20);
    expect([...p].sort((x, y) => x - y)).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });
  it("is deterministic for a seed and differs across seeds", () => {
    const s1 = new Uint8Array(32).fill(1), s2 = new Uint8Array(32).fill(2);
    expect(shuffle(s1, 10)).toEqual(shuffle(s1, 10));
    expect(shuffle(s1, 10)).not.toEqual(shuffle(s2, 10));
  });
  it("handles n = 1 and n = 0", () => {
    expect(shuffle(new Uint8Array(32), 1)).toEqual([0]);
    expect(shuffle(new Uint8Array(32), 0)).toEqual([]);
  });
});

describe("golden vectors", () => {
  for (const v of vectors) {
    it(v.name, () => {
      const r = computeRanking({
        version: ALGORITHM_VERSION,
        secret: hexToBytes(v.secret),
        beacon: hexToBytes(v.beacon),
        breakId: v.breakId,
        entries: v.entries,
      });
      expect(bytesToHex(r.seed)).toBe(v.seed);
      expect(r.ranking).toEqual(v.ranking);
      expect(r.resultHash).toBe(v.resultHash);
    });
  }
});

describe("verifyInputs", () => {
  const v = vectors[0];
  const secret = hexToBytes(v.secret);
  const base: PublicInputs = {
    breakId: v.breakId,
    version: ALGORITHM_VERSION,
    secret: Buffer.from(secret).toString("base64"),
    beaconRound: 1,
    beaconRandomness: v.beacon,
    entries: v.entries,
    ranking: v.ranking,
    resultHash: v.resultHash,
    seedCommitment: commitment(secret),
  };
  it("accepts a consistent result", () => {
    expect(verifyInputs(base)).toEqual({ ok: true, reasons: [] });
  });
  it("rejects a tampered ranking", () => {
    const r = verifyInputs({ ...base, ranking: [...v.ranking].reverse() });
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual(["ranking does not match the recomputation"]);
  });
  it("rejects a secret that does not match the commitment", () => {
    const r = verifyInputs({ ...base, seedCommitment: commitment(new Uint8Array(32)) });
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual(["secret does not match the commitment shown before opening"]);
  });
  it("rejects a wrong result hash", () => {
    const r = verifyInputs({ ...base, resultHash: "00".repeat(32) });
    expect(r.reasons).toEqual(["result hash differs"]);
  });
  it("rejects a missing commitment", () => {
    expect(verifyInputs({ ...base, seedCommitment: null }).ok).toBe(false);
  });
  it.each([
    ["a bad base64 secret", { secret: "%%%not base64%%%" }],
    ["an odd-length hex beacon", { beaconRandomness: "abc" }],
    ["an unsupported version", { version: 99 }],
  ])("reports %s as uncheckable instead of throwing", (_, patch) => {
    const r = verifyInputs({ ...base, ...patch });
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.startsWith("inputs could not be checked"))).toBe(true);
  });
  it("round-trips base64 with b64ToBytes", () => {
    expect(bytesToHex(b64ToBytes(base.secret))).toBe(v.secret);
  });
});
