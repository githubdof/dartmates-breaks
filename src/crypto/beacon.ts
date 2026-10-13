import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, concatBytes, utf8ToBytes } from "@noble/hashes/utils";

export const QUICKNET = {
  chainHash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  genesis: 1692803367, // unix seconds of round 1
  period: 3,
  relays: ["https://api.drand.sh", "https://api2.drand.sh", "https://api3.drand.sh", "https://drand.cloudflare.com"],
};

export type BeaconValue = { randomness: Uint8Array; signature: string };

export interface BeaconSource {
  roundAt(time: Date): number;
  fetch(round: number): Promise<BeaconValue | null>;
}

/** First round whose time is >= time + delaySeconds. Round r happens at genesis + (r-1)*period. */
export function roundAfter(time: Date, delaySeconds: number): number {
  // ceil, not floor: a fractional second must never yield a round earlier than time + delay.
  const t = Math.ceil(time.getTime() / 1000) + delaySeconds;
  // drand round 1 is at genesis, hence the +1; the spec's formula omits the +1.
  return Math.ceil((t - QUICKNET.genesis) / QUICKNET.period) + 1;
}

/** Fake beacon only when BEACON=fake (local tests, CI, e2e); refused on any Vercel deploy. */
export function beaconFromEnv(): BeaconSource {
  if (process.env.BEACON === "fake") {
    if (process.env.VERCEL_ENV) throw new Error(`fake beacon refused on Vercel (VERCEL_ENV=${process.env.VERCEL_ENV})`);
    return new FakeBeacon();
  }
  return new DrandBeacon();
}

/**
 * Checks a relay answer is internally consistent: quicknet defines randomness = sha256(signature).
 * This does not verify the BLS signature against the chain key; it rejects a relay that serves
 * randomness unrelated to its signature.
 */
export function beaconValueFrom(body: { randomness: string; signature: string }): BeaconValue {
  const randomness = hexToBytes(body.randomness);
  if (randomness.length !== 32) throw new Error(`randomness is ${randomness.length} bytes, expected 32`);
  if (bytesToHex(sha256(hexToBytes(body.signature))) !== bytesToHex(randomness)) throw new Error("randomness is not sha256(signature)");
  return { randomness, signature: body.signature };
}

export class DrandBeacon implements BeaconSource {
  // Wrapped so a test stub or a later global fetch patch is picked up, and `this` is never the beacon.
  constructor(private fetchFn: typeof fetch = (...a) => fetch(...a)) {}
  roundAt(time: Date) { return roundAfter(time, 0); }
  async fetch(round: number): Promise<BeaconValue | null> {
    if (round > this.roundAt(new Date())) return null;
    for (const relay of QUICKNET.relays) {
      try {
        const res = await this.fetchFn(`${relay}/${QUICKNET.chainHash}/public/${round}`, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { round: number; randomness: string; signature: string };
        if (body.round !== round) throw new Error(`relay answered round ${body.round}`);
        return beaconValueFrom(body);
      } catch (e) {
        console.warn(JSON.stringify({ beacon: "relay_failed", relay, round, error: String(e) }));
      }
    }
    return null;
  }
}

export class FakeBeacon implements BeaconSource {
  roundAt(time: Date) { return roundAfter(time, 0); }
  async fetch(round: number): Promise<BeaconValue> {
    const r = new Uint8Array(4);
    new DataView(r.buffer).setUint32(0, round, false);
    return { randomness: sha256(concatBytes(utf8ToBytes("fake-beacon"), r)), signature: "fake" };
  }
}
