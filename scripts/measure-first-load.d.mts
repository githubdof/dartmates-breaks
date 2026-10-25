export type Chunk = { file: string; gz: number; kind: "js" | "css" };
export type Measurement = {
  js: number;
  css: number;
  chunks: Chunk[];
  forbidden: { marker: string; file: string }[];
};
export function measureFirstLoad(o?: { dist?: string; route?: string; forbid?: string[] }): Measurement;
export function checkAgainstBase(
  m: { js: number },
  base: { js: number; allowanceJs: number },
): { ok: boolean; over: number };
