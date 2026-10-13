import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { getDrawResult } from "@/domain/draws/queries";
import { Reveal } from "./reveal";
import { Verify } from "./verify";
import { Share } from "./share";
import { QUICKNET } from "@/crypto/beacon";
import type { PublicInputs } from "@/crypto/verify";
import { env } from "@/lib/env";
import { isUuid } from "@/lib/is-uuid";

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const res = await db.transaction((tx) => getDrawResult(tx, id));
  if (!res) notFound();
  const handleOf = new Map(res.entries.map((e) => [e.number, e.handleAtDraw]));
  const publicInputs: PublicInputs = {
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
  const winnerLine = res.ranking[0];
  const shareText = `${res.breakTitle} — closed and drawn. Winner: @${handleOf.get(winnerLine)} (line ${winnerLine}). Check the draw: ${env().APP_URL}/b/${id}/result`;
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-semibold">{res.breakTitle} — result</h1>
      {res.draw.beaconSignature === "fake" && (
        <p role="alert" className="mt-2 rounded border border-red-600 bg-red-50 p-2 text-sm font-medium text-red-700">Fake beacon — development only</p>
      )}
      <Reveal ranking={res.ranking} handleOf={Object.fromEntries(handleOf)} awards={res.awards} />
      <p className="mt-2 text-xs text-neutral-600">
        Drawn {res.draw.createdAt.toLocaleString()} · Requested by @{res.hostHandle}
        {res.request.onBehalfNote ? ` (run by admin: ${res.request.onBehalfNote})` : ""}
      </p>
      <Verify inputs={publicInputs} />
      <Share text={shareText} />
      <details className="mt-4 text-xs">
        <summary className="cursor-pointer">Entries</summary>
        <ol className="mt-2 list-decimal pl-5">
          {res.entries.map((e) => (
            <li key={e.number}>Line {e.number}: {e.handleAtDraw}{e.isBonus ? " (bonus)" : ""}</li>
          ))}
        </ol>
      </details>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer">Technical details</summary>
        <dl className="mt-2 space-y-1 break-all">
          <dt>Commitment (shown before the break opened)</dt><dd><code>{res.seedCommitment}</code></dd>
          <dt>Revealed secret (base64)</dt><dd><code>{res.draw.secret}</code></dd>
          <dt>Beacon</dt>
          <dd>
            drand quicknet round {res.draw.beaconRound} —{" "}
            <a className="underline" href={`${QUICKNET.relays[0]}/${QUICKNET.chainHash}/public/${res.draw.beaconRound}`} target="_blank" rel="noreferrer">view on a public relay</a>
            <br /><code>{res.draw.beaconRandomness}</code>
          </dd>
          <dt>Seed</dt><dd><code>{res.draw.seed}</code></dd>
          <dt>Result hash</dt><dd><code>{res.draw.resultHash}</code></dd>
          <dt>Algorithm</dt>
          <dd>breaks-seed-v{res.draw.algorithmVersion}: HMAC-SHA256 stream, Fisher–Yates with rejection sampling. <Link className="underline" href="/legal/draw">How it works</Link></dd>
        </dl>
        <p className="mt-2">Machine-readable: <a className="underline" href={`/b/${id}/result.json`}>result.json</a></p>
      </details>
      {res.voided.length > 0 && (
        <p className="mt-4 text-xs text-amber-700">{res.voided.length} earlier draw(s) voided by admin — see technical details on each.</p>
      )}
    </main>
  );
}
