import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { runTick } from "@/jobs/tick";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${env().CRON_SECRET}`;
  if (auth.length !== expected.length || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  const result = await runTick();
  console.log(JSON.stringify({ job: "tick", ms: Date.now() - started, result }));
  return NextResponse.json(result);
}
