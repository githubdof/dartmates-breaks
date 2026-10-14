import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { getCaller } from "@/auth/session";
import { hashIp } from "@/lib/ip-hash";
import { ipBucket } from "@/lib/ip-bucket";
import { checkHandle } from "@/domain/users/handle-check";

const noStore = { "Cache-Control": "no-store" };

/** GET /api/handle?h=jim_r → { state: "free" | "taken" | "invalid" | "limited" }. Signed-in callers only; counted per IP (/64 for IPv6) hash and per user. */
export async function GET(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ state: "signed-out" }, { status: 401, headers: noStore });
  const raw = (req.nextUrl.searchParams.get("h") ?? "").slice(0, 64);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const r = await db.transaction((tx) => checkHandle(tx, { raw, callerId: caller.id, ipHash: ip ? hashIp(ipBucket(ip)) : null, now: new Date() }));
  if (r.state === "limited") {
    return NextResponse.json({ state: "limited" }, { status: 429, headers: { ...noStore, "Retry-After": String(r.retryAfter) } });
  }
  return NextResponse.json(r, { headers: noStore });
}
