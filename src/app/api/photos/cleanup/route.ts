import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { runPhotoCleanup } from "@/jobs/photo-cleanup";
import { photoStorage } from "@/storage/photo-storage";

// GET /api/photos/cleanup: the daily photo cleanup (photos spec §5.6), run by Vercel Cron at 09:17 UTC.

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  const result = await runPhotoCleanup(photoStorage(), new Date());
  console.log(JSON.stringify({ job: "photo-cleanup", ms: Date.now() - started, result }));
  return NextResponse.json(result);
}
