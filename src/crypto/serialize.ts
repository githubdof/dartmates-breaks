export type Entry = { number: number; ownerId: string };

export function uuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) throw new Error(`invalid uuid: ${uuid}`);
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function uint16be(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0 || n > 0xffff) throw new Error(`number out of uint16 range: ${n}`);
  return new Uint8Array([n >> 8, n & 0xff]);
}

/** uint16be(number) ‖ uuid(ownerId), sorted by number. Handles are deliberately excluded. */
export function serializeEntries(entries: Entry[]): Uint8Array {
  const sorted = [...entries].sort((a, b) => a.number - b.number);
  const out = new Uint8Array(sorted.length * 18);
  sorted.forEach((e, i) => {
    out.set(uint16be(e.number), i * 18);
    out.set(uuidBytes(e.ownerId), i * 18 + 2);
  });
  return out;
}

export function serializeRanking(ranking: number[]): Uint8Array {
  const out = new Uint8Array(ranking.length * 2);
  ranking.forEach((n, i) => out.set(uint16be(n), i * 2));
  return out;
}
