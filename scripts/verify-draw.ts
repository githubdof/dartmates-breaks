// Usage: node --import tsx scripts/verify-draw.ts https://<host>/b/<id>/result.json
// Recomputes the draw from the published inputs. Prints OK or MISMATCH.
import { verifyInputs, type PublicInputs } from "../src/crypto/verify";

async function main(): Promise<number> {
  const url = process.argv[2];
  if (!url) {
    console.error("usage: node --import tsx scripts/verify-draw.ts https://<host>/b/<id>/result.json");
    return 2;
  }
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`could not fetch ${url}: HTTP ${res.status}`);
    return 2;
  }
  const inputs = (await res.json()) as PublicInputs;
  const r = verifyInputs(inputs);
  console.log(r.ok ? "OK — result matches the published inputs" : `MISMATCH: ${r.reasons.join("; ")}`);
  return r.ok ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e);
    process.exit(2);
  },
);
