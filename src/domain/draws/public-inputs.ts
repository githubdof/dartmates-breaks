import type { draws } from "@/db/schema";
import type { PublicInputs } from "@/crypto/verify";

type DrawInputs = Pick<typeof draws.$inferSelect, "breakId" | "algorithmVersion" | "secret" | "beaconRound" | "beaconRandomness" | "entriesSnapshot" | "ranking" | "resultHash">;

/** A recorded draw as the result page and /result.json publish it: what verifyInputs checks. */
export function publicInputsOf(d: DrawInputs, seedCommitment: string | null): PublicInputs {
  return {
    breakId: d.breakId,
    version: d.algorithmVersion,
    secret: d.secret,
    beaconRound: d.beaconRound,
    beaconRandomness: d.beaconRandomness,
    entries: d.entriesSnapshot.map((e) => ({ number: e.number, ownerId: e.ownerId })),
    ranking: d.ranking,
    resultHash: d.resultHash,
    seedCommitment,
  };
}
