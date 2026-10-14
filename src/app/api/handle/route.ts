import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { getCaller } from "@/auth/session";
import { requestIpHash } from "@/lib/request-ip";
import { checkHandle } from "@/domain/users/handle-check";

const noStore = { "Cache-Control": "no-store" };

/** GET /api/handle?h=jim_r → { state: "free" | "taken" | "invalid" | "limited" }. Signed-in callers only; counted per IP (/64 for IPv6) hash and per user. */
export async function GET(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ state: "signed-out" }, { status: 401, headers: noStore });
  // A suspended account is refused as every other action refuses it (assertOnboarded's copy).
  if (caller.banned) return NextResponse.json({ message: "This account is suspended" }, { status: 403, headers: noStore });
  const raw = (req.nextUrl.searchParams.get("h") ?? "").slice(0, 64);
  // Trusts the first x-forwarded-for entry: Vercel overwrites the header, so that is the client (see requestIpHash).
  const ipHash = requestIpHash(req.headers, { bucket: true }) ?? null;
  const r = await db.transaction((tx) => checkHandle(tx, { raw, callerId: caller.id, ipHash, now: new Date() }));
  if (r.state === "limited") {
    return NextResponse.json({ state: "limited" }, { status: 429, headers: { ...noStore, "Retry-After": String(r.retryAfter) } });
  }
  return NextResponse.json(r, { headers: noStore });
}
