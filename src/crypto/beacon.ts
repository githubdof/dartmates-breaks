import { sha256 } from "@noble/hashes/sha256";
import { hexToBytes, concatBytes, utf8ToBytes } from "@noble/hashes/utils";

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

/** Fake beacon only when BEACON=fake (tests, e2e); never in production. */
export function beaconFromEnv(): BeaconSource {
  if (process.env.BEACON === "fake") {
    if (process.env.VERCEL_ENV === "production") throw new Error("fake beacon in production");
    return new FakeBeacon();
  }
  return new DrandBeacon();
}

export class DrandBeacon implements BeaconSource {
  constructor(private fetchFn: typeof fetch = fetch) {}
  roundAt(time: Date) { return roundAfter(time, 0); }
  async fetch(round: number): Promise<BeaconValue | null> {
    if (round > this.roundAt(new Date())) return null;
    for (const relay of QUICKNET.relays) {
      try {
        const res = await this.fetchFn(`${relay}/${QUICKNET.chainHash}/public/${round}`, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) continue;
        const body = (await res.json()) as { round: number; randomness: string; signature: string };
        if (body.round !== round) continue;
        return { randomness: hexToBytes(body.randomness), signature: body.signature };
      } catch { /* try next relay */ }
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
