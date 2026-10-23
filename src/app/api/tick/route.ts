import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { runTick } from "@/jobs/tick";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  const result = await runTick();
  console.log(JSON.stringify({ job: "tick", ms: Date.now() - started, result }));
  return NextResponse.json(result);
}
