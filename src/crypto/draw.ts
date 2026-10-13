import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes, concatBytes } from "@noble/hashes/utils";
import { serializeEntries, serializeRanking, uuidBytes, type Entry } from "./serialize";
import { shuffle } from "./shuffle";

export const ALGORITHM_VERSION = 1;
const SEED_DOMAIN = utf8ToBytes("breaks-seed-v1");

export type DrawInput = { version: number; secret: Uint8Array; beacon: Uint8Array; breakId: string; entries: Entry[] };

export function deriveSeed(p: DrawInput): Uint8Array {
  const v = new Uint8Array([0, 0, 0, p.version]);
  return sha256(concatBytes(SEED_DOMAIN, v, p.secret, p.beacon, uuidBytes(p.breakId), sha256(serializeEntries(p.entries))));
}

export function computeRanking(p: DrawInput): { seed: Uint8Array; ranking: number[]; resultHash: string } {
  if (p.version !== ALGORITHM_VERSION) throw new Error(`unsupported algorithm version ${p.version}`);
  const sorted = [...p.entries].sort((a, b) => a.number - b.number);
  const seed = deriveSeed(p);
  const perm = shuffle(seed, sorted.length);
  const ranking = perm.map((i) => sorted[i].number);
  return { seed, ranking, resultHash: bytesToHex(sha256(serializeRanking(ranking))) };
}
