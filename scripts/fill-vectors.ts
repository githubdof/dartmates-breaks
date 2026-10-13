import { readFileSync } from "node:fs";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils";
import { computeRanking, ALGORITHM_VERSION } from "../src/crypto/draw";

async function main(): Promise<void> {
  const v = JSON.parse(readFileSync("src/crypto/vectors.json", "utf8"));
  for (const x of v) {
    const r = computeRanking({ version: ALGORITHM_VERSION, secret: hexToBytes(x.secret), beacon: hexToBytes(x.beacon), breakId: x.breakId, entries: x.entries });
    x.seed = bytesToHex(r.seed); x.ranking = r.ranking; x.resultHash = r.resultHash;
  }
  console.log(JSON.stringify(v, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
