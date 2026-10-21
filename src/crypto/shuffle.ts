import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";

/** HMAC-SHA256(seed, uint32be(counter)) blocks, consumed as big-endian uint32 words. */
class WordStream {
  private counter = 0;
  private buf: Uint8Array = new Uint8Array(0);
  private pos = 0;
  constructor(private seed: Uint8Array) {}
  next(): number {
    if (this.pos >= this.buf.length) {
      const c = new Uint8Array(4);
      new DataView(c.buffer).setUint32(0, this.counter++, false);
      this.buf = hmac(sha256, this.seed, c);
      this.pos = 0;
    }
    const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 4).getUint32(0, false);
    this.pos += 4;
    return v;
  }
}

/** Fisher–Yates with rejection sampling: unbiased for every bound. Returns a permutation of 0..n-1. */
export function shuffle(seed: Uint8Array, n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  const ws = new WordStream(seed);
  for (let j = n - 1; j >= 1; j--) {
    const bound = j + 1;
    const limit = Math.floor(0x100000000 / bound) * bound; // largest multiple of bound ≤ 2^32
    let r: number;
    do r = ws.next(); while (r >= limit);
    const k = r % bound;
    [a[j], a[k]] = [a[k], a[j]];
  }
  return a;
}
