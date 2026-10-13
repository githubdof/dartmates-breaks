// Shared by the result page (browser), the unit test and scripts/verify-draw.ts.
// Keep it plain TS over Uint8Array + @noble/hashes: no JSX, no Node Buffer, no server-only.
import { hexToBytes } from "@noble/hashes/utils";
import { computeRanking } from "./draw";
import { commitment } from "./commit";

export type PublicInputs = {
  breakId: string;
  version: number;
  secret: string; // base64 of the raw 32-byte secret
  beaconRound: number;
  beaconRandomness: string; // hex
  entries: { number: number; ownerId: string }[];
  ranking: number[];
  resultHash: string; // hex
  seedCommitment: string | null; // hex
};

export function b64ToBytes(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export function verifyInputs(i: PublicInputs): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  try {
    const secret = b64ToBytes(i.secret);
    if (commitment(secret) !== i.seedCommitment) reasons.push("secret does not match the commitment shown before opening");
    const r = computeRanking({ version: i.version, secret, beacon: hexToBytes(i.beaconRandomness), breakId: i.breakId, entries: i.entries });
    if (JSON.stringify(r.ranking) !== JSON.stringify(i.ranking)) reasons.push("ranking does not match the recomputation");
    if (r.resultHash !== i.resultHash) reasons.push("result hash differs");
  } catch (e) {
    reasons.push(`inputs could not be checked: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { ok: reasons.length === 0, reasons };
}
