import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { getDrawResult } from "@/domain/draws/queries";
import type { PublicInputs } from "@/crypto/verify";

// Public inputs of the current (non-voided) draw, consumed by scripts/verify-draw.ts.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const res = await db.transaction((tx) => getDrawResult(tx, id));
  if (!res) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body: PublicInputs = {
    breakId: id,
    version: res.draw.algorithmVersion,
    secret: res.draw.secret,
    beaconRound: res.draw.beaconRound,
    beaconRandomness: res.draw.beaconRandomness,
    entries: res.entries.map((e) => ({ number: e.number, ownerId: e.ownerId })),
    ranking: res.ranking,
    resultHash: res.draw.resultHash,
    seedCommitment: res.seedCommitment,
  };
  return NextResponse.json(body);
}
